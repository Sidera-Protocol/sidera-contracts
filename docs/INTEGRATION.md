# Integrating Sidera resolution into a wallet or payment app

Forward resolution turns `alice.sid` into a payment destination. This guide
covers what an integration **must** do; `docs/resolver-interface.md` specifies
the contract interface itself, and the testnet deployment used below is listed
in the [README](../README.md#testnet-deployment-proof).

## The four rules

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

## Calling `resolve`

`resolve` is a read-only invocation, so it costs no fee and can be simulated
against any Soroban RPC endpoint. With `@stellar/stellar-sdk` (v13+), the
generated contract client loads the deployed contract's spec and exposes the
entrypoints directly:

```typescript
import { contract } from "@stellar/stellar-sdk";

const REGISTRY_ID = "CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ";
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
  --id CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ \
  --network testnet \
  --fn resolve --arg alice
```

## Watching for changes

The registry emits one event per state change, with the name as the second
topic, so indexers can subscribe once and filter by name or by event:

| Event | Topics | Data | Meaning |
|---|---|---|---|
| `registered` | `("registered", name)` | `(owner, address, memo)` | A new name exists |
| `address_set` | `("address_set", name)` | `(caller, address, memo)` | Payment record updated |
| `transferred` | `("transferred", name)` | `(caller, new_owner)` | Ownership moved |

A wallet that caches resolutions should re-resolve when it observes
`address_set` or `transferred` for a name it holds.

## What Sidera does not do yet

Reverse resolution, subnames, and pricing/renewals are future tranches —
see [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) and the roadmap in the
[README](../README.md#status). The registry is deployed on **testnet only**;
do not point production payment flows at it.
