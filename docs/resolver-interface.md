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
   Resolve again right before sending and stop if the address or memo
   changed since the user confirmed them.
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

## Memo rules

- A stored memo is 1–28 bytes, the size of a Stellar text memo. `register`
  and `set_address` refuse anything else with `InvalidMemo` (code 11), so
  every stored memo can be sent exactly as written.
- The registry stores the memo as a string. Wallets choose the Stellar memo
  type from it: digits with no leading zero that fit in a u64 are sent as
  `MEMO_ID`; everything else (letters, spaces, leading zeros, larger numbers)
  as `MEMO_TEXT`, byte for byte. Never trim or shorten a memo.

## Listing an owner's names

```rust
fn names_of(env: Env, owner: Address) -> Vec<OwnedName>;
struct OwnedName { name: String, expires_at: u64 }
```

Returns the names `owner` holds, active or in their grace period, with their
expiry, in registration order. It is kept up to date on registration,
transfer and re-registration of released names. An owner may hold at most
100 names (`TooManyNames`, code 10).

## Subnames

```rust
fn set_subname(env: Env, parent: String, label: String, caller: Address,
               address: Address, memo: Option<String>) -> Result<(), RegistryError>;
fn remove_subname(env: Env, parent: String, label: String, caller: Address)
    -> Result<(), RegistryError>;
fn subnames(env: Env, parent: String) -> Map<String, Resolution>; // label → record
```

- `resolve("pay.alice")` returns the subname's own `Resolution`.
- Only the owner of the active parent may set or remove subnames; they are
  free. Labels are 1–32 characters of a–z, 0–9 and inner hyphens; one level
  deep; at most 50 per name (`TooManyNames`).
- While the parent is expired, its subnames fail with `NameExpired`. If the
  parent is released and registered again, the earlier subnames are gone.

## Profile records

```rust
fn set_record(env: Env, name: String, caller: Address, key: String,
              value: Option<String>) -> Result<(), RegistryError>;
fn records(env: Env, name: String) -> Map<String, String>;
```

- Keys are 1–32 bytes of a–z, 0–9, `.` and `-` (suggested: `avatar`, `url`,
  `description`, `com.github`, `com.x`); values are 1–256 bytes; at most 16
  records per name. `None` deletes a record. Anything else is
  `InvalidRecord` (code 12).
- Records are claims by the name's owner, not verified facts.

## Upgrades

`upgrade(wasm_hash)` lets the admin replace the contract code with an
already-uploaded WASM. The contract ID and all stored names stay the same,
so integrations keep pinning one contract ID.

## Semantics

- Names are stored **without** the `.sid` suffix.
- Read-only lookups may extend the record's TTL (hot names never archive).
- All state-changing calls require the signing owner's (or payer's)
  authorization; owner updates (`set_address`, `transfer`) also require the
  name to be active.
