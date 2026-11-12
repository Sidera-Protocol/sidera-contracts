# Contributing to Sidera SDK

Thank you for your interest in contributing! This document covers everything
you need for a first contribution.

## Code of Conduct

Be respectful, inclusive, and collaborative. Report unacceptable behavior to
the maintainers.

## How to contribute

1. **Pick a labeled issue** — issues tagged `external-contributors` are open
   to everyone. Comment with your proposed approach and **wait for
   assignment** before starting.
2. **Fork & branch** — fork the repo, then:
   ```bash
   git clone https://github.com/<your-user>/sidera-sdk.git
   cd sidera-sdk
   git remote add upstream https://github.com/Sidera-Protocol/sidera-sdk.git
   git checkout -b feat/my-feature upstream/main
   ```
3. **Develop** — keep the PR focused on one issue.
4. **Verify locally**:
   ```bash
   npm run lint   # tsc --noEmit (strict)
   npm test       # vitest
   npm run build  # tsup → dist/
   ```
5. **Open a PR** against `Sidera-Protocol/sidera-sdk:main` with
   `Closes #<issue-number>` in the description.

## Code standards

- **TypeScript strict mode** — no `any`, no non-null assertions unless justified
- **No unwrap-style blind calls** — handle errors with typed `SideraError` subclasses
- **Probe before guessing** — verify stellar-sdk API shapes from the installed
  `.d.ts` (see existing tests for real-xdr test fixtures)
- **Tests accompany every behavior change** — real xdr builders preferred over
  duck-typed mocks where practical
- **Breaking API changes** require an issue discussion first

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(client): add reverse resolution support`
- `fix(memo): handle 28-byte boundary correctly`
- `test(errors): cover unknown error codes`

## PR review

All CI checks (typecheck, tests, build) must pass. A human maintainer reviews
and merges — CI passing does not equal approval. Maintainers may request
changes; keep the scope tight and respond to feedback in new commits.

## Questions

Open a discussion issue with the `question` label before building large
unrequested features.
