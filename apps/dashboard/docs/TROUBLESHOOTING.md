# Dashboard troubleshooting

## The app shows demo data

Set both variables in `.env`:

```ini
NEXT_PUBLIC_SIDERIA_CONTRACT_ID=CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ
NEXT_PUBLIC_SIDERIA_NETWORK=testnet
```

Restart the development server after changing environment variables. An empty
contract ID intentionally enables the demo/mock experience.

## Freighter cannot sign

Confirm that:

1. Freighter is installed and unlocked.
2. The selected account is available on Stellar Testnet.
3. The dashboard network is `testnet`.
4. The wallet has enough testnet balance for the transaction and fee.

The app cannot replace a rejected or cancelled wallet signature. Retry from the
same user action after confirming the wallet network.

## A name cannot be found or registered

Names are normalized before lookup. Use 3–32 characters containing lowercase
letters, digits, and inner hyphens; do not start or end with a hyphen. Confirm
that the dashboard contract ID matches the deployed testnet registry.

## A payment is missing a memo

When resolution returns a memo hint, the payment flow must attach the matching
Stellar memo. Do not silently continue with a memo-less exchange payment.

## RPC or network errors

Check the browser network panel, the configured network, and the public Soroban
RPC availability. Verify the contract on [stellar.expert](https://stellar.expert/explorer/testnet/contract/CAJL7DAFAICOVMO7WXU4UUVFIAY6SODAECJPPNXPXKNUJQTNCD4GZKVQ).
Do not use the testnet contract ID for mainnet transactions.
