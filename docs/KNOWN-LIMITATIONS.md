# Known Limitations

An explicit list of what Sidera does **not** do yet. Everything here is a
deliberate scope cut for the Day-1 MVP tranche, tracked for later tranches —
not a hidden gap.

## Deployment

- **Testnet only.** No mainnet deployment exists. Do not send real funds
  based on name resolution until a mainnet deployment is announced in
  [SECURITY.md](../SECURITY.md) and the README.

## Registry semantics

- **No pricing or renewals.** Registration is free and first-come-
  first-served. Names stay alive through write-time and hot-lookup TTL
  extensions; a name that is neither written nor resolved for the extension
  horizon will eventually archive.
- **No subnames.** Only second-level names under `.sid` can be registered;
  `pay.alice.sid` is not a thing yet.
- **No reverse resolution.** `primary_name(address)` is specified in the
  [resolver interface](resolver-interface.md) but not implemented.
- **Unilateral transfer.** `transfer` moves ownership without the
  recipient's acceptance, matching DNS/ENS convention. There is no
  escrowed or two-phase transfer.
- **No expiration clock surface.** The contract exposes no query for a
  name's remaining TTL; wallets and explorers cannot show "expires in N
  days."

## Tooling

- **No TypeScript SDK yet.** `packages/ts-sdk` is a planned tranche; the
  resolver interface spec is the contract wallets code against in the
  meantime.
- **No indexer.** There is no off-chain index of registrations; all reads
  go through the contract.

## Process

- **Not independently audited.** The contract has not had a third-party
  security review. CI (fmt, clippy `-D warnings`, tests, dependency
  audit/policy, provenance) raises the floor but is not a substitute for
  an audit.
