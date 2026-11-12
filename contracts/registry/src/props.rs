//! Randomized invariant suite (proptest).
//!
//! The hand-written suite pins behaviour on known values; this module tries
//! to *falsify* the registry's resolution-safety claims over generated
//! inputs. SECURITY.md names wrong resolution — a bad address, or a wrong
//! or missing memo hint — as the highest-priority bug class; these
//! properties attack exactly that class.
//!
//! Three properties are exercised:
//!
//! **P1 — Validation soundness.** For random strings, `register` either
//! rejects with `InvalidName` or accepts, and accept/reject always agrees
//! with `exists`; rejected names never resolve. A duplicate registration
//! is always `NameTaken` and never overwrites the original record.
//!
//! **P2 — Memo integrity.** For random memos (including unicode, empty,
//! and stress strings), whatever memo was set via `register` or
//! `set_address` is *exactly* what `resolve` returns, and updates to one
//! name never bleed into another's record.
//!
//! **P3 — Ownership state machine.** For random sequences of
//! `register` / `transfer` / `set_address` against a mirror model:
//! registration succeeds exactly when the name is fresh, a
//! transferred-away owner is rejected on every subsequent call, and
//! `total_names` tracks successful registrations exactly.
//!
//! **P4 — Payment conservation and bounded expiry.** For random sequences
//! of `register` / `renew` with random lengths, years (including invalid
//! ones) and time jumps, against priced names paid in a real Stellar Asset
//! Contract: the treasury receives exactly the sum of the quoted prices of
//! the successful calls, no token is created or lost, failed calls move no
//! money, and no expiry ever exceeds `MAX_YEARS` from the time it was set.
//!
//! **P5 — Owner index consistency.** For random sequences of `register`,
//! `transfer` and time jumps across several owners, `names_of(owner)` always
//! lists exactly the names a mirror model says the owner holds (active or in
//! grace), with the contract's own expiry, and never a released name.
//!
//! Runs are deterministic (fixed default seed); a failure prints its case
//! for replay. Override the case count with
//! `PROPTEST_CASES=n cargo test -p sidera-registry props`.

use super::*;
use proptest::prelude::*;
use soroban_sdk::testutils::{Address as _, Ledger as _};

// ---------------------------------------------------------------------------
// Shared world: one fresh env + registry per case
// ---------------------------------------------------------------------------

struct World {
    env: Env,
    id: Address,
}

fn setup_world() -> World {
    let env = Env::default();
    env.mock_all_auths();
    let id = crate::testutil::deploy(&env, crate::testutil::free()).id;
    World { env, id }
}

impl World {
    fn client(&self) -> SideraRegistryClient<'_> {
        SideraRegistryClient::new(&self.env, &self.id)
    }

    fn name(&self, raw: &str) -> String {
        String::from_str(&self.env, raw)
    }
}

// ---------------------------------------------------------------------------
// Strategies
//
// Note: `super::*` re-exports `soroban_sdk::String`, so the std string is
// spelled out explicitly everywhere below.
// ---------------------------------------------------------------------------

/// Characters allowed by `validate_name`: a–z, 0–9, hyphen.
fn name_char() -> impl Strategy<Value = char> {
    prop_oneof![
        6 => prop::char::range('a', 'z'),
        2 => prop::char::range('0', '9'),
        2 => Just('-'),
    ]
}

/// Well-formed names within the length bounds (3..=32), hyphens internal
/// only. These must always be *accepted* — a rejection is a soundness bug.
fn valid_name() -> impl Strategy<Value = std::string::String> {
    prop::collection::vec(name_char(), 3..=32)
        .prop_filter(
            "hyphens may not lead or trail",
            |chars: &std::vec::Vec<char>| {
                *chars.first().expect("len >= 3") != '-' && *chars.last().expect("len >= 3") != '-'
            },
        )
        .prop_map(|chars| chars.into_iter().collect())
}

/// Arbitrary adversarial strings: mostly-ASCII names plus length-boundary
/// and non-alphabet probes. These exercise the *rejection* path — a wrong
/// accept is a soundness bug, a panic is worse.
fn arbitrary_name() -> impl Strategy<Value = std::string::String> {
    prop_oneof![
        5 => valid_name(),
        // 'n' repeated: in-alphabet, sometimes below/above the length caps.
        2 => (0usize..=40usize)
            .prop_map(|len| core::iter::repeat_n('n', len).collect()),
        // Single arbitrary byte-as-char: always too short or invalid.
        2 => (0u8..=255)
            .prop_map(|b| std::string::String::from(
                char::from_u32(u32::from(b)).unwrap_or('?')
            )),
        1 => Just(std::string::String::new()),
    ]
}

