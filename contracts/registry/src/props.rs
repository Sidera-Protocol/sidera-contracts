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
//! Runs are deterministic (fixed default seed); a failure prints its case
//! for replay. Override the case count with
//! `PROPTEST_CASES=n cargo test -p sidera-registry props`.

use super::*;
use proptest::prelude::*;
use soroban_sdk::testutils::Address as _;

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
    let id = env.register(SideraRegistry, ());
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
        w.client().register(&name, &owner, &dest, &None);
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

        let accepted = match w.client().try_register(&name, &owner, &dest, &None) {
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

        w.client().register(&name, &owner_a, &dest_a, &Some(w.name(&memo_a)));
        let err = w
            .client()
            .try_register(&name, &owner_b, &dest_b, &Some(w.name(&memo_b)))
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
        w.client().register(&name, &owner, &dest, &memo_opt);

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

        w.client().register(&name_a, &owner, &dest_a, &Some(w.name(&memo1)));
        w.client().register(&name_b, &owner, &dest_b, &Some(w.name(&memo2)));

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

        w.client().register(&name, &owner, &dest, &memo_opt);

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
                    match w.client().try_register(&key, &owner, &dest, &memo.map(|m| w.name(&m))) {
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
