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

* The affected page/component (e.g. `RegisterModal`, `SearchBar`)
* A reproduction (steps or a screenshot is ideal)
* The impact you see and any suggested mitigation

## Scope notes

* The app never handles private keys — wallet operations go through
  Freighter behind `src/lib/useWallet.ts`.
* **Highest-priority bug class:** anything that could cause a user to copy or
  send to the wrong address or with the wrong memo (rendering of resolution
  results, memo-hint display, copy flows).
* Demo mode uses mock data and touches no chain state.
* Response target: acknowledgement within 7 days; fix or mitigation plan
  within 30 days.
