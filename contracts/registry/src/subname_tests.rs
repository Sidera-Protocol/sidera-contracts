//! Subnames (`pay.alice`) and profile records.

use super::*;
use crate::testutil::{deploy, free};
use soroban_sdk::testutils::{Address as _, Ledger};

fn s(env: &Env, raw: &str) -> String {
    String::from_str(env, raw)
}

fn setup() -> (Env, SideraRegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let id = deploy(&env, free()).id;
    let client = SideraRegistryClient::new(&env, &id);
    let alice = Address::generate(&env);
    client.register(&s(&env, "alice"), &alice, &alice, &None, &1);
    (env, client, alice)
}

fn release(env: &Env) {
    env.ledger()
        .with_mut(|l| l.timestamp += YEAR_SECONDS + GRACE_PERIOD_SECONDS + 1);
}

#[test]
fn a_subname_resolves_to_its_own_address_and_memo() {
    let (env, c, alice) = setup();
    let exchange = Address::generate(&env);
    let memo = Some(s(&env, "48151623"));
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &alice, &exchange, &memo);

    let r = c.resolve(&s(&env, "pay.alice"));
    assert_eq!(
        r,
        Resolution {
            address: exchange.clone(),
            memo: memo.clone()
        }
    );
    // The parent still resolves to its own record.
    assert_eq!(c.resolve(&s(&env, "alice")).address, alice);
    // Listed by label.
    let subs = c.subnames(&s(&env, "alice"));
    assert_eq!(subs.len(), 1);
    assert_eq!(subs.get(s(&env, "pay")).unwrap().address, exchange);
}

#[test]
fn a_subname_can_be_updated_and_removed() {
    let (env, c, alice) = setup();
    let (a, b) = (Address::generate(&env), Address::generate(&env));
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &alice, &a, &None);
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &alice, &b, &None);
    assert_eq!(c.resolve(&s(&env, "pay.alice")).address, b);
    assert_eq!(c.subnames(&s(&env, "alice")).len(), 1);

    c.remove_subname(&s(&env, "alice"), &s(&env, "pay"), &alice);
    assert_eq!(
        c.try_resolve(&s(&env, "pay.alice")),
        Err(Ok(RegistryError::NotFound))
    );
    assert_eq!(
        c.try_remove_subname(&s(&env, "alice"), &s(&env, "pay"), &alice),
        Err(Ok(RegistryError::NotFound))
    );
}

#[test]
fn only_the_parent_owner_may_manage_subnames() {
    let (env, c, _alice) = setup();
    let mallory = Address::generate(&env);
    assert_eq!(
        c.try_set_subname(
            &s(&env, "alice"),
            &s(&env, "pay"),
            &mallory,
            &mallory,
            &None
        ),
        Err(Ok(RegistryError::Unauthorized))
    );
    assert_eq!(
        c.try_set_subname(
            &s(&env, "nobody"),
            &s(&env, "pay"),
            &mallory,
            &mallory,
            &None
        ),
        Err(Ok(RegistryError::NotFound))
    );
}

#[test]
fn subname_labels_and_memos_are_validated() {
    let (env, c, alice) = setup();
    for bad in [
        "",
        "-pay",
        "pay-",
        "Pay",
        "pa.y",
        "a b",
        "abcdefghijklmnopqrstuvwxyz0123456",
    ] {
        assert_eq!(
            c.try_set_subname(&s(&env, "alice"), &s(&env, bad), &alice, &alice, &None),
            Err(Ok(RegistryError::InvalidName)),
            "{bad}"
        );
    }
    // One-character labels are fine for subnames.
    c.set_subname(&s(&env, "alice"), &s(&env, "x"), &alice, &alice, &None);
    assert_eq!(
        c.try_set_subname(
            &s(&env, "alice"),
            &s(&env, "pay"),
            &alice,
            &alice,
            &Some(s(&env, &"9".repeat(29)))
        ),
        Err(Ok(RegistryError::InvalidMemo))
    );
}

