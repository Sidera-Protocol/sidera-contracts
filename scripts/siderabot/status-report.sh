#!/usr/bin/env bash
#
# SideraBot — pull-request status reporter.
#
# SideraBot is Sidera's own repository automation. It is not a GitHub App and
# not affiliated with any third-party program. It consumes the results of the
# repository's EXISTING CI workflow (.github/workflows/ci.yml) and keeps
# exactly ONE sticky comment per pull request up to date.
#
# It never approves a pull request, never merges, never enables auto-merge,
# and never touches issues, labels, assignments, or repository settings.
#
# Normally invoked by .github/workflows/siderabot.yml. See docs/SIDERABOT.md.
#
# Environment:
#   GH_TOKEN               required  token with pull-requests:write, statuses:write
#   SIDERABOT_REPO         required  owner/repo
#   SIDERABOT_RUN_ID       required  the completed `CI` workflow run to report on
#   SIDERABOT_LOGIN        optional  comment author to update (default: github-actions[bot])
#   SIDERABOT_BASE_BRANCH  optional  base branch (default: main)
#   SIDERABOT_CI_WORKFLOW  optional  CI workflow file name (default: ci.yml)
#   SIDERABOT_DRY_RUN      optional  set to 1 to print the comment instead of posting
#
# Exit codes: 0 = handled or deliberately skipped (never a SideraBot failure of
# the PR), 1 = SideraBot could not run (tooling/API problem).

set -euo pipefail

MARKER='<!-- siderabot:status -->'
STATUS_CONTEXT='SideraBot / ready-for-review'

log() { printf 'siderabot: %s\n' "$*"; }
warn() { printf '::warning::siderabot: %s\n' "$*" >&2; }
fail() {
  printf '::error::siderabot: %s\n' "$*" >&2
  exit 1
}

: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${SIDERABOT_REPO:?SIDERABOT_REPO must be set}"
: "${SIDERABOT_RUN_ID:?SIDERABOT_RUN_ID must be set}"

# The run ID reaches the API path verbatim, so constrain it before anything else.
# (It is normally a GitHub-generated integer, but workflow_dispatch accepts a
# typed string, and input must never be interpolated into a path unchecked.)
[[ "$SIDERABOT_RUN_ID" =~ ^[0-9]+$ ]] \
  || fail "SIDERABOT_RUN_ID must be a numeric workflow run ID, got: ${SIDERABOT_RUN_ID}"

SIDERABOT_LOGIN="${SIDERABOT_LOGIN:-github-actions[bot]}"
SIDERABOT_BASE_BRANCH="${SIDERABOT_BASE_BRANCH:-main}"
SIDERABOT_CI_WORKFLOW="${SIDERABOT_CI_WORKFLOW:-ci.yml}"
SIDERABOT_DRY_RUN="${SIDERABOT_DRY_RUN:-0}"

API="repos/${SIDERABOT_REPO}"

for tool in gh jq; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required but was not found on PATH"
done

# ---------------------------------------------------------------------------
# 1. Resolve the CI run and check that it is a pull-request run.
# ---------------------------------------------------------------------------
run_json=$(gh api "${API}/actions/runs/${SIDERABOT_RUN_ID}") \
  || fail "cannot read workflow run ${SIDERABOT_RUN_ID}"

run_event=$(jq -r '.event // ""' <<<"$run_json")
run_conclusion=$(jq -r '.conclusion // ""' <<<"$run_json")
run_url=$(jq -r '.html_url // ""' <<<"$run_json")
head_sha=$(jq -r '.head_sha // ""' <<<"$run_json")
head_branch=$(jq -r '.head_branch // ""' <<<"$run_json")
head_owner=$(jq -r '.head_repository.owner.login // ""' <<<"$run_json")
pr_from_run=$(jq -r '.pull_requests[0].number // empty' <<<"$run_json" 2>/dev/null || true)

if [[ "$run_event" != "pull_request" ]]; then
  log "run ${SIDERABOT_RUN_ID} event is '${run_event}', not a pull_request run — nothing to report."
  exit 0
fi

if [[ "$run_conclusion" == "cancelled" ]]; then
  # A cancelled run is not a verdict: it is usually superseded or cancelled by a
  # maintainer. Stay quiet so contributors are not pinged with a false failure.
  log "run ${SIDERABOT_RUN_ID} was cancelled — staying quiet (no stale report)."
  exit 0
fi

