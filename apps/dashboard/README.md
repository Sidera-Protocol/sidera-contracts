# Sidera Dashboard

**The web frontend for the Sidera Stellar Name Service — search, resolve,
and claim `.sid` names.**

See the [Sidera documentation hub](https://github.com/Sidera-Protocol/sidera-contracts/blob/main/docs/README.md)
for the repository map, current testnet deployment, integration flow, and
cross-repository contribution guidance. See the
[troubleshooting guide](docs/TROUBLESHOOTING.md) for configuration, wallet,
network, and memo-hint issues.

> 💠 Contribute — see the labeled issue ladder and `CONTRIBUTING.md`.
> Fork-first; PRs against `main`.

## What it does

- **Search** any name with instant availability checks against the registry
- **Resolve** names to addresses with memo-hint metadata (`MEMO_ID` / `MEMO_TEXT` tags)
- **Claim** available names through Freighter wallet signing
- **Dashboard** listing every name owned by the connected wallet
- **Reverse resolution** display and update for the wallet's preferred `.sid` name

## Live registry

The app targets the deployed testnet contract out of the box:

```ini
NEXT_PUBLIC_SIDERIA_CONTRACT_ID=CCZJFYZSVMREA522JLNRBU4F4DRQFALDYM4JR7JBPNHY5NZOUWXWH7PC
NEXT_PUBLIC_SIDERIA_NETWORK=testnet
```

Leave the contract ID empty to explore the UI in demo mode with mock data.

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS · Lucide ·
`@stellar/freighter-api` · `@sidera-protocol/sdk`

## Run it

```bash
npm install
cp .env.example .env   # live testnet config is already filled in
npm run dev            # http://localhost:3000
```

The configured testnet contract includes forward and reverse resolution. The
`@sidera-protocol/sdk` dependency is vendored as a tarball
(`vendor/`), so fresh clones install standalone — no sibling checkout
of the SDK repo required. Once the SDK is on npm, this switches to a
regular version pin.

## Suite

| Repo | Layer |
|---|---|
| [sidera-contracts](https://github.com/Sidera-Protocol/sidera-contracts) | Soroban registry (deployed on testnet) |
| [sidera-sdk](https://github.com/Sidera-Protocol/sidera-sdk) | TypeScript client |
| **sidera-app** | This dashboard |

## License

MIT
