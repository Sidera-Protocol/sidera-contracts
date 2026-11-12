# SDK API reference

The package exports `SideraClient`, the core types and errors, name helpers,
and memo helpers from `src/index.ts`.

## Client configuration

```ts
new SideraClient({
  contractId: "C...",
  network: "testnet", // "testnet", "futurenet", "mainnet", or a custom name
  rpcUrl?: "https://...",
  passphrase?: "...",
  signer?: { signTx: (xdr: string, passphrase: string) => Promise<string> },
});
```

`rpcUrl` is optional for the built-in networks. Custom networks require an
explicit RPC URL and network passphrase.

## Read methods

### `resolve(name)`

Accepts a bare name or a `.sid` name and returns:

```ts
{
  name: string;
  fullName: string;
  address: string;
  memo: { type: "id" | "text"; value: string } | null;
}
```

The returned memo is ready to convert to a Stellar `MEMO_ID` or `MEMO_TEXT`
value. A missing name raises `NameNotFoundError`.

### `ownerOf(name)`

Returns the current owner address. A missing name raises
`NameNotFoundError`.

### `exists(name)`

Returns whether the name is taken: active or in its 30-day grace period.

### `expiresAt(name)`

Returns when the name expires, as a `Date`. Works while the name is active and
during its grace period; otherwise raises `NameNotFoundError`.

### `isAvailable(name)`

Returns whether the name is valid and can be registered now. Invalid names
return `false` without an RPC call.

### `price(name, years = 1)`

Returns the cost of registering or renewing for `years` years as a `bigint`, in
the payment token's smallest unit (stroops for XLM).

### `config()`

Returns `{ admin, token, treasury, prices: { three, four, fivePlus } }`, with
yearly prices as `bigint`.

### `primaryName(address)`

Returns the address's verified primary name; raises `NameNotFoundError` when
none is set or it no longer points to the address.

## Write methods

Write methods require a configured `signer`. Each call is simulated to prepare
its footprint, authorization and fees, signed, submitted, and **awaited until
the network confirms it**; a contract error is raised as a typed error, either
before signing (found during preparation) or after confirmation.

- `register({ name, owner, address, memo?, years? }, options?)` registers a
  name for `years` years (1–10, default 1); the owner pays `price(name, years)`.
  Returns `{ hash, expiresAt }`.
- `renew({ name, payer, years? }, options?)` adds years; anyone may pay.
  Returns `{ hash, expiresAt }`.
- `setPrimaryName(address, name, options?)` sets a primary name the address
  owns and that resolves to it. Returns the transaction hash.
- `setAddress({ name, address, memo? }, caller, options?)` changes its
  destination and optional memo hint.
- `transfer({ name, from, to }, options?)` transfers ownership.

`setAddress`, `transfer` and `setPrimaryName` return the transaction hash.

The caller/owner address must match the account that signs the transaction.
The SDK validates names before submission, but the contract remains the final
authority.

## Errors and helpers

Use the exported typed errors instead of matching message strings:

- `NameNotFoundError`
- `NameTakenError`
- `InvalidNameError`
- `UnauthorizedError`
- `NameExpiredError` (the name expired; renew it during the grace period)
- `SideraError` for other RPC or contract failures

`parseMemoHint` parses a registry memo hint, `toStellarMemo` converts it to a
Stellar memo, and the name helpers normalize and validate `.sid` input.
