# Sidera Resolver Interface

The contract every Sidera-compatible wallet and payment app codes against.

## Resolution (forward)

```rust
fn resolve(env: Env, name: String) -> Result<Resolution, RegistryError>;

struct Resolution {
    address: Address,       // G- or M-address receiving the payment
    memo:    Option<String> // memo hint required by the destination
}
```

`resolve` fails with `NotFound` (code 1) for names that were never registered
or were released, and with `NameExpired` (code 6) for names past their expiry
(including the 30-day grace period, during which only renewal is possible).

Wallet rules:

1. Call `resolve` against the **official registry contract** (pinned by
   address in this repo; later: a SEP-style announcement channel).
2. If `memo` is `Some`, the wallet MUST attach the memo to the payment or
   abort with an explicit user warning. A memo-hinted payment sent without
   a memo is the #1 way funds are lost on Stellar — Sidera's core reason
   to exist.
3. Display the resolved G-address alongside the name for verification.
4. Treat `NameExpired` like `NotFound`: never pay an expired name, and never
   fall back to a cached resolution for it.

## Reverse resolution

```rust
fn primary_name(env: Env, address: Address) -> Result<String, RegistryError>;

fn set_primary_name(
    env: Env,
    address: Address,
    name: String,
) -> Result<(), RegistryError>;
```

- `set_primary_name` requires `address` to authorize the write **and** the
  name to be active, owned by `address`, and resolving to `address`.
  Otherwise it fails (`NotFound`, `NameExpired` or `Unauthorized`), so no one
  can display a name that does not point to them.
- `primary_name` returns the preferred `.sid` name only while it still matches
  (active, owned by `address`, resolving to `address`). If the name expired,
  was transferred or was repointed, it returns `RegistryError::NotFound`.
- The registry stores names **without** the `.sid` suffix; wallets should
  append it for display.

## Registration, renewal and expiry

```rust
fn register(env: Env, name: String, owner: Address, address: Address,
            memo: Option<String>, years: u32) -> Result<u64, RegistryError>;
fn renew(env: Env, name: String, payer: Address, years: u32) -> Result<u64, RegistryError>;
fn expires_at(env: Env, name: String) -> Result<u64, RegistryError>;
fn is_available(env: Env, name: String) -> bool;
fn price(env: Env, name: String, years: u32) -> Result<i128, RegistryError>;
```

- `years` is 1–10. `register` and `renew` return the expiry as a ledger
  timestamp (seconds).
- The owner (for `register`) or payer (for `renew`) pays `price(name, years)`
  in the registry's SEP-41 token. The yearly price depends on the name length:
  3 characters, 4 characters, or 5 and more.
- `renew` extends from the current expiry and may be paid by anyone; it never
  changes ownership. It is refused (`PeriodTooLong`) if the expiry would be
  more than 10 years ahead.
- After expiry the name stops resolving. For 30 days only renewal is
  possible; after that the name is released and anyone may register it.

## Semantics

- Names are stored **without** the `.sid` suffix.
- Read-only lookups may extend the record's TTL (hot names never archive).
- All state-changing calls require the signing owner's (or payer's)
  authorization; owner updates (`set_address`, `transfer`) also require the
  name to be active.