#[test]
fn a_parent_may_have_at_most_the_limit_of_subnames() {
    let (env, c, alice) = setup();
    for i in 0..MAX_SUBNAMES {
        c.set_subname(
            &s(&env, "alice"),
            &s(&env, &std::format!("u{i}")),
            &alice,
            &alice,
            &None,
        );
    }
    assert_eq!(
        c.try_set_subname(
            &s(&env, "alice"),
            &s(&env, "one-more"),
            &alice,
            &alice,
            &None
        ),
        Err(Ok(RegistryError::TooManyNames))
    );
    // Updating an existing one is still allowed.
    c.set_subname(
        &s(&env, "alice"),
        &s(&env, "u0"),
        &alice,
        &alice,
        &Some(s(&env, "7")),
    );
}

#[test]
fn subnames_stop_with_the_parent_and_come_back_on_renewal() {
    let (env, c, alice) = setup();
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &alice, &alice, &None);
    env.ledger().with_mut(|l| l.timestamp += YEAR_SECONDS + 1);
    assert_eq!(
        c.try_resolve(&s(&env, "pay.alice")),
        Err(Ok(RegistryError::NameExpired))
    );
    assert!(c.subnames(&s(&env, "alice")).is_empty());

    // Renewed during the grace period: same registration, subnames are back.
    c.renew(&s(&env, "alice"), &alice, &1);
    assert_eq!(c.resolve(&s(&env, "pay.alice")).address, alice);
}

#[test]
fn a_new_registrant_does_not_inherit_subnames_or_records() {
    let (env, c, alice) = setup();
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &alice, &alice, &None);
    c.set_record(
        &s(&env, "alice"),
        &alice,
        &s(&env, "url"),
        &Some(s(&env, "https://alice.example")),
    );
    release(&env);

    let bob = Address::generate(&env);
    c.register(&s(&env, "alice"), &bob, &bob, &None, &1);
    assert_eq!(
        c.try_resolve(&s(&env, "pay.alice")),
        Err(Ok(RegistryError::NotFound))
    );
    assert!(c.subnames(&s(&env, "alice")).is_empty());
    assert!(c.records(&s(&env, "alice")).is_empty());

    // Bob starts fresh and can use the same labels.
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &bob, &bob, &None);
    assert_eq!(c.resolve(&s(&env, "pay.alice")).address, bob);
}

#[test]
fn a_transfer_hands_subnames_to_the_new_owner() {
    let (env, c, alice) = setup();
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &alice, &alice, &None);
    let bob = Address::generate(&env);
    c.transfer(&s(&env, "alice"), &alice, &bob);
    // Existing subnames keep resolving; only the new owner manages them.
    assert_eq!(c.resolve(&s(&env, "pay.alice")).address, alice);
    assert_eq!(
        c.try_remove_subname(&s(&env, "alice"), &s(&env, "pay"), &alice),
        Err(Ok(RegistryError::Unauthorized))
    );
    c.remove_subname(&s(&env, "alice"), &s(&env, "pay"), &bob);
}

#[test]
fn malformed_dotted_names_do_not_resolve() {
    let (env, c, alice) = setup();
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &alice, &alice, &None);
    for bad in [
        ".alice",
        "pay.",
        "pay.alice.",
        "x.pay.alice",
        "pay..alice",
        "pay.nobody",
    ] {
        assert_eq!(
            c.try_resolve(&s(&env, bad)),
            Err(Ok(RegistryError::NotFound)),
            "{bad}"
        );
    }
    let long = std::format!("{}.alice", "a".repeat(80));
    assert_eq!(
        c.try_resolve(&s(&env, &long)),
        Err(Ok(RegistryError::NotFound))
    );
}

