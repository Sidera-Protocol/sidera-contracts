# Drips appeal package

## Project

Sidera Protocol — Stellar name resolution with memo-safe payment hints and
reverse resolution.

Repository: <https://github.com/Sidera-Protocol/sidera-contracts>

The appeal should present one bounded flagship: the contract → SDK → dashboard
path for `.sid` resolution. Pricing, renewals, subnames, indexing, and
mainnet deployment remain explicitly out of scope.

## Evidence completed

| Evidence | Result |
|---|---|
| Contract feature merged to local `main` | `d33697c` |
| SDK reverse-resolution commit | `06b8e87` |
| Dashboard reverse-resolution commit | `68abed1` |
| Contract tests | 41 passed |
| SDK tests | 39 passed |
| SDK typecheck and build | passed |
| Dashboard typecheck | passed |
| Dashboard production build | passed with Next webpack backend |
| Release WASM | 17,362 bytes; SHA-256 `a15727e6210c1f8dd4ffb0bf71cb26c64a735a1fcc0d4f63e0af9b340c0ed3e1` |
| Cross-repository verification | contract and SDK stages passed; default dashboard Turbopack backend is sandbox-blocked, webpack build passed |

The reproducible commands are documented in
[`docs/DEVELOPMENT.md`](DEVELOPMENT.md), and the coordinated verification is
[`scripts/verify-suite.sh`](../scripts/verify-suite.sh).

## Product claim

Sidera lets a wallet resolve a `.sid` name to an address and optional memo
hint, then set and read an address's preferred display name. The SDK exposes
typed `primaryName(address)` and `setPrimaryName(address, name)` methods. The
dashboard supports the same flow in demo mode and through Freighter in live
mode.

## Requested tranche

Fund a focused maintenance tranche for:

1. a reproducible testnet deployment and end-to-end receipt;
2. SDK packaging and a small integration example for memo-safe payments;
3. dashboard usability and wallet error handling;
4. contributor-ready fixtures and compatibility checks.

The request should be framed around shipped, reviewable increments rather than
an expansive protocol roadmap. Every issue should include acceptance criteria,
verification commands, and a clear contract/SDK/dashboard dependency.

## Honest limitations

- The current documented testnet deployment predates reverse resolution and
  must not be presented as evidence for this release.
- No fresh testnet receipt is committed yet because a deployment identity was
  not selected for this run. Complete [`testnet-smoke-receipt.template.json`](testnet-smoke-receipt.template.json)
  with caller-supplied testnet credentials and transaction links.
- The project is testnet-only, unaudited, and has no mainnet deployment.
- Demo-mode dashboard data is local browser state and is not on-chain.

## Submission checklist

- [x] Contract, SDK, and dashboard changes are committed locally.
- [x] Full local contract/SDK verification evidence is recorded above.
- [x] Appeal narrative is bounded to the flagship path.
- [ ] Push the three default branches and link the resulting commits.
- [ ] Deploy the merged contract with a caller-selected testnet identity.
- [ ] Run the complete smoke path and replace the receipt template.
- [ ] Add deployment, transaction, explorer, and final WASM links.
- [ ] Confirm the current Drips Wave application window and submit through
      the authenticated maintainer flow.

Drips maintainer onboarding and repository application guidance:
<https://docs.drips.network/wave/maintainers/participating-in-a-wave/>

The current Stellar Wave page is:
<https://www.drips.network/wave/stellar>