/// Memos: printable ASCII, unicode, empty, and stress strings.
fn arbitrary_memo() -> impl Strategy<Value = std::string::String> {
    prop_oneof![
        4 => ".*",
        2 => prop::collection::vec(prop::char::range('a', 'z'), 0..=64)
            .prop_map(|chars| chars.into_iter().collect()),
        2 => prop::collection::vec(any::<char>(), 0..=16)
            .prop_map(|chars| chars.into_iter().collect()),
        1 => Just(std::string::String::new()),
    ]
}

/// One registry mutation for the ownership state machine.
#[derive(Clone, Debug)]
enum Op {
    Register {
        name: std::string::String,
        memo: Option<std::string::String>,
    },
    Transfer {
        idx: u8,
    },
    SetAddress {
        idx: u8,
        memo: Option<std::string::String>,
    },
}

fn registry_op() -> impl Strategy<Value = Op> {
    prop_oneof![
        3 => (valid_name(), proptest::option::of(arbitrary_memo()))
            .prop_map(|(name, memo)| Op::Register { name, memo }),
        1 => (0u8..=7).prop_map(|idx| Op::Transfer { idx }),
        2 => (0u8..=7, proptest::option::of(arbitrary_memo()))
            .prop_map(|(idx, memo)| Op::SetAddress { idx, memo }),
    ]
}

// ---------------------------------------------------------------------------
// P1 — validation soundness: accept-or-reject is never lossy
// ---------------------------------------------------------------------------

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn p1_valid_names_always_register_and_roundtrip(raw in valid_name()) {
        let w = setup_world();
        let owner = Address::generate(&w.env);
        let dest = Address::generate(&w.env);
        let name = w.name(&raw);

        // A name satisfying every documented validation rule must be
        // accepted — a rejection here means validation and the docs
        // disagree.
        w.client().register(&name, &owner, &dest, &None, &1);
        prop_assert!(w.client().exists(&name));

        // Round-trip: the record resolves with the exact inputs.
        let resolution = w.client().resolve(&name);
        prop_assert_eq!(resolution.address, dest);
        prop_assert_eq!(resolution.memo, None);
        prop_assert_eq!(w.client().owner_of(&name), owner);
    }

    #[test]
    fn p1_arbitrary_names_never_panic_and_never_half_register(raw in arbitrary_name()) {
        let w = setup_world();
        let owner = Address::generate(&w.env);
        let dest = Address::generate(&w.env);
        let name = w.name(&raw);

        let accepted = match w.client().try_register(&name, &owner, &dest, &None, &1) {
            Ok(_) => true,
            Err(inv) => {
                // The outer layer's error is a ConversionError; the
                // inner one carries the contract error code.
                prop_assert_eq!(inv.unwrap(), RegistryError::InvalidName);
                false
            }
        };

        // Accept/reject must agree with `exists`, always.
        prop_assert_eq!(accepted, w.client().exists(&name));

        // Rejected names must not be resolvable: a half-registered name
        // (owner key set, record missing, or vice versa) is a resolution
        // hazard.
        if !accepted {
            prop_assert!(
                w.client().try_resolve(&name).is_err(),
                "rejected name {raw:?} must not resolve"
            );
        }
    }

    #[test]
    fn p1_duplicate_registration_never_overwrites(
        raw in valid_name(),
        memo_a in arbitrary_memo(),
        memo_b in arbitrary_memo(),
    ) {
        prop_assume!(memo_a != memo_b);
        let w = setup_world();
        let owner_a = Address::generate(&w.env);
        let owner_b = Address::generate(&w.env);
        let dest_a = Address::generate(&w.env);
        let dest_b = Address::generate(&w.env);
        let name = w.name(&raw);

        w.client().register(&name, &owner_a, &dest_a, &Some(w.name(&memo_a)), &1);
        let err = w
            .client()
            .try_register(&name, &owner_b, &dest_b, &Some(w.name(&memo_b)), &1)
            .unwrap_err()
            .unwrap();
        prop_assert_eq!(err, RegistryError::NameTaken);

        // The original record survives untouched — first-come-first-served
        // must be absolute, not last-writer-wins.
        let resolution = w.client().resolve(&name);
        prop_assert_eq!(resolution.address, dest_a);
        prop_assert_eq!(resolution.memo, Some(w.name(&memo_a)));
        prop_assert_eq!(w.client().owner_of(&name), owner_a);
    }
}

