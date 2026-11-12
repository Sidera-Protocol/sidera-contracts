# Known Limitations

An explicit list of what Sidera does **not** do yet. Everything here is a
deliberate scope cut for the Day-1 MVP tranche, tracked for later tranches —
not a hidden gap.

## Deployment

- **Testnet only.** No mainnet deployment exists. Do not send real funds
  based on name resolution until a mainnet deployment is announced in
  [SECURITY.md](../SECURITY.md) and the README.

## Registry semantics

- **Pricing is admin-controlled, without a timelock.** The admin can change
  yearly prices and the treasury address at any time (each change emits an
  event). Existing registrations keep their expiry; new prices apply to the
  next registration or renewal.
- **Payments go straight to one treasury address.** There is no refund,
  revenue split or on-chain accounting beyond the token transfer and the
  `registered` / `renewed` events.
- **The testnet prices are demo values** (50 / 10 / 2 XLM per year). Real
  prices are a decision for the mainnet launch.
- **Storage can outlive its TTL less than the registration.** Paid writes
  extend a name's entries to the network's maximum TTL, which can be shorter
  than a 10-year registration. If a name is neither renewed, updated nor
  resolved for that long, its entries archive and must be restored (a
  standard Soroban restore) before use. The registration itself is not lost.
- **No subnames.** Only second-level names under `.sid` can be registered;
  `pay.alice.sid` is not a thing yet.
- **Unilateral transfer.** `transfer` moves ownership without the
  recipient's acceptance, matching DNS/ENS convention. There is no
  escrowed or two-phase transfer.

## Tooling

- **The SDK is not published to npm yet.** It lives in `packages/sdk` and the
  dashboard uses it through npm workspaces.
- **No indexer.** There is no off-chain index of registrations; all reads
  go through the contract.

## Process

- **Not independently audited.** The contract has not had a third-party
  security review. CI (fmt, clippy `-D warnings`, tests, dependency
  audit/policy, provenance) raises the floor but is not a substitute for
  an audit.
