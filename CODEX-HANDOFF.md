# Sidera Protocol work handoff

## Objective

Make Sidera sustainable and ready for a strong Drips appeal by improving the
contract, SDK, dashboard, contributor workflow, and release evidence.

## Repositories

- Contracts: `/home/meethybrid/Desktop/sidera`
- SDK: `/home/meethybrid/Desktop/sidera-sdk`
- Dashboard: `/home/meethybrid/Desktop/sidera-app`
- Reference project: `/home/meethybrid/Desktop/soroban-forge`

The SDK and dashboard are on `main` and track the Sidera Protocol GitHub
repositories. The `/home/meethybrid/Desktop/Sidera-Protocol/` copies are on a
documentation branch and should not be used for implementation.

## Completed in contracts repository

- Reverse-resolution contract implementation exists on the feature branch.
- Contract suite passes 41 tests.
- README and documentation status was aligned with reverse resolution.
- Added `docs/RELEASE-COMPATIBILITY.md`.
- Added `docs/CONTRIBUTOR-ROADMAP.md`.
- Added `docs/MAINTAINER-RUNBOOK.md`.
- Added `.github/ISSUE_TEMPLATE/wave_task.md`.
- Added `scripts/verify-suite.sh`.
- Contract-only verification passes: format, Clippy, tests, and rustdoc.

## Important current gaps

- Reverse-resolution work is not yet merged into contracts `main`.
- The SDK now provides `primaryName(address)` and `setPrimaryName(...)`, with
  tests and documentation.
- The dashboard now displays and updates primary names in demo/live modes,
  including Freighter signing.
- The obsolete dashboard `src/lib/sdk-shim.ts` has been removed.
- Full cross-repository smoke verification is not yet implemented.
- No final appeal should be submitted until improvements are merged and visible
  on the default branches.

## Next implementation

1. Merge the contract reverse-resolution branch and the SDK/app changes into
   their default branches.
2. Run:

```bash
SDK_DIR=/home/meethybrid/Desktop/sidera-sdk \
APP_DIR=/home/meethybrid/Desktop/sidera-app \
bash /home/meethybrid/Desktop/sidera/scripts/verify-suite.sh
```

4. Merge and release the coordinated changes, then add the testnet evidence and
   prepare the Drips appeal.

## Reference lesson

`soroban-forge` was useful because of its proof package: flagship-first scope,
reproducible testnet evidence, explicit limitations, contributor-ready issues,
and release discipline. Stars and forks are not treated as requirements.
