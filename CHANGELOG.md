# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Pay by name:** the SDK's `buildPayment` turns a resolved name into an
  unsigned Stellar payment with the destination and the memo already set, so
  a wallet cannot forget the memo. The dashboard has a **Send** page: look up
  a name, see the address and the memo that will be attached, and pay with
  Freighter. It refuses unknown, expired and invalid names, and resolves the
  name again right before sending, stopping if anything changed. Proven on
  testnet: `docs/pay-by-name-receipt.json`.
- SDK error `InvalidMemo` (contract code 11) and `MemoTooLong`.
- **Each owner's names on-chain:** `names_of(owner)` lists the names an owner
  holds with their expiry (at most 100 per owner). SDK: `namesOf`. The
  dashboard's "my names" now reads it, so it works from any device instead of
  only the browser that registered the names.
- **Admin upgrades:** `upgrade(wasm_hash)` replaces the contract code and keeps
  the contract ID and every name. Proven on testnet: a non-admin upgrade was
  refused, and all state survived an admin upgrade.
- **Testnet deployment** `CD4YE4ERU37U5KQU3QCJJGIKUSES6QXA6WNLIMORRBY62RD37SC6FGUT`
  (supersedes `CASYF…ZTNIT`); receipt in `docs/testnet-smoke-receipt.json`.
- Property test P5: owner lists always match who holds what.
- **Paid registration, renewal and expiry.** Names are registered for 1–10
  years and paid in a SEP-41 token to a treasury, at a yearly price by name
  length. Expired names stop resolving; for 30 days only renewal is possible,
  then the name is released. Anyone may pay for a renewal. New contract calls:
  `renew`, `expires_at`, `is_available`, `price`, `config`, and admin-only
  `set_prices`, `set_treasury`, `set_admin`. New events: `renewed`,
  `prices_set`, `treasury_set`, `admin_set`; `registered` now carries
  `expires_at`.
- **SDK:** `register` takes `years` and returns `{ hash, expiresAt }`; new
  `renew`, `expiresAt`, `isAvailable`, `price`, `config` and `NameExpiredError`.
- **Dashboard:** choose 1–10 years at the live on-chain price, see when names
  expire, renew owned names, and see expired names in search.
- **Testnet deployment** `CASYFSPSR5FOG4CQVUSJ44WYDWOTYD764GWLSMS2GQZIKFRH3ZBZTNIT`,
  exercised end to end through the SDK; see `docs/testnet-smoke-receipt.json`.
- Property test P4: payments always balance and expiry stays within 10 years.

### Fixed
- **Memos that cannot be sent are refused when stored.** `register` and
  `set_address` now reject a memo that is empty or longer than 28 bytes (the
  size of a Stellar text memo) with `InvalidMemo`. Before, such a memo was
  stored and wallets either cut it short or failed at payment time, so a
  deposit could reach an exchange with the wrong memo. Shipped to the testnet
  contract with `upgrade` (WASM `a80a047aa9e7…`); existing names kept.
- **The SDK sends memos exactly as stored.** It no longer trims spaces or
  cuts text memos to fit, keeps leading zeros (`007` goes as text), and sends
  numbers too large for a memo ID as text. A memo it cannot send exactly
  raises `MemoTooLong` instead.
- Property test P6: only memos of 1–28 bytes are ever stored.

### Changed
- **One repository.** `sidera-sdk` and `sidera-app` were merged into this
  repository (`packages/sdk`, `apps/dashboard`) with their history; it is now
  `Sidera-Protocol/sidera-protocol`. The repository bots moved out.
- Contract WASM budget in CI raised to 48 KiB (39,829 bytes; 31,244 optimized).

### Fixed
- The SDK decoded every list as an optional value and kept only the first
  item, so multi-name results would have been cut to one.
- Transferring a name to oneself dropped it from the owner's list (found by
  P5 before release).
- **Primary-name spoofing:** `set_primary_name` accepted any name, so an
  address could display a name it did not own. It now requires the name to be
  active, owned by the address and resolving to it, and `primary_name` stops
  returning a name that no longer matches.
- **SDK writes never reached the chain:** `Option<String>` was encoded as a
  vector (rejected by the contract), and transactions were sent without being
  prepared or confirmed.
- **Dashboard registration was a placeholder** that reported success without
  sending a transaction.

### Added (earlier)
- **Reverse resolution**: addresses can set and query a preferred primary
  name through `set_primary_name` and `primary_name`, with owner
  authorization, TTL handling, events, and focused tests.
- **Reverse-resolution testnet deployment**: the updated registry is live at
  `CCZJFYZSVMREA522JLNRBU4F4DRQFALDYM4JR7JBPNHY5NZOUWXWH7PC`; see the
  committed smoke receipt for transaction links and the WASM hash.
- **Contract events**: the registry now emits `registered`, `address_set`, and
  `transferred` events (topics: event symbol + name), so indexers, wallets, and
  explorers can observe registry state changes without polling contract
  storage. Emission is covered by dedicated tests.
- [Integration guide](docs/INTEGRATION.md) for wallets and payment apps:
  the four resolution rules, memo handling, and a TypeScript snippet.
- **SideraBot** (`scripts/siderabot/` + `.github/workflows/siderabot.yml`):
  pull-request CI status reporter — one sticky comment per PR plus an
  informational `SideraBot / ready-for-review` commit status. It never
  approves or merges.
- Release workflow (`.github/workflows/release.yml`): builds the registry
  WASM on `v*` tags, records SHA-256 checksums, and attaches artifacts to a
  draft GitHub release.
- CI now also runs on pushes to `develop`, the integration branch for
  work-in-progress branches with failing checks.
- Branch protection on `main`: the five CI checks plus Dependency Policy and
  Provenance Manifest are required, with one approving review.

## [0.1.0] - 2026-09-24

### Added
- Initial `sidera-registry` Soroban contract (SDK 27): `register`, `resolve`,
  `set_address`, `transfer`, `owner_of`, `exists`, `total_names`, with
  TTL-extend-on-write so long-held names never archive.
- Memo hints as first-class resolution data: `Resolution { address, memo }`.
- Name validation: 3–32 chars of `a-z`, `0-9`, and interior hyphens.
- Test suite: unit tests covering the authorization and ownership model,
  duplicate rejection, name validation boundaries, and TTL extension, plus
  property-based invariants (valid names round-trip, arbitrary names never
  panic or half-register, duplicates never overwrite, memo exactness, and an
  ownership mirror model).
- CI gates: rustfmt, clippy (`-D warnings`), tests, rustdoc (`-D warnings`),
  WASM build with a 32,768-byte size budget, dependency policy
  (`cargo-deny` sources and bans), and a provenance manifest that must
  reproduce from a clean rebuild.
- Testnet deployment (2026-09-24): contract
  `CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ`.
