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

- Contract: `CCZJFYZSVMREA522JLNRBU4F4DRQFALDYM4JR7JBPNHY5NZOUWXWH7PC`
- Explorer: [Stellar Lab testnet contract page](https://lab.stellar.org/r/testnet/contract/CCZJFYZSVMREA522JLNRBU4F4DRQFALDYM4JR7JBPNHY5NZOUWXWH7PC)

There is no mainnet deployment. Do not send real funds based on name
resolution until a mainnet deployment is announced in the contracts
repository and its security policy.

## Documentation by audience

- Contract developers: [architecture](ARCHITECTURE.md),
  [development and release checks](DEVELOPMENT.md), [resolver interface](resolver-interface.md),
  and [known limitations](KNOWN-LIMITATIONS.md).
- Maintainers: [release and compatibility policy](RELEASE-COMPATIBILITY.md)
  for coordinated contract, SDK, and dashboard releases.
- Operations: [maintainer runbook](MAINTAINER-RUNBOOK.md) for handoff,
  security response, releases, and incident records.
- Evidence: [project proof](PROJECT-PROOF.md) for live testnet, SDK, contract,
  and dashboard verification.
- Contributors: [contributor roadmap](CONTRIBUTOR-ROADMAP.md) for scoped,
  dependency-aware implementation tasks.
- Issue authors: use the [contributor task template](../.github/ISSUE_TEMPLATE/wave_task.md)
  so each task has an outcome, acceptance criteria, and verification steps.
- SDK integrators: the [SDK README](https://github.com/Sidera-Protocol/sidera-sdk#readme)
  and [API reference](https://github.com/Sidera-Protocol/sidera-sdk/blob/main/docs/API.md)
  for installation, reads, writes, signing, name validation, and reverse
  resolution. The SDK must remain aligned with the deployed registry ABI.
- Application developers: the [dashboard README](https://github.com/Sidera-Protocol/sidera-app#readme)
  and [troubleshooting guide](https://github.com/Sidera-Protocol/sidera-app/blob/main/docs/TROUBLESHOOTING.md)
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

Planned issues may cover pricing and renewals, subnames, resolver and memo
safety, indexer support, wallet integration, dashboard workflows, testing,
security review, documentation, and developer tooling.
Cross-repository changes should explain which contract, SDK, and application
surfaces need to stay compatible.
