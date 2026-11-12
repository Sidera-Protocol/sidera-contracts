# Sidera Protocol

**Stellar Name Service — send payments to `alice.sid`, not to a checksum.**

Sidera maps human-readable names to Stellar addresses (G- and M-keys) with
**mandatory-capable memo hints**, so exchange payments stop getting lost and
wallets stop asking users to paste 56 characters.

## Why Sidera

Stellar already has a general naming protocol, [Soroban Domains](https://sorobandomains.org)
(`alice.xlm`). Sidera is narrower: it is built around one problem, **paying
the right account with the right memo**, and makes the memo part of every
resolution.

- Exchanges and custodians on Stellar receive deposits on one shared account
  and tell customers apart by **memo**. Send without it and the funds are
  stuck or lost. Sidera stores the memo the destination requires as part of
  the name, so `alice.sid` resolves to *address + memo* in one call.
- **Muxed (M-) addresses** resolve the same way, so wallets never have to ask
  users for a 56-character key and a memo separately.
- The [resolver interface](docs/resolver-interface.md) defines exactly how a
  wallet must use the result: when a name carries a memo, attach it or stop
  and warn the user, never send without it. Integrations behave the same
  everywhere.

## Status

| Part | What works today |
|---|---|
| Registry contract (`contracts/registry`) | `register`, `resolve`, `set_address`, `transfer`, `owner_of`, `exists`, `total_names`, reverse resolution (`primary_name`, `set_primary_name`), TTL extension on write. Deployed on testnet. |
| TypeScript SDK (`packages/sdk`) | Forward and reverse resolution, registration and updates through the contract, Protocol 23 RPC decoding. |
| Dashboard (`apps/dashboard`) | Search, resolve and claim `.sid` names with Freighter; set a primary name. |

Not built yet (see [known limitations](docs/KNOWN-LIMITATIONS.md)): pricing and
renewals, subnames, expiry queries, an indexer, and an independent audit.

## Documentation

| Document | Contents |
|---|---|
| [Project documentation hub](docs/README.md) | Repository map, deployment status, integration flow, and contributor starting points |
| [Resolver interface](docs/resolver-interface.md) | The contract every Sidera-compatible wallet and payment app codes against: `Resolution` shape, wallet memo rules, and reverse resolution |
| [Integration guide](docs/INTEGRATION.md) | How to integrate resolution into a wallet or payment app: the four rules, memo handling, and code snippets |
| [SDK API reference](packages/sdk/docs/API.md) | Every SDK method and type |
| [Dashboard troubleshooting](apps/dashboard/docs/TROUBLESHOOTING.md) | Wallet, network and RPC problems when running the dashboard |
| [Changelog](CHANGELOG.md) | Notable changes per release (Keep a Changelog format) |
| [Known limitations](docs/KNOWN-LIMITATIONS.md) | Exactly what Sidera does and does not do yet |
| [Security policy](SECURITY.md) | Deployment status, vulnerability reporting, and scope notes |
| [Contributing guide](CONTRIBUTING.md) | Fork-first workflow, code standards, commit and PR conventions |
| [Issue templates](.github/ISSUE_TEMPLATE) | Bug reports and feature requests, each with acceptance criteria |

## Repository layout

```
contracts/registry   # Soroban name registry (Rust, no_std, soroban-sdk 27)
packages/sdk         # TypeScript SDK: @sidera-protocol/sdk
apps/dashboard       # Next.js dashboard for searching, resolving and claiming names
docs/                # Protocol docs, resolver interface, integration guide
```

The SDK, dashboard and contracts used to live in three repositories
(`sidera-sdk`, `sidera-app`, `sidera-contracts`). They now share one
repository, history included, so a contract change, its SDK support and its
dashboard screen land in the same pull request.

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

Contracts (Rust):

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

SDK and dashboard (Node 20+, npm workspaces):

```bash
npm ci --ignore-scripts
npm test                                  # SDK tests
npm run build                             # SDK, then the dashboard that uses it
npm run dev -w @sidera-protocol/app       # dashboard on http://localhost:3000
```

CI enforces: **Repo hygiene · Rustfmt · lockfile check · Clippy (`-D warnings`) ·
Test · Docs · WASM size budget · SDK typecheck, tests and build · Dashboard
typecheck and build · Security Audit · Dependency Policy · Provenance**.

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
fork-first workflow, code standards, and PR process. Every issue carries
acceptance criteria and verification commands.

## License

MIT. See [LICENSE](LICENSE).
