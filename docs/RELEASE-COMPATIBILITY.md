# Release and compatibility policy

Sidera is one protocol delivered through three repositories:

| Repository | Responsibility |
|---|---|
| `sidera-contracts` | Canonical Soroban registry state and ABI |
| `sidera-sdk` | Typed client, validation, decoding, and transaction helpers |
| `sidera-app` | User-facing dashboard and wallet integration |

The contract repository is the source of truth. A contract interface change is
not complete until the SDK and dashboard have either been updated or have
explicitly documented why they remain compatible.

## Compatibility rules

### Additive changes

New read-only entrypoints, events, or optional response fields may be released
as a minor version when:

- existing entrypoints retain their signatures and semantics;
- contract tests cover the new behavior;
- SDK decoding has fixtures for the new response or event shape;
- the dashboard continues to work against the previous supported contract;
- the integration and resolver documentation are updated.

### Breaking changes

Changing an entrypoint signature, error code, storage encoding, name rule,
memo interpretation, or authorization rule requires:

1. a design or discussion issue;
2. a migration note;
3. a new contract deployment and identifier;
4. coordinated SDK and dashboard changes;
5. a compatibility test against the previous release where practical.

Never silently reuse a deployed contract ID for an incompatible interface.

## Release checklist

Before tagging a release:

- [ ] `bash scripts/verify-suite.sh` passes
- [ ] Full suite passes with `SDK_DIR` and `APP_DIR` set to the sibling
      checkouts
- [ ] `cargo fmt --all -- --check`
- [ ] `cargo clippy --workspace --all-targets --locked -- -D warnings`
- [ ] `cargo test --workspace --all-targets --locked`
- [ ] `cargo doc --workspace --no-deps --locked` with warnings denied
- [ ] release WASM builds for `wasm32v1-none`
- [ ] WASM size and SHA-256 are recorded
- [ ] testnet smoke flow completes with a fresh receipt
- [ ] SDK tests and build pass against the contract interface
- [ ] dashboard typecheck and build pass with the SDK version being released
- [ ] README, resolver interface, integration guide, changelog, and known
      limitations agree about the implemented feature set
- [ ] deployment network and contract ID are recorded in all three repos
- [ ] security-sensitive changes have a maintainer review

## Version alignment

Each release announcement should name the compatible versions explicitly:

```text
contracts: vX.Y.Z
sdk:       vX.Y.Z
app:       vX.Y.Z
network:   testnet | mainnet
contract:  C...
```

The dashboard may support a newer SDK than the contract only when the SDK
preserves the older contract behavior. A dashboard must never imply that demo
data or a testnet deployment is production-ready.

## Deprecation policy

When an entrypoint or SDK method is superseded:

- document the replacement and removal target;
- keep the old path working for at least one published release when feasible;
- add a deprecation warning in the SDK or documentation;
- remove it only through the breaking-change process.

## Evidence standard

Every release claim must be backed by one of:

- a passing command listed in this policy;
- a linked testnet transaction or explorer record;
- a committed artifact hash or receipt;
- a test fixture that reproduces the behavior.

If a claim cannot be independently checked, describe it as planned rather than
implemented.
