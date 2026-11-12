//! The per-owner name list (`names_of`) and admin upgrades.

use super::*;
use crate::testutil::{deploy, free};
use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::IntoVal;

fn s(env: &Env, raw: &str) -> String {
    String::from_str(env, raw)
}

fn setup() -> (Env, SideraRegistryClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let id = deploy(&env, free()).id;
    let client = SideraRegistryClient::new(&env, &id);
    (env, client)
}

fn names(
    env: &Env,
    c: &SideraRegistryClient<'_>,
    owner: &Address,
) -> std::vec::Vec<std::string::String> {
    c.names_of(owner)
        .iter()
        .map(|n| {
            let mut buf = [0u8; 32];
            let len = n.name.len() as usize;
            n.name.copy_into_slice(&mut buf[..len]);
            let _ = env;
            std::string::String::from_utf8(buf[..len].to_vec()).unwrap()
        })
        .collect()
}

#[test]
fn names_of_lists_registered_names_with_their_expiry() {
    let (env, c) = setup();
    let owner = Address::generate(&env);
    let e1 = c.register(&s(&env, "alpha"), &owner, &owner, &None, &1);
    let e2 = c.register(&s(&env, "bravo"), &owner, &owner, &None, &3);

    let held = c.names_of(&owner);
    assert_eq!(held.len(), 2);
    assert_eq!(
        held.get(0).unwrap(),
        OwnedName {
            name: s(&env, "alpha"),
            expires_at: e1
        }
    );
    assert_eq!(
        held.get(1).unwrap(),
        OwnedName {
            name: s(&env, "bravo"),
            expires_at: e2
        }
    );
    assert!(c.names_of(&Address::generate(&env)).is_empty());
}

#[test]
fn renewal_shows_in_the_listed_expiry() {
    let (env, c) = setup();
    let owner = Address::generate(&env);
    c.register(&s(&env, "alpha"), &owner, &owner, &None, &1);
    let renewed = c.renew(&s(&env, "alpha"), &owner, &2);
    assert_eq!(c.names_of(&owner).get(0).unwrap().expires_at, renewed);
}

#[test]
fn transfer_moves_the_name_between_lists() {
    let (env, c) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    c.register(&s(&env, "alpha"), &a, &a, &None, &1);
    c.register(&s(&env, "bravo"), &a, &a, &None, &1);

    c.transfer(&s(&env, "alpha"), &a, &b);

    assert_eq!(names(&env, &c, &a), ["bravo"]);
    assert_eq!(names(&env, &c, &b), ["alpha"]);
}

/// Found by property test P5: a self-transfer used to drop the name from the list.
#[test]
fn transferring_to_oneself_keeps_the_name_listed() {
    let (env, c) = setup();
    let owner = Address::generate(&env);
    c.register(&s(&env, "alpha"), &owner, &owner, &None, &1);
    c.transfer(&s(&env, "alpha"), &owner, &owner);
    assert_eq!(names(&env, &c, &owner), ["alpha"]);
}

#[test]
fn expired_names_stay_listed_during_grace_then_drop() {
    let (env, c) = setup();
    let owner = Address::generate(&env);
    c.register(&s(&env, "alpha"), &owner, &owner, &None, &1);

    env.ledger().with_mut(|l| l.timestamp += YEAR_SECONDS + 1);
    assert_eq!(
        names(&env, &c, &owner),
        ["alpha"],
        "still renewable, so still listed"
    );

    env.ledger()
        .with_mut(|l| l.timestamp += GRACE_PERIOD_SECONDS);
    assert!(
        c.names_of(&owner).is_empty(),
        "released names are not listed"
    );
}

#[test]
fn a_released_name_moves_to_whoever_registers_it_next() {
    let (env, c) = setup();
    let old = Address::generate(&env);
    let new = Address::generate(&env);
    c.register(&s(&env, "alpha"), &old, &old, &None, &1);
    env.ledger()
        .with_mut(|l| l.timestamp += YEAR_SECONDS + GRACE_PERIOD_SECONDS + 1);

    c.register(&s(&env, "alpha"), &new, &new, &None, &1);

    assert!(c.names_of(&old).is_empty());
    assert_eq!(names(&env, &c, &new), ["alpha"]);
    // The old owner registering a different name does not resurrect it.
    c.register(&s(&env, "bravo"), &old, &old, &None, &1);
    assert_eq!(names(&env, &c, &old), ["bravo"]);
}

#[test]
fn an_owner_may_hold_at_most_the_limit_and_released_names_free_space() {
    let (env, c) = setup();
    let owner = Address::generate(&env);
    for i in 0..MAX_NAMES_PER_OWNER {
        let raw = std::format!("name{i:03}");
        c.register(&s(&env, &raw), &owner, &owner, &None, &1);
    }
    assert_eq!(c.names_of(&owner).len(), MAX_NAMES_PER_OWNER);
    assert_eq!(
        c.try_register(&s(&env, "one-too-many"), &owner, &owner, &None, &1)
            .unwrap_err()
            .unwrap(),
        RegistryError::TooManyNames
    );

    // Once the old names are released, there is room again.
    env.ledger()
        .with_mut(|l| l.timestamp += YEAR_SECONDS + GRACE_PERIOD_SECONDS + 1);
    c.register(&s(&env, "fresh-start"), &owner, &owner, &None, &1);
    assert_eq!(names(&env, &c, &owner), ["fresh-start"]);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn only_the_admin_can_upgrade() {
    let env = Env::default();
    let d = deploy(&env, free());
    let c = SideraRegistryClient::new(&env, &d.id);
    let stranger = Address::generate(&env);
    let hash = BytesN::from_array(&env, &[7; 32]);
    c.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &d.id,
            fn_name: "upgrade",
            args: (hash.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }])
    .upgrade(&hash);
}
