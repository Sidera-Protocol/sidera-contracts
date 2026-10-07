# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