#[test]
fn profile_records_can_be_set_read_and_deleted() {
    let (env, c, alice) = setup();
    let name = s(&env, "alice");
    c.set_record(
        &name,
        &alice,
        &s(&env, "avatar"),
        &Some(s(&env, "https://img.example/a.png")),
    );
    c.set_record(
        &name,
        &alice,
        &s(&env, "com.github"),
        &Some(s(&env, "alice")),
    );
    let r = c.records(&name);
    assert_eq!(r.len(), 2);
    assert_eq!(r.get(s(&env, "com.github")).unwrap(), s(&env, "alice"));

    c.set_record(&name, &alice, &s(&env, "avatar"), &None);
    assert_eq!(c.records(&name).len(), 1);
    assert!(c.records(&s(&env, "nobody")).is_empty());
}

#[test]
fn profile_records_are_validated_and_limited() {
    let (env, c, alice) = setup();
    let name = s(&env, "alice");
    let mallory = Address::generate(&env);
    assert_eq!(
        c.try_set_record(&name, &mallory, &s(&env, "url"), &Some(s(&env, "x"))),
        Err(Ok(RegistryError::Unauthorized))
    );
    for bad in ["", "Url", "u rl", &"k".repeat(33)] {
        assert_eq!(
            c.try_set_record(&name, &alice, &s(&env, bad), &Some(s(&env, "x"))),
            Err(Ok(RegistryError::InvalidRecord)),
            "{bad}"
        );
    }
    for bad_value in ["", &"v".repeat(257)] {
        assert_eq!(
            c.try_set_record(&name, &alice, &s(&env, "url"), &Some(s(&env, bad_value))),
            Err(Ok(RegistryError::InvalidRecord))
        );
    }
    c.set_record(
        &name,
        &alice,
        &s(&env, "url"),
        &Some(s(&env, &"v".repeat(256))),
    );
    for i in 1..MAX_RECORDS {
        c.set_record(
            &name,
            &alice,
            &s(&env, &std::format!("k{i}")),
            &Some(s(&env, "v")),
        );
    }
    assert_eq!(
        c.try_set_record(&name, &alice, &s(&env, "extra"), &Some(s(&env, "v"))),
        Err(Ok(RegistryError::InvalidRecord))
    );
    // Replacing and deleting still work at the limit.
    c.set_record(&name, &alice, &s(&env, "url"), &Some(s(&env, "short")));
    c.set_record(&name, &alice, &s(&env, "k1"), &None);
    c.set_record(&name, &alice, &s(&env, "extra"), &Some(s(&env, "v")));
}

#[test]
fn records_hide_while_expired() {
    let (env, c, alice) = setup();
    c.set_record(
        &s(&env, "alice"),
        &alice,
        &s(&env, "url"),
        &Some(s(&env, "x")),
    );
    env.ledger().with_mut(|l| l.timestamp += YEAR_SECONDS + 1);
    assert!(c.records(&s(&env, "alice")).is_empty());
    assert_eq!(
        c.try_set_record(&s(&env, "alice"), &alice, &s(&env, "url"), &None),
        Err(Ok(RegistryError::NameExpired))
    );
}

#[test]
fn names_registered_before_the_upgrade_work_with_subnames() {
    let (env, c, alice) = setup();
    // Names registered before this version have no registration stamp.
    env.as_contract(&c.address, || {
        env.storage()
            .persistent()
            .remove(&DataKey::Epoch(s(&env, "alice")));
    });
    c.renew(&s(&env, "alice"), &alice, &1);
    c.set_subname(&s(&env, "alice"), &s(&env, "pay"), &alice, &alice, &None);
    c.set_record(
        &s(&env, "alice"),
        &alice,
        &s(&env, "url"),
        &Some(s(&env, "x")),
    );
    assert_eq!(c.resolve(&s(&env, "pay.alice")).address, alice);

    env.ledger()
        .with_mut(|l| l.timestamp += 2 * YEAR_SECONDS + GRACE_PERIOD_SECONDS + 1);
    let bob = Address::generate(&env);
    c.register(&s(&env, "alice"), &bob, &bob, &None, &1);
    assert!(c.subnames(&s(&env, "alice")).is_empty());
    assert!(c.records(&s(&env, "alice")).is_empty());
}
