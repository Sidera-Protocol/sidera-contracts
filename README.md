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

Current MVP: `register` / `resolve` / `set_address` / `transfer` /
`owner_of` plus reverse resolution through `primary_name` and
`set_primary_name`, with TTL-extend-on-write so long-held names never archive.
Next tranches: pricing & renewals, subnames, and broader SDK/indexer tooling.

## Documentation

| Document | Contents |
|---|---|
| [Project documentation hub](docs/README.md) | Repository map, deployment status, integration flow, and contributor starting points |
| [Resolver interface](docs/resolver-interface.md) | The contract every Sidera-compatible wallet and payment app codes against: `Resolution` shape, wallet memo rules, and reverse resolution |
| [Integration guide](docs/INTEGRATION.md) | How to integrate resolution into a wallet or payment app: the four rules, memo handling, and code snippets |
| [Changelog](CHANGELOG.md) | Notable changes per release (Keep a Changelog format) |
| [Known limitations](docs/KNOWN-LIMITATIONS.md) | Exactly what Sidera does and does not do yet |
| [Security policy](SECURITY.md) | Deployment status, vulnerability reporting, and scope notes |
| [Contributing guide](CONTRIBUTING.md) | Fork-first workflow, code standards, commit and PR conventions |
| [Issue templates](.github/ISSUE_TEMPLATE) | Bug reports and feature requests, each with acceptance criteria |

## Repository layout

```
contracts/registry   # Soroban name registry (Rust, no_std, SDK 27.x)
docs/                # Protocol docs and the resolver interface spec
../sidera-sdk        # TypeScript resolution SDK (separate repository)
```

## Testnet deployment proof

| Item | Value |
|---|---|
| Network | Stellar **Testnet** |
| Deployed | 2026-10-14 |
| Contract ID | `CCZJFYZSVMREA522JLNRBU4F4DRQFALDYM4JR7JBPNHY5NZOUWXWH7PC` |
| WASM sha256 | `a15727e6210c1f8dd4ffb0bf71cb26c64a735a1fcc0d4f63e0af9b340c0ed3e1` (17,362 bytes) |
| Live round-trip | register → resolve → address update → transfer → `set_primary_name` → `primary_name` confirmed via stellar-cli 28.0.0 |

Explorer: <https://lab.stellar.org/r/testnet/contract/CCZJFYZSVMREA522JLNRBU4F4DRQFALDYM4JR7JBPNHY5NZOUWXWH7PC>

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

# Regenerate the WASM provenance manifest (sha256 + git revision,
# verified by a clean rebuild):
scripts/provenance.sh build
```

CI enforces: **Rustfmt · lockfile check · Clippy (`-D warnings`) · Test ·
Docs · WASM size budget · Security Audit · Dependency Policy ·
Provenance** — all with `--locked` for reproducible builds.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
fork-first workflow, code standards, and PR process. Every issue carries
acceptance criteria and verification commands.

## License

MIT OR Apache-2.0
