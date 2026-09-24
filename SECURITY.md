# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` | ✅ |

## Deployment status

The registry is deployed on **Stellar testnet only**. No mainnet deployment
exists. Do not send real funds based on any name resolution until a mainnet
deployment is announced in this file and in the README.

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** (Security tab → "Report a
vulnerability") on this repository. Do not open public issues for security
reports.

Include:

* The affected contract entrypoint (e.g. `register`, `resolve`)
* A reproduction — test snippet or transaction XDR is ideal
* The impact you see and any suggested mitigation

## Scope notes

* The registry **holds no funds** — it is a name → (address, memo) directory.
* Loss-of-funds scenarios caused by *wrong* resolution (bad address, wrong or
  missing memo hint) are in scope and are the **highest-priority** bug class
  for this project.
* Response target: acknowledgement within 7 days; fix or mitigation plan
  within 30 days.