// ---------------------------------------------------------------------------
// P2 — memo integrity: what was set is what resolves, forever
// ---------------------------------------------------------------------------

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn p2_memo_set_via_register_roundtrips_exactly(raw in valid_name(), memo in arbitrary_memo()) {
        let w = setup_world();
        let owner = Address::generate(&w.env);
        let dest = Address::generate(&w.env);
        let name = w.name(&raw);

        let memo_opt = if memo.is_empty() { None } else { Some(w.name(&memo)) };
        w.client().register(&name, &owner, &dest, &memo_opt, &1);

        let resolution = w.client().resolve(&name);
        prop_assert_eq!(resolution.address, dest);
        prop_assert_eq!(resolution.memo, memo_opt,
            "memo must round-trip byte-exact through register -> resolve");
    }

    #[test]
    fn p2_memo_updates_are_exact_and_isolated(
        raw_a in valid_name(),
        raw_b in valid_name(),
        memo1 in arbitrary_memo(),
        memo2 in arbitrary_memo(),
    ) {
        prop_assume!(raw_a != raw_b);
        prop_assume!(memo1 != memo2);
        let w = setup_world();
        let owner = Address::generate(&w.env);
        let dest_a = Address::generate(&w.env);
        let dest_b = Address::generate(&w.env);
        let dest_a_new = Address::generate(&w.env);
        let name_a = w.name(&raw_a);
        let name_b = w.name(&raw_b);

        w.client().register(&name_a, &owner, &dest_a, &Some(w.name(&memo1)), &1);
        w.client().register(&name_b, &owner, &dest_b, &Some(w.name(&memo2)), &1);

        // Owner rewrites A's address and memo; B's record must be untouched.
        w.client().set_address(&name_a, &owner, &dest_a_new, &Some(w.name(&memo2)));

        let a = w.client().resolve(&name_a);
        prop_assert_eq!(a.address, dest_a_new);
        prop_assert_eq!(a.memo, Some(w.name(&memo2)));
        let b = w.client().resolve(&name_b);
        prop_assert_eq!(b.address, dest_b,
            "an update to one name must never bleed into another name's record");
        prop_assert_eq!(b.memo, Some(w.name(&memo2)));
    }

    #[test]
    fn p2_memo_survives_repeated_reads(
        raw in valid_name(),
        memo in arbitrary_memo(),
        reads in 0u32..=8u32,
    ) {
        let w = setup_world();
        let owner = Address::generate(&w.env);
        let dest = Address::generate(&w.env);
        let name = w.name(&raw);
        let memo_opt = Some(w.name(&memo));

        w.client().register(&name, &owner, &dest, &memo_opt, &1);

        // Reads are side-effect-free w.r.t. the payload: resolving any
        // number of times never alters the record.
        for _ in 0..reads {
            let _ = w.client().resolve(&name);
        }
        let resolution = w.client().resolve(&name);
        prop_assert_eq!(resolution.memo, memo_opt);
        prop_assert_eq!(resolution.address, dest);
    }
}

// ---------------------------------------------------------------------------
// P3 — ownership state machine vs a mirror model
// ---------------------------------------------------------------------------

