# Development and release checks

## Contract checks

From the repository root:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --all-targets --locked
cargo build --locked --release --target wasm32v1-none -p sidera-registry
```

## Full suite verification

From the contracts checkout, run the contract checks plus the local SDK and
dashboard checks with one command:

```bash
SDK_DIR=../sidera-sdk APP_DIR=../sidera-app bash scripts/verify-suite.sh
```

Leaving either variable unset intentionally runs only the contract checks and
prints which repository was skipped.

The contract build must use the pinned lockfile and the `wasm32v1-none`
target. Changes to storage, authorization, name validation, TTL behavior, or
resolver output should include focused tests.

## SDK checks

From `sidera-sdk`:

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

The SDK should be checked whenever the contract interface, error codes,
resolution shape, memo rules, or transaction parameters change.

## Dashboard checks

From `sidera-app`:

```bash
npm install
npm run lint
npm run build
```

For wallet or network changes, also verify the testnet flow manually with a
non-production account. Keep `NEXT_PUBLIC_SIDERIA_CONTRACT_ID` and
`NEXT_PUBLIC_SIDERIA_NETWORK` aligned with the documented deployment.

## Release checklist

- Confirm the contract ID and network in the relevant README files.
- Rebuild the contract from a clean checkout and record the WASM hash.
- Run contract, SDK, and dashboard checks.
- Review memo-hint handling and authorization behavior.
- Update known limitations and migration notes when behavior changes.
- Announce mainnet separately; never infer mainnet readiness from testnet CI.
