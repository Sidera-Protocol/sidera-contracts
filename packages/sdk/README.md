# @sidera-protocol/sdk

**TypeScript client for the Sidera Stellar Name Service — send payments to
`alice.sid`, not to a checksum.**

> 💠 Contribute — see the labeled issue ladder and `CONTRIBUTING.md`.
> Fork-first; PRs against `main`.

Sidera maps human-readable names to Stellar addresses (G- and M-keys) with
**memo hints**, so exchange payments stop getting lost and wallets stop
asking users to paste 56 characters. This SDK is the resolution engine for
wallets (Freighter, Albedo, …) and payment apps.

## Project documentation

See the [Sidera documentation hub](../../docs/README.md)
for the repository map, current testnet deployment, integration flow, and
cross-repository contribution guidance. See the [API reference](docs/API.md)
for the exported client methods, types, and errors.

## Installation

```bash
npm   install @sidera-protocol/sdk
pnpm  add    @sidera-protocol/sdk
yarn  add    @sidera-protocol/sdk
```

## Initialization

```ts
import { SideraClient } from "@sidera-protocol/sdk";

const client = new SideraClient({
  contractId: "C…",       // deployed Sidera registry contract ID
  network: "testnet",     // "testnet" | "mainnet" | custom (with rpcUrl)
  // rpcUrl: "http://localhost:8000",  // optional override
});
```

Network defaults:

| Network  | RPC endpoint (public)                    |
| -------- | ---------------------------------------- |
| testnet  | `https://soroban-testnet.stellar.org`    |
| mainnet  | `https://soroban-rpc.stellar.org`        |

## Verified testnet deployment

The current contract (paid registration, renewals and expiry) is deployed on
Stellar testnet at:

```text
CD4YE4ERU37U5KQU3QCJJGIKUSES6QXA6WNLIMORRBY62RD37SC6FGUT
```

Explorer: <https://lab.stellar.org/r/testnet/contract/CD4YE4ERU37U5KQU3QCJJGIKUSES6QXA6WNLIMORRBY62RD37SC6FGUT>

This SDK was used to verify that deployment end to end: register, resolve with
a memo, renew, set and read a primary name, and refused impostor and duplicate
calls. The transaction-level receipt is
[`docs/testnet-smoke-receipt.json`](../../docs/testnet-smoke-receipt.json).

## Resolving a name (reads)

```ts
const res = await client.resolve("alice.sid");

res.fullName;      // "alice.sid"
res.address;       // "GA7X…" — destination
res.owner;         // "GABC…" — name owner
res.memo?.type;    // "id" | "text" | null
res.memo?.value;   // the memo to attach
```

Wallets: feed `res.memo` straight into your payment builder —
`type: "id"` maps to `Memo.id(value)`, `type: "text"` to `Memo.text(value)`.
**If a memo hint is present, refusing to attach it should be a hard error in
your send flow** — a memo-less payment to an exchange is a lost payment.

The memo is never trimmed or shortened: digits without a leading zero that
fit a u64 become `MEMO_ID`, anything else `MEMO_TEXT` byte for byte, and a
memo that cannot be sent exactly throws `MemoTooLong`.

## Paying a name

`buildPayment` builds the unsigned payment with the destination and the memo
already set:

```ts
import { buildPayment } from "@sidera-protocol/sdk";

const to = await client.resolve("exchange-user.sid");
const tx = buildPayment({
  source: await horizon.loadAccount(payer), // the paying account
  to,
  amount: "10",                             // XLM unless `asset` is given
  networkPassphrase: Networks.TESTNET,
});
// sign with the wallet, then horizon.submitTransaction(...)
```

Resolve again right before submitting and stop if the address or memo
changed since the user confirmed them.

Also available: `client.ownerOf(name)`, `client.exists(name)`, and
`client.primaryName(address)` for reverse resolution.

## Writing to the registry (transactions)

Write calls build, sign, and submit real Soroban transactions. Provide a
signer in the client config (Freighter/Albedo adapters implement the same
two-line interface):

```ts
const client = new SideraClient({
  contractId: "C…",
  network: "testnet",
  signer: {
    signTx: async (txXdr, networkPassphrase) =>
      (await freighterApi.signTransaction(txXdr, { networkPassphrase, address: ownerAddress }))
        .signedTxXdr,
  },
});

// What it costs (in the payment token's smallest unit, stroops for XLM):
const cost = await client.price("alice", 2);

// Register a name for 2 years (owner signs and pays):
const { hash, expiresAt } = await client.register({
  name: "alice",
  owner: ownerAddress,        // must be the signing account
  address: destinationAddress,
  memo: "1029384756",         // optional memo hint
  years: 2,                   // 1–10, default 1
});

// Renew it for another year (anyone may pay):
await client.renew({ name: "alice", payer: ownerAddress, years: 1 });

// Re-point a name:
await client.setAddress({ name: "alice", address: newAddress }, ownerAddress);

// Set the wallet's preferred reverse-resolution name (address must sign):
await client.setPrimaryName(ownerAddress, "alice");

// Transfer ownership:
await client.transfer({ name: "alice", from: ownerAddress, to: newOwner });
```

## Subnames and profiles

```ts
// The owner of "alice" gives pay.alice its own address and memo (free):
await client.setSubname({ parent: "alice", label: "pay", address: exchangeAddress, memo: "1001" }, ownerAddress);
await client.resolve("pay.alice.sid");          // { address: exchangeAddress, memo: { type: "id", value: "1001" } }
await client.subnames("alice");                 // [{ label: "pay", fullName: "pay.alice.sid", address, memo }]
await client.removeSubname("alice", "pay", ownerAddress);

// Public profile records (null deletes one):
await client.setRecord("alice", "url", "https://alice.example", ownerAddress);
await client.records("alice");                  // { url: "https://alice.example" }
```

Subnames are one level deep, live as long as their parent's registration,
and are managed only by the parent's owner. Profile values are the owner's
claims, not verified facts.

## Name rules

- 3–32 characters, `a–z`, `0–9`, inner hyphens (no leading/trailing `-`)
- Subname labels follow the same rules with 1–32 characters: `pay.alice`
- Input is normalized: `Alice.SID` → `alice`
- Validation runs client-side first (instant feedback), then on-chain

## Development

```bash
pnpm install
pnpm lint    # tsc --noEmit (strict)
pnpm test    # vitest
pnpm build   # tsup → dist/ (ESM + d.ts)
```

## License

MIT
