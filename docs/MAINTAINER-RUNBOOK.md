# Maintainer runbook

This runbook keeps Sidera operable when the primary maintainer is unavailable.
It is intentionally procedural: every action should leave an auditable commit,
issue, release, or deployment record.

## Routine maintenance

### Weekly

- review open issues and stale pull requests;
- confirm the default branch is green;
- check dependency and security alerts;
- review pending contributor assignments;
- update the roadmap when scope changes.

### Before a release

1. Confirm the contract, SDK, and dashboard changes are compatible.
2. Run `bash scripts/verify-suite.sh` with the local SDK and app paths.
3. Run the testnet smoke flow using caller-provided identities.
4. Record the contract ID, network, WASM hash, transaction links, and tool
   versions.
5. Update the changelog, limitations, integration guide, and compatibility
   policy.
6. Open a release pull request and obtain an approving review.
7. Tag the release only after CI is green.

Never deploy or tag from a dirty working tree.

## Security response

Security reports must use GitHub private vulnerability reporting as described
in `SECURITY.md`.

When a report arrives:

1. acknowledge receipt within seven days;
2. preserve the report and avoid discussing details publicly;
3. reproduce the issue in a local test or isolated testnet deployment;
4. assess whether the deployed contract or only unreleased code is affected;
5. prepare a fix, regression test, and mitigation notice;
6. coordinate disclosure timing with the reporter;
7. document the resolution without exposing private report contents.

If a deployed contract cannot be safely fixed in place, publish a clear
contract status notice and migration plan before directing users to a new
deployment.

## Maintainer handoff

A second maintainer should be able to perform a release using only:

- repository access and branch-protection permissions;
- the documented Stellar CLI version;
- testnet identities supplied by the operator;
- the release and compatibility checklist;
- the security policy and incident contacts.

Private keys must never be stored in the repository, CI logs, issue comments,
or release artifacts. Testnet identities should be funded and supplied at run
time by the operator.

Before granting elevated access, the new maintainer should demonstrate:

- one reviewed bug fix;
- one successful local verification run;
- one issue-triage or contributor-review cycle;
- understanding of the deployment and rollback boundaries.

## Incident record

For every production-relevant incident, create a private or public record as
appropriate containing:

- date and affected release or contract;
- observed behavior and impact;
- detection source;
- mitigation and commands used;
- follow-up issue;
- owner and due date.

Do not hide uncertainty. If the impact or affected deployments are unknown,
record that explicitly and update the record as evidence arrives.

## Scope discipline

Do not expand the protocol surface while a release has unresolved compatibility,
security, or deployment-proof gaps. Stabilize the contract → SDK → dashboard
path first; then schedule pricing, renewals, subnames, indexing, or mainnet
work as separately reviewed tranches.
