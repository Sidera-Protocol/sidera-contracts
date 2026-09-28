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

## Status

Day-1 MVP: `register` / `resolve` / `set_address` / `transfer` /
`owner_of` with TTL-extend-on-write so long-held names never archive.
Next tranches: pricing & renewals, reverse resolution, subnames, TS SDK.

## Documentation

| Document | Contents |
|---|---|
| [Resolver interface](docs/resolver-interface.md) | The contract every Sidera-compatible wallet and payment app codes against: `Resolution` shape, wallet memo rules, planned reverse resolution |
| [Security policy](SECURITY.md) | Deployment status, vulnerability reporting, and scope notes |
| [Contributing guide](CONTRIBUTING.md) | Fork-first workflow, code standards, commit and PR conventions |
| [Issue templates](.github/ISSUE_TEMPLATE) | Bug reports and feature requests, each with acceptance criteria |

## Repository layout

```
contracts/registry   # Soroban name registry (Rust, no_std, SDK 27.x)
docs/                # Protocol docs and the resolver interface spec
packages/ts-sdk      # TypeScript resolution SDK (planned)
```

## Testnet deployment proof

| Item | Value |
|---|---|
| Network | Stellar **Testnet** |
| Deployed | 2026-09-24 |
| Contract ID | `CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ` |
| WASM sha256 | see `provenance` after CI run — artifact `sidera_registry.wasm` (11,061 bytes) |
| Live round-trip | `register("sidera")` → `total_names()=1` → `owner_of` → `resolve` all confirmed via stellar-cli 28.0.0 |

Explorer: <https://stellar.expert/explorer/testnet/contract/CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ>

> The registry is deployed on **Stellar testnet only** — no mainnet
> deployment exists. Do not send real funds based on name resolution until a
> mainnet deployment is announced here and in [SECURITY.md](SECURITY.md).

## Development

```bash
rustup target add wasm32v1-none

cargo build --workspace --all-targets --locked
cargo test  --workspace --all-targets --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
```

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
fork-first workflow, code standards, and PR process. Every issue carries
acceptance criteria and verification commands.

## License

MIT OR Apache-2.0
