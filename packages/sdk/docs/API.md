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

Returns whether the normalized name is registered.

## Write methods

Write methods require a configured `signer` and return a submitted transaction
hash.

- `register({ name, owner, address, memo? }, options?)` registers a name.
- `setAddress({ name, address, memo? }, caller, options?)` changes its
  destination and optional memo hint.
- `transfer({ name, from, to }, options?)` transfers ownership.

The caller/owner address must match the account that signs the transaction.
The SDK validates names before submission, but the contract remains the final
authority.

## Errors and helpers

Use the exported typed errors instead of matching message strings:

- `NameNotFoundError`
- `NameTakenError`
- `InvalidNameError`
- `UnauthorizedError`
- `SideraError` for other RPC or contract failures

`parseMemoHint` parses a registry memo hint, `toStellarMemo` converts it to a
Stellar memo, and the name helpers normalize and validate `.sid` input.
