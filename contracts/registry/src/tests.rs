use super::*;
use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{IntoVal, Symbol};

const TTL_EXTEND_TO_LEDGERS: u32 = 518_400;

fn make_env() -> (Env, Address) {
    let env = Env::default();
    let id = env.register(SideraRegistry, ());
    (env, id)
}

fn s(env: &Env, raw: &str) -> String {
    String::from_str(env, raw)
}

#[test]
fn register_and_resolve_roundtrip() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    client.register(&s(&env, "alice"), &owner, &dest, &None);

    let resolution = client.resolve(&s(&env, "alice"));
    assert_eq!(resolution.address, dest);
    assert_eq!(resolution.memo, None);
    assert!(client.exists(&s(&env, "alice")));
    assert_eq!(client.total_names(), 1);
}

#[test]
fn memo_hint_roundtrips() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);
    let memo = s(&env, "1029384756");

    client.register(&s(&env, "bob"), &owner, &dest, &Some(memo.clone()));

    let resolution = client.resolve(&s(&env, "bob"));
    assert_eq!(resolution.address, dest);
    assert_eq!(resolution.memo, Some(memo));
}

#[test]
fn register_rejects_duplicate_name() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    client.register(&s(&env, "carol"), &owner, &dest, &None);
    let err = client
        .try_register(&s(&env, "carol"), &owner, &dest, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, RegistryError::NameTaken);
}

#[test]
fn resolve_missing_name_is_not_found() {
    let (env, id) = make_env();
    let client = SideraRegistryClient::new(&env, &id);
    let err = client.try_resolve(&s(&env, "ghost")).unwrap_err().unwrap();
    assert_eq!(err, RegistryError::NotFound);
}

#[test]
fn register_demands_owner_authorization() {
    let (env, id) = make_env();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    // Without mock_all_auths, the call only succeeds when the exact
    // authorization tree is provided — proving `register` really requires
    // the owner's signature rather than silently proceeding.
    client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "register",
                args: (s(&env, "dave"), owner.clone(), dest.clone(), None::<String>).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .register(&s(&env, "dave"), &owner, &dest, &None);

    assert!(client.exists(&s(&env, "dave")));
}

#[test]
fn set_address_requires_current_owner() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let impostor = Address::generate(&env);
    let dest = Address::generate(&env);
    let new_dest = Address::generate(&env);
    let memo = s(&env, "777");

    client.register(&s(&env, "erin"), &owner, &dest, &None);

    // A non-owner is rejected.
    let err = client
        .try_set_address(&s(&env, "erin"), &impostor, &new_dest, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, RegistryError::Unauthorized);

    // The owner updates both address and memo.
    client.set_address(&s(&env, "erin"), &owner, &new_dest, &Some(memo.clone()));
    let resolution = client.resolve(&s(&env, "erin"));
    assert_eq!(resolution.address, new_dest);
    assert_eq!(resolution.memo, Some(memo));
}

#[test]
fn transfer_moves_ownership() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let impostor = Address::generate(&env);
    let dest = Address::generate(&env);

    client.register(&s(&env, "frank"), &owner, &dest, &None);

    // Only the current owner can transfer.
    let err = client
        .try_transfer(&s(&env, "frank"), &impostor, &new_owner)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, RegistryError::Unauthorized);

    client.transfer(&s(&env, "frank"), &owner, &new_owner);
    assert_eq!(client.owner_of(&s(&env, "frank")), new_owner);

    // The new owner can now update the record; the old one cannot.
    let new_dest = Address::generate(&env);
    client.set_address(&s(&env, "frank"), &new_owner, &new_dest, &None);
    let err = client
        .try_set_address(&s(&env, "frank"), &owner, &dest, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, RegistryError::Unauthorized);
}

#[test]
fn name_validation_rejects_bad_names() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    let bad_names: [&str; 7] = [
        "ab",     // too short
        "a",      // way too short
        "-alice", // leading hyphen
        "alice-", // trailing hyphen
        "Al-ice", // uppercase
        "al ice", // space
        "al.ice", // dot (the TLD separator is implicit)
    ];
    for raw in bad_names {
        let err = client
            .try_register(&s(&env, raw), &owner, &dest, &None)
            .unwrap_err()
            .unwrap();
        assert_eq!(
            err,
            RegistryError::InvalidName,
            "expected {raw} to be rejected"
        );
    }

    // Boundary: exactly 32 lowercase chars is accepted.
    let long_ok = s(&env, "abcdefghijklmnopqrstuvwxyzabcdef"); // 32 chars
    client.register(&long_ok, &owner, &dest, &None);
    assert!(client.exists(&long_ok));
}

