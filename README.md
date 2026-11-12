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
| Registry contract (`contracts/registry`) | Yearly registration paid in a SEP-41 token (price by name length), `renew` (anyone may pay), expiry with a 30-day grace period, `resolve` with memo hints, `set_address`, `transfer`, verified primary names (`set_primary_name` / `primary_name`), admin-set prices and treasury. Deployed on testnet. |
| TypeScript SDK (`packages/sdk`) | Every contract call, including `register` (with years), `renew`, `expiresAt`, `price`, `isAvailable` and `config`. Writes are simulated, signed, submitted and confirmed; proven end to end on testnet. |
| Dashboard (`apps/dashboard`) | Search and resolve names, see when they expire, register with Freighter for 1–10 years at the live on-chain price, renew, and set a primary name. |

Not built yet (see [known limitations](docs/KNOWN-LIMITATIONS.md)): subnames, an
indexer, a mainnet deployment and an independent audit.

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
(`sidera-sdk`, `sidera-app`, `sidera-contracts`). They now share this one
repository, history included, so a contract change, its SDK support and its
dashboard screen land in the same pull request.

## Testnet deployment proof

| Item | Value |
|---|---|
| Network | Stellar **Testnet** |
| Deployed | 2026-11-12 (pricing, renewals and expiry) |
| Contract ID | `CASYFSPSR5FOG4CQVUSJ44WYDWOTYD764GWLSMS2GQZIKFRH3ZBZTNIT` |
| WASM sha256 | `a7fbcce4832820080099e0e9fe4e69f8ef1d6cac084a0b0dd9ad455b478e34fb` (31,244 bytes, `stellar contract optimize` of revision `ec3300d`) |
| Payment | Native XLM; 50 / 10 / 2 XLM per year for 3 / 4 / 5+ character names (testnet demo prices) |
| Live round-trip | Through the SDK: register for 2 years (treasury received 4 XLM) → resolve with memo → renewal paid by another account (+2 XLM, owner unchanged) → primary name → an impostor's primary-name claim refused → duplicate registration refused |

Every transaction is linked in the [smoke receipt](docs/testnet-smoke-receipt.json).
Explorer: <https://lab.stellar.org/r/testnet/contract/CASYFSPSR5FOG4CQVUSJ44WYDWOTYD764GWLSMS2GQZIKFRH3ZBZTNIT>

The earlier free-registration deployment (`CCZJ…H7PC`, 2026-10-14) is recorded
in [its own receipt](docs/testnet-smoke-receipt-2026-10-14.json).

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
