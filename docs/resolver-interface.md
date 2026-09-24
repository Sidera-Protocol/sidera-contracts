# Sidera Resolver Interface (draft 0)

The contract every Sidera-compatible wallet and payment app codes against.

## Resolution (forward)

```rust
fn resolve(env: Env, name: String) -> Result<Resolution, RegistryError>;

struct Resolution {
    address: Address,       // G- or M-address receiving the payment
    memo:    Option<String> // memo hint required by the destination
}
```

Wallet rules:

1. Call `resolve` against the **official registry contract** (pinned by
   address in this repo; later: a SEP-style announcement channel).
2. If `memo` is `Some`, the wallet MUST attach the memo to the payment or
   abort with an explicit user warning. A memo-hinted payment sent without
   a memo is the #1 way funds are lost on Stellar — Sidera's core reason
   to exist.
3. Display the resolved G-address alongside the name for verification.

## Reverse resolution (planned tranche)

```rust
fn primary_name(env: Env, address: Address) -> Result<String, RegistryError>;
```

An address sets its preferred display name once (`set_primary_name`); UIs
show `alice.sid` instead of `GA7X…`.

## Semantics

- Names are stored **without** the `.sid` suffix.
- Read-only lookups may extend the record's TTL (hot names never archive).
- All state-changing calls require the signing owner's authorization.
