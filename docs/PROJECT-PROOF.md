# Sidera project proof

This is the evidence chain for the claim that Sidera resolves `.sid` names,
preserves memo hints, and supports reverse resolution across the contract, SDK,
and dashboard.

## Live testnet proof

Deployment:

- Network: Stellar testnet
- Contract: `CCZJFYZSVMREA522JLNRBU4F4DRQFALDYM4JR7JBPNHY5NZOUWXWH7PC`
- Explorer: <https://lab.stellar.org/r/testnet/contract/CCZJFYZSVMREA522JLNRBU4F4DRQFALDYM4JR7JBPNHY5NZOUWXWH7PC>
- WASM SHA-256: `a15727e6210c1f8dd4ffb0bf71cb26c64a735a1fcc0d4f63e0af9b340c0ed3e1`

The committed [smoke receipt](testnet-smoke-receipt.json) records the full
write path and its transaction links:

1. registered `sidera-release-20261014` with an address and memo;
2. resolved it to the expected address and `sidera-smoke` memo;
3. updated the address and memo;
4. transferred ownership to a second testnet identity;
5. set that identity's primary name;
6. read the primary name back successfully;
7. verified the final owner and forward resolution after transfer.

The observed final state was:

```json
{
  "name": "sidera-release-20261014.sid",
  "address": "GCTEIX3CMXJQFHJNISNSQT3LHNOGITU7H5UAPIJ4RLMS62SMFQBTVSGF",
  "memo": "updated-smoke",
  "primaryName": "sidera-release-20261014"
}
```

## Real SDK proof

Using the built SDK against that same contract and testnet deployment produced:

```json
{
  "resolve": {
    "name": "sidera-release-20261014",
    "fullName": "sidera-release-20261014.sid",
    "address": "GCTEIX3CMXJQFHJNISNSQT3LHNOGITU7H5UAPIJ4RLMS62SMFQBTVSGF",
    "memo": {"type": "text", "value": "updated-smoke"}
  },
  "primaryName": "sidera-release-20261014"
}
```

This validates the actual SDK decoding path, including the address, `.sid`
name, and memo hint—not only contract unit tests.

## Contract and repository verification

- Contract: 41 tests passed, including authorization, TTL, event, forward,
  and reverse-resolution cases.
- SDK: 39 tests passed, including XDR serialization and typed error handling.
- Dashboard: typecheck and production build passed.
- Cross-repository CI: required checks passed on the release PRs.
- Branch protection now requires CI and an approving review on SDK and app
  `main`.

## What this proves—and what it does not

This proves the core protocol behavior is live on Stellar testnet and that the
SDK consumes the deployed contract correctly. It also proves the dashboard
code compiles against the SDK and contains both demo and Freighter live paths.

It does not claim a mainnet deployment, third-party audit, production
readiness, or that demo-mode browser data is on-chain. Those remain explicit
limitations.
