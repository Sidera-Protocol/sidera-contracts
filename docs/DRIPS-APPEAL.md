# Drips appeal package

## Appeal context

On 12 October 2026, Drips notified the maintainer that these three repos were
not approved for the Stellar Wave Program:

- `Sidera-Protocol/sidera-contracts`
- `Sidera-Protocol/sidera-sdk`
- `Sidera-Protocol/sidera-app`

The notice says repos are assessed for Stellar relevance using factors
including past repository and hackathon activity, code and documentation
substance, maintainer activity in the ecosystem, and the Wave Terms & Rules.
It also says an appeal should wait two weeks and is unlikely to succeed unless
significant improvements are made in the meantime. This package is therefore
an evidence-led draft for the appeal window, not a submission yet.

## What changed after rejection

### 1. The project now has a clearer, shipped flagship

The three repos are presented as one coherent product surface:

```text
Soroban registry contract → typed TypeScript SDK → wallet-connected dashboard
```

The flagship is `.sid` name resolution with memo-safe payment hints and
reverse resolution. Pricing, renewals, subnames, indexing, and mainnet remain
explicitly out of scope rather than being presented as implemented features.

### 2. Contracts: deeper protocol implementation and tests

After the rejection, the contracts repo added and merged reverse resolution:

- `primary_name(address)` reads an address's preferred name;
- `set_primary_name(address, name)` requires address authorization;
- names are validated and normalized using the contract rules;
- TTL behavior and cache invalidation are covered;
- `primary_name_set` events are emitted;
- authorization, missing-name, overwrite, invalid-name, and forward/reverse
  separation cases are tested.

The work is merged into local contracts `main` at `d33697c`, with 41 contract
tests passing. Release and compatibility policy, a maintainer runbook,
contributor roadmap, issue template, and a coordinated verification script
were also added.

### 3. SDK: contract parity and live-chain correctness

The SDK now exposes:

- `primaryName(address)`;
- `setPrimaryName(address, name)`.

The SDK changes include XDR serialization tests, name normalization, typed
not-found error mapping, and write-path coverage. The existing live-chain
decoder work handles Symbol keys, enum tags, and Stellar addresses. SDK
verification currently passes with 39 tests, typecheck, and production build.
The SDK change is committed at `06b8e87`.

### 4. Dashboard: usable demo and live flows

The dashboard now:

- displays a wallet's preferred primary name;
- lets a connected wallet update it through Freighter signing;
- uses the SDK methods instead of a local SDK shim;
- keeps demo mode local and clearly separate from on-chain writes;
- retains the existing live testnet resolution and registration path;
- removes the obsolete `src/lib/sdk-shim.ts`.

The dashboard change is committed at `68abed1`. Typecheck passes and the
production build passes using Next's webpack backend.

### 5. Maintainer and contributor readiness

The contracts repo now documents:

- the contract/SDK/dashboard compatibility rules;
- exact local verification commands;
- release and handoff procedures;
- known limitations and deployment boundaries;
- bounded contributor tasks with acceptance criteria and verification steps.

This turns the project from a collection of repos into a reviewable,
maintainable release path.

## Evidence summary

| Evidence | Result |
|---|---|
| Contract feature merged locally | `d33697c` |
| SDK reverse-resolution commit | `06b8e87` |
| Dashboard reverse-resolution commit | `68abed1` |
| Contract tests | 41 passed |
| SDK tests | 39 passed |
| SDK typecheck and build | passed |
| Dashboard typecheck | passed |
| Dashboard production build | passed with webpack backend |
| Release WASM | 17,362 bytes |
| WASM SHA-256 | `a15727e6210c1f8dd4ffb0bf71cb26c64a735a1fcc0d4f63e0af9b340c0ed3e1` |

The reproducible commands are in [`docs/DEVELOPMENT.md`](DEVELOPMENT.md), and
the coordinated checks are in [`scripts/verify-suite.sh`](../scripts/verify-suite.sh).

## Requested Wave scope

The appeal should request a focused maintenance tranche for:

1. a reproducible reverse-resolution testnet deployment and end-to-end receipt;
2. SDK packaging and a small memo-safe payment integration example;
3. dashboard usability and wallet error handling;
4. contributor-ready fixtures and compatibility checks.

Each proposed issue will have one outcome, acceptance criteria, verification
commands, and an explicit contract/SDK/dashboard dependency.

## Remaining work before submission

- Push the three local `main` branches through reviewed pull requests.
- [x] Deploy the merged contract with the selected `grantfox-arbiter` testnet
  identity.
- [x] Run register, resolve, address update, transfer, `set_primary_name`, and
  `primary_name` against that deployment.
- [x] Add the complete [testnet smoke receipt](testnet-smoke-receipt.json)
  containing transaction hashes, event names, contract ID, WASM hash, and
  tool versions.
- [x] Add deployment and explorer links.
- [ ] Push the three reviewed PRs through maintainer approval and merge.
- Submit only through the official Drips appeals form after the two-week wait.

The currently documented testnet contract predates reverse resolution and must
not be used as evidence for this appeal. The project remains testnet-only,
unaudited, and without a mainnet deployment; demo-mode data is local browser
state, not on-chain state.

Drips maintainer guidance:
<https://docs.drips.network/wave/maintainers/participating-in-a-wave/>

Stellar Wave:
<https://www.drips.network/wave/stellar>
