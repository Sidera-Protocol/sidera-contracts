# Pull Request Template

## Description

Summary of the change and which issue it closes.

Closes #

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)
- [ ] Test addition or modification
- [ ] CI/CD or build system change

## Checklist

- [ ] `cargo fmt --all` has been run
- [ ] `cargo clippy --workspace --all-targets --locked -- -D warnings` passes
- [ ] `cargo test --workspace --all-targets --locked` passes
- [ ] Tests accompany every behavior change (authorization, edge cases, TTL behavior)
- [ ] WASM artifact size impact noted, if dependencies or handlers changed
- [ ] Documentation updated, if applicable
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

## Contract Changes (if applicable)

- [ ] Entry point signatures are backward-compatible, or the ABI change is called out in the description
- [ ] New storage keys document their lifetime (persistent vs instance) and TTL behavior
- [ ] Every state change requires authorization; permissionless entry points are deliberate and documented
- [ ] No `unwrap()`/`panic!()` in state handlers — checked arithmetic and typed `#[contracterror]` only

## Resolution Safety (registry-specific)

- [ ] Name validation behavior unchanged, or changes are covered by tests
- [ ] Memo hints round-trip exactly (a lost or altered memo is the #1 fund-loss class)
- [ ] Every persistent write still extends TTL