/// Mirror of the registry ownership state the property maintains alongside
/// the contract: successfully registered names only.
#[derive(Default)]
struct Mirror {
    owners: std::collections::BTreeSet<std::string::String>,
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn p3_ownership_matches_mirror(ops in prop::collection::vec(registry_op(), 0..=24)) {
        let w = setup_world();
        let mut mirror = Mirror::default();
        // (name, current owner) for every successfully registered name.
        let mut tracked: std::vec::Vec<(std::string::String, Address)> = std::vec::Vec::new();
        let dest = Address::generate(&w.env);

        for op in ops {
            match op {
                Op::Register { name, memo } => {
                    let key = w.name(&name);
                    let owner = Address::generate(&w.env);
                    let fresh = !mirror.owners.contains(&name);
                    match w.client().try_register(&key, &owner, &dest, &memo.map(|m| w.name(&m)), &1) {
                        // Names from `valid_name()` satisfy every validation
                        // rule, so the only legal failure is a collision.
                        Ok(_) => {
                            prop_assert!(fresh, "duplicate name {name:?} must be rejected");
                            mirror.owners.insert(name.clone());
                            tracked.push((name.clone(), owner));
                        }
                        Err(inv) => {
                            prop_assert!(!fresh, "fresh name {name:?} must register");
                            prop_assert_eq!(inv.unwrap(), RegistryError::NameTaken);
                        }
                    }
                }
                Op::Transfer { idx } => {
                    if tracked.is_empty() {
                        continue;
                    }
                    let pos = usize::from(idx) % tracked.len();
                    let (name, current) = tracked[pos].clone();
                    let key = w.name(&name);
                    let new_owner = Address::generate(&w.env);

                    w.client().transfer(&key, &current, &new_owner);
                    tracked[pos].1 = new_owner;

                    // The old owner must now be rejected on every path.
                    let err = w
                        .client()
                        .try_set_address(&key, &current, &dest, &None)
                        .unwrap_err()
                        .unwrap();
                    prop_assert_eq!(err, RegistryError::Unauthorized,
                        "transferred-away owner must lose all control immediately");
                    let err = w
                        .client()
                        .try_transfer(&key, &current, &dest)
                        .unwrap_err()
                        .unwrap();
                    prop_assert_eq!(err, RegistryError::Unauthorized);
                }
                Op::SetAddress { idx, memo } => {
                    if tracked.is_empty() {
                        continue;
                    }
                    let pos = usize::from(idx) % tracked.len();
                    let (name, owner) = tracked[pos].clone();
                    let key = w.name(&name);
                    let new_dest = Address::generate(&w.env);
                    let memo_opt = memo.map(|m| w.name(&m));

                    // Only the tracked (current) owner acts; success is the
                    // only legal outcome.
                    w.client().set_address(&key, &owner, &new_dest, &memo_opt);
                    let resolution = w.client().resolve(&key);
                    prop_assert_eq!(resolution.address, new_dest);
                    prop_assert_eq!(resolution.memo, memo_opt);
                }
            }
        }

        // Global invariant: the mirror and the contract agree on how many
        // names exist, and every tracked name keeps its owner.
        prop_assert_eq!(w.client().total_names(), mirror.owners.len() as u64,
            "total_names must track successful registrations exactly");
        for (name, owner) in &tracked {
            let key = w.name(name);
            prop_assert!(w.client().exists(&key));
            prop_assert_eq!(w.client().owner_of(&key), owner.clone());
            let _ = w.client().resolve(&key);
        }
    }
}

// ---------------------------------------------------------------------------
// P4 — payment conservation and bounded expiry
// ---------------------------------------------------------------------------

/// One step: (name index, years, seconds to skip first, renew instead of register, payer index).
type Step = (usize, u32, u64, bool, usize);