[[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || fail "run ${SIDERABOT_RUN_ID} has no usable head SHA"

# ---------------------------------------------------------------------------
# 2. Resolve the pull request for this run.
# ---------------------------------------------------------------------------
pr_number="$pr_from_run"

if [[ -z "$pr_number" && -n "$head_owner" && -n "$head_branch" ]]; then
  # workflow_run payloads do not always carry pull_requests for fork heads;
  # look the PR up by head owner/branch instead.
  pr_number=$(gh api -X GET "${API}/pulls" \
    -f state=open \
    -f "head=${head_owner}:${head_branch}" \
    -f "base=${SIDERABOT_BASE_BRANCH}" \
    --jq '.[0].number // empty' 2>/dev/null || true)
fi

if [[ ! "$pr_number" =~ ^[0-9]+$ ]]; then
  log "no open pull request found for ${head_owner:-?}:${head_branch:-?} — nothing to report."
  exit 0
fi

# ---------------------------------------------------------------------------
# 3. Ignore superseded runs so the sticky comment never goes stale.
# ---------------------------------------------------------------------------
latest_run_id=$(gh api -X GET "${API}/actions/workflows/${SIDERABOT_CI_WORKFLOW}/runs" \
  -f "head_sha=${head_sha}" -f per_page=1 -f sort=created -f direction=desc \
  --jq '.workflow_runs[0].id // empty' 2>/dev/null || true)

if [[ -n "$latest_run_id" && "$latest_run_id" != "$SIDERABOT_RUN_ID" ]]; then
  log "run ${SIDERABOT_RUN_ID} was superseded by run ${latest_run_id} — skipping stale report."
  exit 0
fi

# ---------------------------------------------------------------------------
# 4. Collect the check results from the existing CI workflow.
# ---------------------------------------------------------------------------
jobs_json=$(gh api -X GET "${API}/actions/runs/${SIDERABOT_RUN_ID}/jobs" -f per_page=100) \
  || fail "cannot list jobs for run ${SIDERABOT_RUN_ID}"

total_count=$(jq '(.jobs // []) | length' <<<"$jobs_json")
not_passed=$(jq -c '[.jobs[]? | select((.conclusion // "pending") as $c
  | ($c != "success" and $c != "skipped" and $c != "neutral"))]' <<<"$jobs_json")
not_passed_count=$(jq 'length' <<<"$not_passed")
passed_count=$((total_count - not_passed_count))

failed_lines=$(jq -r '.[] | "- `\(.name)` — \(.conclusion // "pending")"' <<<"$not_passed")

# ---------------------------------------------------------------------------
# 5. Pull request metadata.
# ---------------------------------------------------------------------------
pr_json=$(gh api "${API}/pulls/${pr_number}") || fail "cannot read pull request #${pr_number}"
is_draft=$(jq -r '.draft // false' <<<"$pr_json")
pr_author=$(jq -r '.user.login // "unknown"' <<<"$pr_json")
pr_url=$(jq -r '.html_url // ""' <<<"$pr_json")

# ---------------------------------------------------------------------------
# 6. Flag infrastructure files that always deserve maintainer scrutiny.
#    This is advisory only — SideraBot never blocks a PR by itself.
# ---------------------------------------------------------------------------
changed_files=$(gh api -X GET "${API}/pulls/${pr_number}/files" \
  -f per_page=100 --paginate --slurp 2>/dev/null \
  | jq -r '.[][]? | (.filename // empty)' 2>/dev/null || true)

sensitive_lines=""
while IFS= read -r changed; do
  [[ -z "$changed" ]] && continue
  case "$changed" in
    .github/workflows/*|.github/CODEOWNERS|.github/ISSUE_TEMPLATE/*|.github/PULL_REQUEST_TEMPLATE.md|scripts/siderabot/*|SECURITY.md)
      sensitive_lines+="- \`${changed}\`"$'\n'
      ;;
  esac
done <<<"$changed_files"

# ---------------------------------------------------------------------------
# 7. Compose the result summary.
# ---------------------------------------------------------------------------
if [[ "$not_passed_count" -eq 0 ]]; then
  result_emoji="✅"
  if [[ "$is_draft" == "true" ]]; then
    result_title="All CI checks passed — draft PR, mark it ready for review when you are done"
    status_state="pending"
    status_desc="CI passed; pull request is still a draft"
  else
    result_title="All CI checks passed — ready for maintainer review"
    status_state="success"
    status_desc="All CI checks passed; awaiting human maintainer review"
  fi
else
  result_emoji="❌"
  result_title="${not_passed_count} of ${total_count} checks need attention — this PR is not ready to merge yet"
  status_state="failure"
  status_desc="${not_passed_count} of ${total_count} CI checks did not pass"
fi

short_sha="${head_sha:0:7}"
body_file=$(mktemp)
trap 'rm -f "$body_file"' EXIT

{
  printf '%s\n' "$MARKER"
  printf '## %s SideraBot — CI status\n\n' "$result_emoji"
  printf '**%s**\n\n' "$result_title"
  printf -- '- Run: [CI #%s](%s)\n' "$SIDERABOT_RUN_ID" "$run_url"
  printf -- '- Commit: `%s`\n' "$short_sha"
  printf -- '- Checks: %s/%s passed\n' "$passed_count" "$total_count"
  printf -- '- Author: @%s\n\n' "$pr_author"

  if [[ "$is_draft" == "true" ]]; then
    printf 'This pull request is currently a **draft**, so it is not yet queued for maintainer review.\n\n'
  fi

  if [[ "$not_passed_count" -gt 0 ]]; then
    printf '### Checks that need attention\n\n%s\n\n' "$failed_lines"
    cat <<'EOF'
### Next steps

Fix or re-run the failing checks above, then push to the same branch. SideraBot
**updates this comment in place** — it does not post a new one on every push.

Reproduce the required checks locally before pushing again:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --all-targets --locked
RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps --locked --document-private-items
cargo build --locked --release --target wasm32v1-none -p sidera-registry
```

The WASM build must stay within the 32,768-byte budget enforced in
`.github/workflows/ci.yml` (raise it deliberately, in a reviewed PR).

EOF
    cat <<'EOF'

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and
[docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md) for documented caveats.

EOF
  else
    cat <<'EOF'
### What happens next

- All automated checks in the existing CI workflow passed.
- This pull request is now **eligible for human maintainer/CODEOWNER review**.
- SideraBot does **not** approve and does **not** merge. A required approval from
  a human maintainer is still needed before this PR can be merged.

Note: Dependency Policy and Provenance Manifest run as separate pull-request
workflows and are reported by their own checks; Security Audit runs on a
weekly schedule rather than on pull requests.

EOF
  fi

  if [[ -n "$sensitive_lines" ]]; then
    cat <<'EOF'
### Maintainer attention

This pull request changes repository automation or security configuration:

EOF
    printf '%s\n' "$sensitive_lines"
    cat <<'EOF'

These paths are not blocked by SideraBot, but they should not be merged without
explicit maintainer sign-off.

EOF
  fi

  cat <<'EOF'
---

<sub>**SideraBot** is Sidera's own pull-request automation, executed as the
GitHub Actions identity `github-actions[bot]`. It reports CI results only: it
never reviews, approves, or merges, never enables auto-merge, and never
modifies issues, labels, assignments, CODEOWNERS, or repository settings.
Report SideraBot problems to the maintainers; see
[docs/SIDERABOT.md](docs/SIDERABOT.md).</sub>
EOF
} > "$body_file"

if [[ "$SIDERABOT_DRY_RUN" == "1" ]]; then
  log "dry run: comment body for PR #${pr_number} (state would be ${status_state}):"
  cat "$body_file"
  exit 0
fi

# ---------------------------------------------------------------------------
# 8. Upsert the single sticky comment (prevents duplicate bot comments).
# ---------------------------------------------------------------------------
comments=$(gh api -X GET "${API}/issues/${pr_number}/comments" \
  -f per_page=100 --paginate --slurp 2>/dev/null || printf '[]')

existing_id=$(jq -r --arg login "$SIDERABOT_LOGIN" --arg marker "$MARKER" \
  '[.[]? | .[]? | select((.user.login // "") == $login
     and ((.body // "") | contains($marker)))] | (last // {}) | (.id // empty)' \
  <<<"$comments" 2>/dev/null || true)

if [[ -n "$existing_id" ]]; then
  gh api -X PATCH "${API}/issues/comments/${existing_id}" -F "body=@${body_file}" >/dev/null \
    || fail "failed to update SideraBot comment ${existing_id}"
  log "updated sticky comment ${existing_id} on PR #${pr_number} (${status_state})."
else
  gh api -X POST "${API}/issues/${pr_number}/comments" -F "body=@${body_file}" >/dev/null \
    || fail "failed to create SideraBot comment on PR #${pr_number}"
  log "created sticky comment on PR #${pr_number} (${status_state})."
fi

# ---------------------------------------------------------------------------
# 9. Publish the informational commit status.
#    It is a signal only; branch protection still requires human review.
# ---------------------------------------------------------------------------
if gh api -X POST "${API}/statuses/${head_sha}" \
  -f state="$status_state" \
  -f context="$STATUS_CONTEXT" \
  -f description="$status_desc" >/dev/null 2>&1; then
  log "commit status '${STATUS_CONTEXT}' set to '${status_state}' on ${short_sha}."
else
  warn "could not publish commit status on ${short_sha} (informational only; comment already posted)."
fi
