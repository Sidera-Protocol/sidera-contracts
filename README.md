# Sidera Protocol

**Stellar Name Service — send payments to `alice.sid`, not to a checksum.**

Sidera maps human-readable names to Stellar addresses (G- and M-keys) with
**mandatory-capable memo hints**, so exchange payments stop getting lost and
wallets stop asking users to paste 56 characters.

## Why Stellar needs this

- Every mature chain converged on a name service (ENS, SNS, ANS). Stellar —
  the payments chain — has none.
- Stellar adds two failure modes Ethereum doesn't have: **memos** (required
  by exchanges, lost = lost funds) and **muxed addresses**. Sidera treats the
  memo hint as a first-class part of resolution.

## Repository layout

```
contracts/registry   # Soroban name registry (Rust, no_std, SDK 27.x)
packages/ts-sdk      # TypeScript resolution SDK for wallets & payment apps
docs/                # Protocol docs and the resolver interface spec
```

## Status

Day-1 MVP: `register` / `resolve` / `set_address` / `transfer` /
`owner_of` with TTL-extend-on-write so long-held names never archive.
Next tranches: pricing & renewals, reverse resolution, subnames, TS SDK.

## Development

```bash
rustup target add wasm32v1-none

cargo build --workspace --all-targets --locked
cargo test  --workspace --all-targets --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
```

## License

MIT OR Apache-2.0