fn step() -> impl Strategy<Value = Step> {
    (
        0usize..4,
        0u32..=MAX_YEARS + 2,
        prop_oneof![Just(0u64), 0u64..YEAR_SECONDS, 0u64..(2 * YEAR_SECONDS)],
        any::<bool>(),
        0usize..3,
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn p4_payments_balance_and_expiry_stays_bounded(steps in prop::collection::vec(step(), 1..25)) {
        let env = Env::default();
        env.mock_all_auths();
        let d = crate::testutil::deploy(&env, Prices { three: 700, four: 70, five_plus: 7 });
        let c = SideraRegistryClient::new(&env, &d.id);

        let names = ["abc", "abcd", "alice", "a-longer-name"];
        let payers: std::vec::Vec<Address> = (0..3).map(|_| Address::generate(&env)).collect();
        let start: i128 = 1_000_000;
        for p in &payers {
            d.fund(&env, p, start);
        }
        let total_supply = start * 3;
        let mut expected_treasury: i128 = 0;

        for (name_ix, years, skip, renew, payer_ix) in steps {
            env.ledger().with_mut(|l| l.timestamp += skip);
            let now = env.ledger().timestamp();
            let name = String::from_str(&env, names[name_ix]);
            let payer = &payers[payer_ix];
            let before = c.try_expires_at(&name).ok().and_then(Result::ok);
            let quote = c.try_price(&name, &years).ok().and_then(Result::ok);

            let result = if renew {
                c.try_renew(&name, payer, &years).ok().and_then(Result::ok)
            } else {
                c.try_register(&name, payer, payer, &None, &years).ok().and_then(Result::ok)
            };

            if let Some(expiry) = result {
                let paid = quote.expect("a successful call must have had a valid quote");
                expected_treasury += paid;
                prop_assert!(expiry <= now + u64::from(MAX_YEARS) * YEAR_SECONDS,
                    "expiry must stay within MAX_YEARS of now");
                prop_assert_eq!(c.expires_at(&name), expiry);
                if renew {
                    let old = before.expect("renewal needs an existing expiry");
                    prop_assert_eq!(expiry, old + u64::from(years) * YEAR_SECONDS,
                        "renewal adds exactly the paid years to the old expiry");
                }
            }

            // Conservation after every step, successful or not.
            let treasury = d.balance(&env, &d.treasury);
            prop_assert_eq!(treasury, expected_treasury,
                "treasury must hold exactly the quoted prices of successful calls");
            let held: i128 = payers.iter().map(|p| d.balance(&env, p)).sum();
            prop_assert_eq!(held + treasury, total_supply, "no token created or lost");
        }
    }
}

// ---------------------------------------------------------------------------
// P5 — owner index consistency
// ---------------------------------------------------------------------------

/// (op: 0 register / 1 transfer, name index, actor index, target index, seconds to skip)
type IndexStep = (u8, usize, usize, usize, u64);

fn index_step() -> impl Strategy<Value = IndexStep> {
    (
        0u8..2,
        0usize..5,
        0usize..3,
        0usize..3,
        prop_oneof![
            Just(0u64),
            0u64..YEAR_SECONDS,
            YEAR_SECONDS..(2 * YEAR_SECONDS)
        ],
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(256))]

    #[test]
    fn p5_names_of_matches_who_holds_what(steps in prop::collection::vec(index_step(), 1..30)) {
        let w = setup_world();
        let c = w.client();
        let owners: std::vec::Vec<Address> = (0..3).map(|_| Address::generate(&w.env)).collect();
        let pool = ["alpha", "bravo", "charlie", "delta", "echo"];
        // Mirror: name -> (owner index, expiry)
        let mut model: std::collections::BTreeMap<usize, (usize, u64)> = std::collections::BTreeMap::new();

        for (op, name_ix, actor, target, skip) in steps {
            w.env.ledger().with_mut(|l| l.timestamp += skip);
            let now = w.env.ledger().timestamp();
            // Released names leave the model.
            model.retain(|_, (_, exp)| now <= exp.saturating_add(GRACE_PERIOD_SECONDS));
            let name = w.name(pool[name_ix]);

            if op == 0 {
                let result = c.try_register(&name, &owners[actor], &owners[actor], &None, &1);
                let free = !model.contains_key(&name_ix);
                prop_assert_eq!(result.is_ok(), free, "register succeeds exactly when the name is free");
                if let Ok(Ok(exp)) = result {
                    model.insert(name_ix, (actor, exp));
                }
            } else {
                let result = c.try_transfer(&name, &owners[actor], &owners[target]);
                let allowed = matches!(model.get(&name_ix), Some((o, exp)) if *o == actor && now <= *exp);
                prop_assert_eq!(result.is_ok(), allowed, "only an active name's owner can transfer");
                if allowed {
                    model.get_mut(&name_ix).unwrap().0 = target;
                }
            }

            for (o_ix, owner) in owners.iter().enumerate() {
                let mut expected: std::vec::Vec<(std::string::String, u64)> = model
                    .iter()
                    .filter(|(_, (o, _))| *o == o_ix)
                    .map(|(n, (_, exp))| (pool[*n].into(), *exp))
                    .collect();
                expected.sort();
                let mut listed: std::vec::Vec<(std::string::String, u64)> = c
                    .names_of(owner)
                    .iter()
                    .map(|n| {
                        let mut buf = [0u8; 32];
                        let len = n.name.len() as usize;
                        n.name.copy_into_slice(&mut buf[..len]);
                        (std::string::String::from_utf8(buf[..len].to_vec()).unwrap(), n.expires_at)
                    })
                    .collect();
                listed.sort();
                prop_assert_eq!(listed, expected, "names_of must match the model for every owner");
            }
        }
    }
}
