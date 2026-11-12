# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| `main` | ✅ |

## Reporting a vulnerability

Use GitHub's **private vulnerability reporting** (Security tab → "Report a
vulnerability") on this repository. Do not open public issues for security
reports.

Include:

* The affected SDK function or module (e.g. `resolve`, `parseMemoHint`)
* A reproduction (test snippet or request/response payload is ideal)
* The impact you see and any suggested mitigation

## Scope notes

* The SDK never holds or transmits keys — signing is delegated to wallets
  (e.g. Freighter) and stays behind the provider seam.
* **Highest-priority bug class:** anything that causes a caller to pay the
  wrong destination or with the wrong memo — incorrect parsing, normalization,
  or error mapping in resolution paths.
* Response target: acknowledgement within 7 days; fix or mitigation plan
  within 30 days.
