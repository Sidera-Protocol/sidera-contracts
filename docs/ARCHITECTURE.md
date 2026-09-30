# Sidera architecture

Sidera is split into three repositories with a contract-first integration
boundary.

```text
Stellar wallet / user
        │ signs registry transactions
        ▼
sidera-app ───────► sidera-sdk ───────► Soroban registry contract
  dashboard          reads, writes,       names, owners, addresses,
  and wallet UI      validation, memos     and optional memo hints
```

## Contracts layer

`sidera-contracts` contains the Rust `no_std` Soroban registry. It owns the
canonical name record and enforces the protocol rules for registration,
resolution, address updates, and ownership transfer. The contract is the
source of truth; clients must not treat locally cached names as authoritative.

The resolver returns a destination address and an optional memo hint. A memo
hint is part of the payment safety model: integrations should attach it when
building a payment and should fail safely when a required hint cannot be
represented.

## SDK layer

`sidera-sdk` is the TypeScript boundary for wallets and payment applications.
It normalizes and validates names, simulates read calls, builds and submits
write transactions, and maps contract errors to typed SDK errors. The SDK
accepts a small signer interface so wallet adapters do not need to be coupled
to a particular wallet implementation.

## Application layer

`sidera-app` is the Next.js dashboard. It uses the SDK for registry reads and
writes and uses Freighter for wallet signing. The application may provide
convenient loading, error, and demo states, but it must display the network and
contract configuration clearly and must not imply that demo data is on-chain.

## Cross-repository change checklist

When changing the registry interface:

1. Update the contract implementation and tests.
2. Update the SDK types, method calls, and error mapping.
3. Update the dashboard flow and user-facing states.
4. Update deployment identifiers and documentation if the deployed interface
   changes.
5. Run the relevant checks in each repository and document the network used.

## Network and deployment boundary

The documented deployment is Stellar Testnet. Contract IDs, network passphrases,
RPC endpoints, and wallet signing behavior must be treated as environment
configuration. A mainnet deployment requires a separate announcement and
security review; testnet identifiers must never be presented as mainnet
contracts.
