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

## Proof at a glance

| Item | Value |
|---|---|
| Network | Stellar **Testnet** |
| Deployed | 2026-09-24 |
| Contract ID | `CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ` |
| WASM sha256 | see `provenance` after CI run — artifact `sidera_registry.wasm` (11,061 bytes) |
| Live round-trip | `register("sidera")` → `total_names()=1` → `owner_of` → `resolve` all confirmed via stellar-cli 28.0.0 |
| Deployer | `grantfox-arbiter` testnet identity |

Explorer: <https://stellar.expert/explorer/testnet/contract/CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ>

## Contributing

Contributions welcome via **Drips Wave** and **GrantFox** — see the issue
ladder on this repo and `CONTRIBUTING.md`. Fork-first workflow; every
issue carries acceptance criteria and verification commands.

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
