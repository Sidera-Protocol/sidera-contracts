# Contributing to Sidera Dashboard

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
   git clone https://github.com/<your-user>/sidera-app.git
   cd sidera-app
   git remote add upstream https://github.com/Sidera-Protocol/sidera-app.git
   git checkout -b feat/my-feature upstream/main
   ```
3. **Develop** — keep the PR focused on one issue.
4. **Verify locally**:
   ```bash
   npm run lint    # tsc --noEmit (strict)
   npm run build   # next build must succeed
   ```
   For UI work, also `npm run dev` and check both `/` and `/dashboard` in
   demo mode (empty `NEXT_PUBLIC_SIDERIA_CONTRACT_ID`) **and** live mode.
5. **Open a PR** against `Sidera-Protocol/sidera-app:main` with
   `Closes #<issue-number>` in the description.

## Code standards

- **TypeScript strict mode** — no `any`; type all component props
- **Server/client boundary** — pages are `"use client"` only where they need
  state/effects; keep pure presentational components server-compatible
- **Accessibility** — every interactive element has a label; icon-only
  buttons need `aria-label`
- **Design tokens** — use the Tailwind palette in `tailwind.config.ts`
  (`space-*`, `star-*`), not raw hex values
- **Freighter calls live in `useWallet`** — components never import
  freighter-api directly
- **Breaking API changes** require an issue discussion first

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(search): add availability prefetch`
- `fix(navbar): correct network switch state`
- `style(card): tighten memo tag spacing`

## PR review

All CI checks (typecheck, build) must pass. A human maintainer reviews and
merges — CI passing does not equal approval. Maintainers may request
changes; keep the scope tight and respond to feedback in new commits.

## Questions

Open a discussion issue with the `question` label before building large
unrequested features.
