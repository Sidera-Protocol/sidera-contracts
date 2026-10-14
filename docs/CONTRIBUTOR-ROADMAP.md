# Contributor roadmap

This roadmap turns Sidera's next milestones into independently reviewable
tasks. Every task should become a GitHub issue with one owner, one outcome,
acceptance criteria, and verification commands.

## Tranche 1 — compatible core release

These tasks should be completed before expanding protocol scope.

### 1. SDK reverse-resolution parity

**Repository:** `sidera-sdk`  
**Depends on:** deployed registry ABI and contract tests  
**Outcome:** SDK consumers can call `primaryName(address)` and
`setPrimaryName(address, name)`.

**Acceptance criteria**

- exported typed methods and result types exist;
- names are normalized with the same rules as the contract;
- `NotFound` maps to the existing typed error model;
- authorization and malformed-response cases are tested;
- README and API documentation include both methods;
- `npm run lint`, `npm test`, and `npm run build` pass.

### 2. Dashboard primary-name flow

**Repository:** `sidera-app`  
**Depends on:** SDK reverse-resolution parity  
**Outcome:** a connected wallet can view and set its preferred `.sid` name.

**Acceptance criteria**

- live mode reads the primary name from the registry;
- the form validates names before signing;
- wallet/network/transaction errors are visible and recoverable;
- demo mode is clearly marked and does not imply an on-chain write;
- the resolved primary name displays the configured network and contract;
- `npm run lint` and `npm run build` pass.

### 3. End-to-end testnet smoke receipt

**Repository:** `sidera-contracts`  
**Depends on:** stable contract ABI  
**Outcome:** a clean checkout can verify the complete protocol path.

**Acceptance criteria**

- dry-run mode requires no credentials;
- live mode accepts caller-provided identities only;
- the flow covers register, resolve, address update, transfer, and reverse
  resolution;
- successful transaction hashes and event names are recorded in JSON;
- the receipt records network, contract ID, WASM hash, and tool versions;
- secrets are never generated, printed, or committed;
- the README links the command and an example receipt shape.

## Tranche 2 — integration and discovery

### 4. Memo-safe payment example

**Repository:** `sidera-sdk` or a dedicated example package  
**Outcome:** a Stellar payment integration demonstrates that a required memo
cannot be silently dropped.

**Acceptance criteria**

- a resolved memo becomes the correct Stellar memo type;
- unsupported or oversized memo values fail before submission;
- the example displays the destination address and memo for confirmation;
- tests cover text, numeric, absent, and invalid memo hints.

### 5. Event and resolution fixtures

**Repository:** `sidera-contracts`  
**Outcome:** downstream indexers and SDK maintainers have stable fixtures for
registry events and resolution responses.

**Acceptance criteria**

- fixtures cover registration, address update, transfer, and primary-name set;
- fixture documentation identifies the network and contract ABI version;
- a test fails if event topics or payload ordering changes unexpectedly.

### 6. Integration quickstart

**Repository:** documentation hub  
**Outcome:** a Stellar developer can resolve a `.sid` name in under ten
minutes from a clean checkout.

**Acceptance criteria**

- prerequisites and versions are pinned;
- testnet contract configuration is copyable;
- the quickstart includes expected output and a troubleshooting section;
- every command works without private keys for read-only resolution.

## Tranche 3 — operational resilience

### 7. Release compatibility check

Add an automated check that compares the contract ABI, SDK fixtures, and
dashboard's configured SDK version before a release is tagged.

### 8. Maintainer handoff runbook

Document deployment ownership, security response, release signing, issue
triage, and the steps required for a second maintainer to perform a release.

### 9. External integration pilot

Record one genuine Stellar integration attempt, including the integration
surface, testnet result, limitations discovered, and maintainer feedback.

## Issue quality standard

Every contributor issue must include:

- the user or developer problem;
- one bounded outcome;
- files or repositories likely to change;
- acceptance criteria;
- exact verification commands;
- dependencies and compatibility risks;
- whether the task is safe for an external contributor.

Do not create issues whose only acceptance criterion is “make it better.”
