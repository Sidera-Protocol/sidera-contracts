# Integrating Sidera resolution into a wallet or payment app

Forward resolution turns `alice.sid` into a payment destination. This guide
covers what an integration **must** do; `docs/resolver-interface.md` specifies
the contract interface itself, and the testnet deployment used below is listed
in the [README](../README.md#testnet-deployment-proof).

## The five rules

1. **Resolve against the official registry contract only.** Pin the registry
   contract ID in your client (testnet ID in the README; a SEP-style
   announcement channel will follow for mainnet). Never accept a registry
   address from user input.
2. **Attach the memo when one is present.** If `resolve` returns
   `memo: Some(...)`, your payment MUST include that memo, or it MUST abort
   with an explicit warning to the user. A memo-hinted payment sent without
   its memo is the #1 way funds are lost on Stellar — silently dropping it is
   the failure mode Sidera exists to prevent.
3. **Display the resolved address next to the name.** Users should always be
   able to see the full `G...`/`M...` address they are about to pay.
4. **Handle muxed (M-) addresses natively.** Sidera stores whatever address
   the owner registered, including muxed accounts. Pass the resolved address
   through to your payment flow without stripping or rewriting it — the
   56-character string your user no longer has to paste still has to arrive
   at the network intact.
5. **Never pay an expired name.** `resolve` fails with `NameExpired` (SDK:
   `NameExpiredError`) once a name's registration runs out. Treat it like an
   unknown name: stop, and never fall back to a cached address. You can show
   the user when it expired with `expiresAt(name)`.

## Calling `resolve`

`resolve` is a read-only invocation, so it costs no fee and can be simulated
against any Soroban RPC endpoint. With `@stellar/stellar-sdk` (v13+), the
generated contract client loads the deployed contract's spec and exposes the
entrypoints directly:

```typescript
import { contract } from "@stellar/stellar-sdk";

const REGISTRY_ID = "CD4YE4ERU37U5KQU3QCJJGIKUSES6QXA6WNLIMORRBY62RD37SC6FGUT";
const RPC_URL = "https://soroban-testnet.stellar.org";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

const registry = new contract.Client({
  contractId: REGISTRY_ID,
  rpcUrl: RPC_URL,
  networkPassphrase: TESTNET_PASSPHRASE,
  // Read-only calls need no signer.
  publicKey: undefined,
});

export async function resolveSid(name: string): Promise<{
  address: string;
  memo: string | null;
}> {
  const { result } = await registry.resolve({ name });
  return {
    address: result.address.toString(),
    memo: result.memo ?? null,
  };
}
```

The same call from the CLI (useful for smoke-testing a deployment):

```bash
stellar contract invoke \
  --id CD4YE4ERU37U5KQU3QCJJGIKUSES6QXA6WNLIMORRBY62RD37SC6FGUT \
  --network testnet --source <any-identity> --send no \
  -- resolve --name alice-pay
```

## Watching for changes

The registry emits one event per state change, with the name as the second
topic, so indexers can subscribe once and filter by name or by event:

| Event | Topics | Data | Meaning |
|---|---|---|---|
| `registered` | `("registered", name)` | `(owner, address, memo)` | A new name exists |
| `address_set` | `("address_set", name)` | `(caller, address, memo)` | Payment record updated |
| `transferred` | `("transferred", name)` | `(caller, new_owner)` | Ownership moved |
| `primary_name_set` | `("primary_name_set", address)` | `(name)` | Preferred reverse name changed |

A wallet that caches resolutions should re-resolve when it observes
`address_set` or `transferred` for a name it holds.

## Cache invalidation for cached resolution results

If your wallet caches `resolve` results, invalidate or refresh the cache
whenever it observes any of these registry events for a name or address it
cares about:

- `address_set(name)` — the payment destination or memo hint for a name has
  changed.
- `transferred(name)` — ownership of a name changed; the applicable wallet
  should re-resolve because the new owner may publish a different memo hint.
- `registered(name)` — a new name exists; the wallet should treat the first
  cached lookup as a cache miss and resolve against the contract.

If you also cache reverse-resolution results produced by `primary_name`,
invalidate them when the address owner calls `set_primary_name` or when the
address record changes in a way your wallet tracks. The SDK exposes both
`primaryName(address)` and `setPrimaryName(address, name)`; integrations
should use those methods rather than duplicating contract invocation logic.

## What Sidera does not do yet

Subnames and an indexer are future tranches — see
[KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) and the roadmap in the
[README](../README.md#status). Paid registration, renewal and expiry, and
verified reverse resolution, are implemented across the registry, SDK and
dashboard. The registry is deployed on **testnet only**;
do not point production payment flows at it.