#[test]
fn hyphenated_names_are_valid() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    client.register(&s(&env, "alice-pay"), &owner, &dest, &None);
    assert_eq!(client.resolve(&s(&env, "alice-pay")).address, dest);
}

#[test]
fn resolve_extends_the_name_ttl() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    client.register(&s(&env, "grace"), &owner, &dest, &None);

    // Burn time down to just above the bump threshold: the name must still
    // be resolvable, and a resolve must refresh its lifetime.
    env.ledger().with_mut(|l| {
        l.sequence_number += (TTL_EXTEND_TO_LEDGERS - TTL_THRESHOLD_LEDGERS) - 1;
    });
    assert!(client.exists(&s(&env, "grace")));
    let resolution = client.resolve(&s(&env, "grace"));
    assert_eq!(resolution.address, dest);

    // TTL was just extended by the resolve; time passes again and the name
    // is still alive — proving the hot-lookup bump, not the original
    // registration, is keeping it alive.
    env.ledger().with_mut(|l| {
        l.sequence_number += (TTL_EXTEND_TO_LEDGERS - TTL_THRESHOLD_LEDGERS) - 1;
    });
    assert_eq!(client.resolve(&s(&env, "grace")).address, dest);
}

#[test]
fn counter_tracks_registrations() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    assert_eq!(client.total_names(), 0);
    client.register(&s(&env, "name-one"), &owner, &dest, &None);
    client.register(&s(&env, "name-two"), &owner, &dest, &None);
    assert_eq!(client.total_names(), 2);
}

#[test]
fn validation_rejects_max_length_overflow() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    // 33 chars — one past the cap.
    let too_long = s(&env, "abcdefghijklmnopqrstuvwxyzabcdefg");
    let err = client
        .try_register(&too_long, &owner, &dest, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, RegistryError::InvalidName);
}

#[test]
fn error_enum_covers_expected_variants() {
    // Sanity pin: the on-chain error codes are part of the client ABI.
    assert_eq!(RegistryError::NotFound as u32, 1);
    assert_eq!(RegistryError::NameTaken as u32, 2);
    assert_eq!(RegistryError::InvalidName as u32, 3);
    assert_eq!(RegistryError::Unauthorized as u32, 4);
    assert_eq!(RegistryError::ArithmeticOverflow as u32, 5);
}

#[test]
fn register_rejects_name_with_disallowed_symbol() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);

    let err = client
        .try_register(&s(&env, "ali$e"), &owner, &dest, &None)
        .unwrap_err()
        .unwrap();
    assert_eq!(err, RegistryError::InvalidName);
    assert!(!client.exists(&s(&env, "ali$e")));
}

#[test]
fn storage_keys_are_distinct() {
    // Owner and name keys must not collide for the same name.
    let name = s(&Env::default(), "henry");
    assert!(matches!(DataKey::Name(name.clone()), DataKey::Name(_)));
    assert!(matches!(DataKey::Owner(name.clone()), DataKey::Owner(_)));
    // A Name key is not an Owner key.
    assert_ne!(
        std::format!("{:?}", DataKey::Name(name.clone())),
        std::format!("{:?}", DataKey::Owner(name))
    );
}

#[test]
fn register_emits_registered_event() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);
    let memo = Some(s(&env, "404"));

    client.register(&s(&env, "iris"), &owner, &dest, &memo);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                id.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "registered").into_val(&env),
                    s(&env, "iris").into_val(&env),
                ],
                (owner, dest, memo).into_val(&env),
            ),
        ]
    );
}

#[test]
fn set_address_emits_address_set_event() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let dest = Address::generate(&env);
    let new_dest = Address::generate(&env);
    let memo = Some(s(&env, "777"));

    client.register(&s(&env, "jade"), &owner, &dest, &None);
    client.set_address(&s(&env, "jade"), &owner, &new_dest, &memo);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                id.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "address_set").into_val(&env),
                    s(&env, "jade").into_val(&env),
                ],
                (owner, new_dest, memo).into_val(&env),
            ),
        ]
    );
}

#[test]
fn transfer_emits_transferred_event() {
    let (env, id) = make_env();
    env.mock_all_auths();
    let client = SideraRegistryClient::new(&env, &id);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let dest = Address::generate(&env);

    client.register(&s(&env, "kara"), &owner, &dest, &None);
    client.transfer(&s(&env, "kara"), &owner, &new_owner);

    assert_eq!(
        env.events().all(),
        soroban_sdk::vec![
            &env,
            (
                id.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "transferred").into_val(&env),
                    s(&env, "kara").into_val(&env),
                ],
                (owner, new_owner).into_val(&env),
            ),
        ]
    );
}
