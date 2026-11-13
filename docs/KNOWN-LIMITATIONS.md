# Known Limitations

An explicit list of what Sidera does **not** do yet. Everything here is a
deliberate scope cut for the Day-1 MVP tranche, tracked for later tranches —
not a hidden gap.

## Deployment

- **Testnet only.** No mainnet deployment exists. Do not send real funds
  based on name resolution until a mainnet deployment is announced in
  [SECURITY.md](../SECURITY.md) and the README.

## Registry semantics

- **The admin can upgrade the contract.** `upgrade` replaces the code while
  keeping the contract ID and every name. This is a trust assumption: on
  mainnet the admin should be a multisig or governance contract, and
  upgrades should be announced in advance.

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
- **The memo type is inferred, not stored.** A memo is stored as text, and
  wallets send digits (no leading zero, fits a u64) as `MEMO_ID` and anything
  else as `MEMO_TEXT`. An exchange that expects a numeric memo as
  `MEMO_TEXT` cannot say so yet. `MEMO_HASH` and `MEMO_RETURN` are not
  supported.
- **Subnames are one level deep and belong to the parent's owner.**
  `pay.alice` works; `a.pay.alice` does not. A subname has no owner of its
  own: whoever owns `alice` can change or delete `pay.alice` at any time, and
  a new owner of `alice` (after a transfer) takes them over.
- **Profile records are not verified.** `com.github: alice` is what the name's
  owner typed, not proof they control that account. Apps should show the
  values as claims and never load an `avatar` URL without care.
- **Unilateral transfer.** `transfer` moves ownership without the
  recipient's acceptance, matching DNS/ENS convention. There is no
  escrowed or two-phase transfer.

## Tooling

- **The SDK is not published to npm yet.** It lives in `packages/sdk` and the
  dashboard uses it through npm workspaces.
- **No off-chain indexer.** Each owner's names come from the registry itself
  (`names_of`, at most 100 names per owner). Searching across all names, or
  history, would need an indexer reading the contract's events.

## Process

- **Not independently audited.** The contract has not had a third-party
  security review. CI (fmt, clippy `-D warnings`, tests, dependency
  audit/policy, provenance) raises the floor but is not a substitute for
  an audit.
