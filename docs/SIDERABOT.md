# SideraBot

**SideraBot is Sidera's own repository automation.** It is not a GitHub App, not
an official bot of any third-party program, and it has no relationship to any
external campaign infrastructure beyond helping this repository's contributors.

SideraBot is the pull-request automation for this repository. It exists so that
contributors get fast, actionable feedback from the checks that **already** run
in CI, and so that maintainers can see at a glance whether a pull request is
ready for human review.

SideraBot is implemented entirely with GitHub-native automation (GitHub Actions,
the repository's `GITHUB_TOKEN`, and the GitHub REST API). There is no separate
GitHub account and no GitHub App.

---

## Purpose

- Surface the results of the existing CI workflow on every pull request.
- Explain *which* check failed and point the contributor at the fix.
- Give a concise, non-binding "ready for review" signal once CI is green.
- Keep the number of bot comments to **one per pull request** — it is updated in
  place, never re-posted.

SideraBot does not add new required checks. It reports the checks the repository
already defines.

## Contributor pull request flow

```
Contributor opens / updates a PR
        |
        v
Existing CI runs (.github/workflows/ci.yml)
        |
        v
SideraBot reads the finished CI run and updates the single sticky comment
        |
        v
SideraBot publishes the informational commit status "SideraBot / ready-for-review"
        |
        v
Required human / CODEOWNER review
        |
        v
All required checks + required approvals satisfied -> PR is eligible for merge
        |
        v
GitHub native Auto-Merge may complete the merge (if enabled) — SideraBot never merges
```

SideraBot never replaces, and cannot replace, human maintainer review.

## What SideraBot checks

SideraBot runs **no checks of its own**. It reads the job results of the
existing `CI` workflow (`.github/workflows/ci.yml`) and reports them:

| CI job | Check name on a PR |
| --- | --- |
| `fmt` | Rustfmt |
| `clippy` | Clippy |
| `test` | Test |
| `doc` | Docs |
| `wasm-build` | WASM Build |

Other automated workflows in this repository are **not** part of the report:

- `Dependency Policy` (`.github/workflows/dependency-policy.yml`) and
  `Provenance Manifest` (`.github/workflows/provenance.yml`) also run on pull
  requests, as separate checks — their results appear on the PR directly.
- `Security Audit` (`.github/workflows/audit.yml`) runs on a weekly schedule,
  not on pull requests.

It also flags, as **advisory only**, pull requests that touch repository
automation or security configuration, which should always get explicit
maintainer sign-off:

- `.github/workflows/*`
- `.github/CODEOWNERS`
- `.github/ISSUE_TEMPLATE/*`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `scripts/siderabot/*`
- `SECURITY.md`

## What SideraBot can do

- React to pull-request CI runs (opened, reopened, new commits pushed, draft
  marked ready for review — anything that produces a CI run for the PR).
- Create **and update** one comment per pull request, identified by the hidden
  marker `<!-- siderabot:status -->`.
- Publish the informational commit status `SideraBot / ready-for-review`
  (`success`, `failure`, or `pending` for drafts).
- Ignore superseded CI runs so the comment never reports stale results.
- Stay silent on cancelled CI runs so contributors are not pinged with a false
  failure.
- Be re-run manually with `workflow_dispatch` for a specific CI run ID.

## What SideraBot cannot do

SideraBot has **no** ability to:

- approve, dismiss, or request changes on a pull request;
- merge a pull request, or enable/disable Auto-Merge on it;
- bypass or edit branch protection, rulesets, required reviews, or required
  status checks;
- modify CODEOWNERS, issue templates, labels, assignments, or repository
  settings;
- change contract deployment or network configuration in any way;
- request or use any secret other than the automatic `GITHUB_TOKEN`.

SideraBot cannot approve, so it can never satisfy a required review. Its commit
status is **informational by design** and should not be added to required status
checks: the required checks are the existing CI jobs, which are what actually
determine whether a change passes automated validation. Keeping SideraBot
non-required means a transient bot/API problem can never block a valid PR.

## Human review requirements

Human review stays mandatory and is unchanged by SideraBot:

- `.github/CODEOWNERS` defines the required reviewers for this repository.
- Branch protection on `main` should require at least one approving review for
  contributor pull requests.
- CODEOWNER review, branch protection, required reviews, and required status
  checks are **not** modified by SideraBot.
- SideraBot's comment and commit status are informational; they are never a
  substitute for an approval.

## Permissions

SideraBot requests the smallest permission set that makes it work. The workflow
sets `permissions: {}` at the top level (deny by default) and grants only these
scopes to its single job:

| Permission | Level | Why |
| --- | --- | --- |
| `contents` | read | read the default branch to run the reporter script |
| `actions` | read | read the finished CI run and its job conclusions |
| `pull-requests` | write | create/update the sticky comment on the PR |
| `statuses` | write | publish the informational SideraBot commit status |

It does **not** use `write-all`, does not use `contents: write`, does not use
`issues: write`, and does not use any repository secret. The only credential is
the automatic `${{ secrets.GITHUB_TOKEN }}`, which is scoped to this repository
and expires with the job. No secret is printed to the logs.

## Security model

- **Trigger:** the workflow runs on `workflow_run` (CI completed) plus manual
  `workflow_dispatch`. It deliberately does **not** use `pull_request_target`.
- **No untrusted code execution:** the job checks out the **default branch only**
  and never the pull request head, so contributor-controlled code is never run
  with repository write credentials.
- **Fork PRs:** for pull requests from forks, the `pull_request` CI run has a
  read-only token, while the `workflow_run` job runs in the base repository with
  its narrow write scopes. Contributor code is still never executed there.
- **Secrets:** no repository secrets are available to, or required by, the job.
- **Input validation:** the run ID, head SHA, and pull request number are
  validated before they are used in API paths; API responses are parsed with
  `jq` rather than shell-evaluated.
- **Comment ownership:** SideraBot only updates comments authored by
  `SIDERABOT_LOGIN` (`github-actions[bot]`) that carry its own marker, so it
  cannot be tricked into editing a contributor's comment.
- **Credentials:** `persist-credentials: false` on checkout; nothing is pushed.

## Bot identity

The automation is called **SideraBot**. Because it is implemented with GitHub
Actions, the GitHub account that authors the comment is
**`github-actions[bot]`**, not a dedicated "SideraBot" account. This is stated
honestly in the comment footer: SideraBot is the *automation*, and
`github-actions[bot]` is the *identity executing it*.

Creating a dedicated GitHub App would require manual external setup
(account/App creation, private key storage as a secret, installation on the
repository). Nothing in this repository does that automatically, and it is not
required for SideraBot to work. If a dedicated App identity is ever wanted, the
only change needed here is `SIDERABOT_LOGIN` in
`.github/workflows/siderabot.yml` and a token-issuing step.

## How maintainers can disable or tune SideraBot

- **Disable completely:** delete `.github/workflows/siderabot.yml`, or disable
  the workflow in **Actions → SideraBot → "…" → Disable workflow** (this setting
  lives in GitHub, not in the repository).
- **Stop reporting on pushes only:** no change needed — pushes to `main` are
  already filtered out.
- **Pause for a specific PR:** no per-PR switch exists by design. Remove the
  sticky comment and disable the workflow if it must be silenced.
- **Re-run for a run:** **Actions → SideraBot → Run workflow** with a `run_id`.
- **Remove the commit status:** delete the "Publish the informational commit
  status" block in `scripts/siderabot/status-report.sh` step 9.
- **Change wording/protected paths:** edit `scripts/siderabot/status-report.sh`
  (tuning) and `.github/workflows/siderabot.yml` (permissions, triggers).

## Manual GitHub settings required

Repository files cannot configure everything. These settings live in the GitHub
UI and must be set (or verified) by a maintainer. Each is optional except where
noted:

| Setting | Where | Required value | Why |
| --- | --- | --- | --- |
| Actions workflow permissions | Settings → Actions → General → Workflow permissions | "Read repository contents and packages permissions" (or "Read and write" with the workflow's own `permissions:` block kept in place) | Ensures the default token is not broader than SideraBot's explicit scopes |
| Branch protection / ruleset on `main` | Settings → Branches (or Rules → Rulesets) | Require a pull request before merging; required approvals ≥ 1; require review from CODEOWNERS if desired; require status checks = the existing CI checks | Guarantees human review and keeps SideraBot informational |
| Required status checks | Settings → Branches → required checks | The five existing CI checks only: Rustfmt, Clippy, Test, Docs, WASM Build. **Do not** make `SideraBot / ready-for-review` a required check | Auto-merge only completes when required checks pass; leaving SideraBot informational means a transient bot/API hiccup cannot block an otherwise valid PR |
| Allow Auto-Merge | Settings → General → Pull Requests → "Allow auto-merge" | Maintainers' choice | Lets GitHub complete the merge once required reviews **and** required checks are satisfied |

Until these manual settings are verified, SideraBot will still comment on pull
requests, but the repository is not fully gated: Auto-Merge and required-check
gating depend on the branch protection configuration, which only exists in
GitHub.

> Note: `workflow_run`-triggered workflows only fire once
> `.github/workflows/siderabot.yml` exists on the **default branch**. Until this
> change is pushed to `main`, SideraBot does not run at all.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| No SideraBot comment on a PR | The workflow file is not on the default branch yet | Push `.github/workflows/siderabot.yml` to `main` |
| No comment, CI green | The CI run was cancelled, or a newer run superseded it | Re-run the `SideraBot` workflow with the CI `run_id` |
| Comment never appears for a fork PR | The fork PR's CI run has not been approved/executed yet | Approve the workflow run as a maintainer |
| Duplicate comments | A maintainer/contributor deleted the marker, so the sticky comment could not be found | Delete the extras; SideraBot will keep one going forward |
| `could not publish commit status` warning | The status was rejected (e.g. token scope or SHA state) | The comment is still posted; check the run logs — status is informational only |
| Comment is stale | CI is still running for the newest commit | SideraBot updates the comment when that run completes |
| SideraBot noise on every push | Should not happen: one comment per PR, updated in place | Verify the marker `<!-- siderabot:status -->` is present in the comment |

## Files

| File | Role |
| --- | --- |
| `.github/workflows/siderabot.yml` | SideraBot workflow (trigger, permissions, job) |
| `scripts/siderabot/status-report.sh` | Report logic (fetch CI results, upsert comment, publish status) |
| `docs/SIDERABOT.md` | This document |
