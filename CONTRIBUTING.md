# Contributing to Sidera Contracts

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
   git clone https://github.com/<your-user>/sidera-contracts.git
   cd sidera-contracts
   git remote add upstream https://github.com/Sidera-Protocol/sidera-contracts.git
   git checkout -b feat/my-feature upstream/main
   ```
3. **Develop** — keep the PR focused on one issue.
4. **Verify locally**:
   ```bash
   cargo fmt --all -- --check
   cargo clippy --workspace --all-targets --locked -- -D warnings
   cargo test  --workspace --all-targets --locked
   cargo build --locked --release --target wasm32v1-none -p sidera-registry
   ```
5. **Open a PR** against `Sidera-Protocol/sidera-contracts:main` with
   `Closes #<issue-number>` in the description.

## Code standards

- **`#![no_std]` contracts** — `extern crate std` only under `#[cfg(test)]`
- **Explicit authorization** — `Address::require_auth()` on every state
  change; permissionless entrypoints must be documented as deliberate
- **No `unwrap()`/`panic!()` in state handlers** — checked arithmetic and
  typed `#[contracterror]` enums only
- **TTL discipline** — every persistent write extends the entry's TTL;
  hot lookups extend too (see the registry's `extend_ttl` usage)
- **Tests accompany every behavior change** — authorization, edge cases,
  and TTL behavior included; see `contracts/registry/src/tests.rs` for the
  house pattern (including real `MockAuth` negative-authorization tests)
- **Storage changes** — new keys need a comment explaining their lifetime;
  instance storage only for small hot values (counters/config)
- **WASM budget** — keep the artifact small; `cargo build` for
  `wasm32v1-none` must succeed and CI reports the size

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(registry): add reverse resolution entrypoint`
- `fix(registry): reject names ending with a hyphen`
- `test(registry): cover transfer to self`

## PR review

All CI checks (fmt, clippy `-D warnings`, tests, WASM build) must pass.
Branch protection requires one approving review. A human maintainer reviews
and merges — CI passing does not equal approval.

## Security

**Do NOT open public issues for security vulnerabilities.** Use GitHub's
private vulnerability reporting on this repository.

## Questions

Open a discussion issue with the `question` label before building large
unrequested features.
