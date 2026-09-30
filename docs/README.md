# Sidera Protocol documentation

Sidera is a Stellar Name Service for human-readable payment names such as
`alice.sid`. The protocol maps names to Stellar addresses and preserves the
memo information that exchanges and payment systems may require.

## Repository map

| Repository | Role |
|---|---|
| [sidera-contracts](https://github.com/Sidera-Protocol/sidera-contracts) | Soroban registry contracts and on-chain name-resolution rules |
| [sidera-sdk](https://github.com/Sidera-Protocol/sidera-sdk) | TypeScript client for resolving names and submitting registry transactions |
| [sidera-app](https://github.com/Sidera-Protocol/sidera-app) | Next.js dashboard for searching, resolving, and claiming `.sid` names |

The contracts are the source of truth for protocol state. The SDK exposes the
contract interface to wallets and payment applications, while the dashboard
provides a user-facing integration of both layers.

## Current deployment

The registry is deployed on Stellar **Testnet** only:

- Contract: `CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ`
- Explorer: [stellar.expert testnet contract page](https://stellar.expert/explorer/testnet/contract/CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ)

There is no mainnet deployment. Do not send real funds based on name
resolution until a mainnet deployment is announced in the contracts
repository and its security policy.

## Documentation by audience

- Contract developers: [resolver interface](resolver-interface.md) and
  [known limitations](KNOWN-LIMITATIONS.md).
- SDK integrators: the [SDK README](https://github.com/Sidera-Protocol/sidera-sdk#readme)
  for installation, reads, writes, signing, and name validation.
- Application developers: the [dashboard README](https://github.com/Sidera-Protocol/sidera-app#readme)
  for local setup, environment variables, and the testnet demo.
- Contributors: start with the relevant repository's `CONTRIBUTING.md`, then
  choose an issue with acceptance criteria and verification steps.

## Typical integration flow

1. A user searches for or registers a `.sid` name through the dashboard.
2. The SDK resolves the name through the Soroban registry.
3. The integration uses the resolved address and memo hint when constructing
   a Stellar payment.
4. Registry writes are signed by the user's wallet and submitted to testnet.

## Planned work

Planned issues may cover registry features, resolver and memo safety, SDK
behavior, wallet integration, dashboard workflows, testing, security review,
documentation, and developer tooling. Cross-repository changes should explain
which contract, SDK, and application surfaces need to stay compatible.
