# Sidera project proof

The evidence that Sidera's registry, SDK and dashboard work together on
Stellar testnet: paid registration, renewal, expiry, resolution with memo
hints, verified primary names, owner name lists and admin upgrades.

## Live testnet proof

- Network: Stellar testnet
- Contract: `CD4YE4ERU37U5KQU3QCJJGIKUSES6QXA6WNLIMORRBY62RD37SC6FGUT`
- Explorer: <https://lab.stellar.org/r/testnet/contract/CD4YE4ERU37U5KQU3QCJJGIKUSES6QXA6WNLIMORRBY62RD37SC6FGUT>
- WASM SHA-256 (deployed, optimized): `f073550659c2aa14e226965422bf53716b98991eaeea5ee280edb9f5b0fb47a6`
- Payment token: native XLM; 50 / 10 / 2 XLM per year for 3 / 4 / 5+ characters

The [smoke receipt](testnet-smoke-receipt.json) records every step with its
transaction link. It was driven by **the SDK in `packages/sdk`**, the same
client the dashboard uses, so it proves the SDK's write path and not only the
contract:

1. read the on-chain config and price quotes;
2. `alice-pay` was available;
3. registered it for 2 years with memo `1029384756`; the treasury received
   exactly 4 XLM;
4. resolved it to the owner's address and the memo;
5. a second account renewed it for 1 year; the treasury received 2 XLM, the
   expiry moved one year, and ownership did not change;
6. the owner set it as their primary name and read it back;
7. the second account tried to claim `alice-pay` as **its** primary name and
   was refused (`UnauthorizedError`);
8. registering the taken name again was refused (`NameTakenError`);
9. the owner's names were listed straight from the registry (`namesOf`);
10. the expiry read back as 2029-11-11, and the name was not available;
11. a non-admin's upgrade was refused (it needs the admin's signature);
12. the admin upgraded the contract, and afterwards the name, its memo, the
    owner's list, the primary name and the name count were all unchanged.

## Contract and repository verification

- Contract: 72 tests, including 20 for pricing, expiry, grace period,
  renewal and admin rules, 8 for owner name lists and upgrades, and five
  property-based suites. P4 checks over random sequences of registrations,
  renewals and time jumps that the treasury receives exactly the quoted
  prices, no token is created or lost, failed calls move no money, and no
  expiry exceeds 10 years ahead. P5 checks that every owner's list always
  matches who holds what; it found a self-transfer bug before release.
- SDK: 53 tests, with fixtures that use the contract's real encodings.
- Dashboard: typecheck and production build; search, expiry display and live
  price quotes checked in a browser against the testnet contract.
- CI runs all of the above on every pull request.

## Corrected since the previous proof

The previous deployment (`CCZJ…H7PC`, receipt in
[`testnet-smoke-receipt-2026-10-14.json`](testnet-smoke-receipt-2026-10-14.json))
was exercised with the Stellar CLI, and the SDK was only checked for reads.
Checking the SDK's writes against testnet found two problems, both fixed and
covered by the receipt above:

- the SDK encoded `Option<String>` (the memo) as a vector, which the contract
  rejects; it is now `Void` or the plain string;
- the SDK submitted transactions without preparing them (footprint,
  authorization, resource fee) and did not wait for confirmation; it now
  prepares, submits and awaits each write;
- the SDK decoded every list as if it were an optional value and kept only
  its first item; lists now decode in full.

The dashboard's registration button was also a placeholder that reported
success without sending a transaction. It now registers through the SDK with
Freighter and shows the confirmed expiry.

## What this proves, and what it does not

This proves the protocol works on Stellar testnet through the SDK, with real
token payments. It does not claim a mainnet deployment, a third-party audit,
production readiness, or final prices. Those remain explicit limitations.
