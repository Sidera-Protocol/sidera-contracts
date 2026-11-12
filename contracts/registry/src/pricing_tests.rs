//! Pricing, expiry, grace period, renewals and admin settings.

use super::*;
use crate::testutil::{deploy, Deployed};
use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{IntoVal, Symbol};

/// 3 chars: 100, 4 chars: 20, 5+: 5 (per year).
fn prices() -> Prices {
    Prices {
        three: 100,
        four: 20,
        five_plus: 5,
    }
}

fn s(env: &Env, raw: &str) -> String {
    String::from_str(env, raw)
}

fn setup() -> (Env, Deployed) {
    let env = Env::default();
    env.mock_all_auths();
    let d = deploy(&env, prices());
    (env, d)
}

fn client<'a>(env: &'a Env, d: &Deployed) -> SideraRegistryClient<'a> {
    SideraRegistryClient::new(env, &d.id)
}

fn skip(env: &Env, seconds: u64) {
    env.ledger().with_mut(|l| l.timestamp += seconds);
}

// ------------------------------------------------------------------ pricing

#[test]
fn price_depends_on_length_and_years() {
    let (env, d) = setup();
    let c = client(&env, &d);
    assert_eq!(c.price(&s(&env, "abc"), &1), 100);
    assert_eq!(c.price(&s(&env, "abcd"), &1), 20);
    assert_eq!(c.price(&s(&env, "abcde"), &1), 5);
    assert_eq!(c.price(&s(&env, "a-very-long-name"), &3), 15);
    assert_eq!(c.price(&s(&env, "abc"), &MAX_YEARS), 1_000);
}

#[test]
fn register_moves_exactly_the_price_from_owner_to_treasury() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 1_000);

    c.register(&s(&env, "abcd"), &owner, &owner, &None, &3);

    assert_eq!(d.balance(&env, &owner), 1_000 - 60);
    assert_eq!(d.balance(&env, &d.treasury), 60);
}

#[test]
fn register_without_enough_funds_fails_and_writes_nothing() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 99);

    assert!(c
        .try_register(&s(&env, "abc"), &owner, &owner, &None, &1)
        .is_err());
    assert!(!c.exists(&s(&env, "abc")));
    assert!(c.is_available(&s(&env, "abc")));
    assert_eq!(c.total_names(), 0);
    assert_eq!(d.balance(&env, &owner), 99);
    assert_eq!(d.balance(&env, &d.treasury), 0);
}

#[test]
fn years_must_be_between_one_and_max() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 10_000);

    for years in [0, MAX_YEARS + 1] {
        assert_eq!(
            c.try_register(&s(&env, "alice"), &owner, &owner, &None, &years)
                .unwrap_err()
                .unwrap(),
            RegistryError::InvalidYears
        );
        assert_eq!(
            c.try_price(&s(&env, "alice"), &years).unwrap_err().unwrap(),
            RegistryError::InvalidYears
        );
    }
}

#[test]
fn paid_register_needs_the_owner_to_authorize_the_payment() {
    let env = Env::default();
    let d = deploy(&env, prices());
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 1_000);

    // The owner signs the registration *and* the token transfer inside it.
    c.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &d.id,
            fn_name: "register",
            args: (
                s(&env, "alice"),
                owner.clone(),
                owner.clone(),
                None::<String>,
                2_u32,
            )
                .into_val(&env),
            sub_invokes: &[MockAuthInvoke {
                contract: &d.token,
                fn_name: "transfer",
                args: (owner.clone(), d.treasury.clone(), 10_i128).into_val(&env),
                sub_invokes: &[],
            }],
        },
    }])
    .register(&s(&env, "alice"), &owner, &owner, &None, &2);

    assert_eq!(d.balance(&env, &d.treasury), 10);
}

// ------------------------------------------------------------------ expiry & grace

#[test]
fn registration_expires_after_the_paid_years() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 1_000);
    skip(&env, 1_000);

    let expiry = c.register(&s(&env, "alice"), &owner, &owner, &None, &2);
    assert_eq!(expiry, 1_000 + 2 * YEAR_SECONDS);
    assert_eq!(c.expires_at(&s(&env, "alice")), expiry);

    // Still resolving on its last second.
    env.ledger().with_mut(|l| l.timestamp = expiry);
    assert_eq!(c.resolve(&s(&env, "alice")).address, owner);
}

#[test]
fn an_expired_name_stops_resolving_and_cannot_be_changed() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    let other = Address::generate(&env);
    d.fund(&env, &owner, 1_000);
    d.fund(&env, &other, 1_000);

    c.register(&s(&env, "alice"), &owner, &owner, &None, &1);
    skip(&env, YEAR_SECONDS + 1);

    let expired = RegistryError::NameExpired;
    assert_eq!(
        c.try_resolve(&s(&env, "alice")).unwrap_err().unwrap(),
        expired
    );
    assert_eq!(
        c.try_set_address(&s(&env, "alice"), &owner, &other, &None)
            .unwrap_err()
            .unwrap(),
        expired
    );
    assert_eq!(
        c.try_transfer(&s(&env, "alice"), &owner, &other)
            .unwrap_err()
            .unwrap(),
        expired
    );
    assert_eq!(
        c.try_set_primary_name(&owner, &s(&env, "alice"))
            .unwrap_err()
            .unwrap(),
        expired
    );

    // During the grace period the name is still reserved for its owner.
    assert!(c.exists(&s(&env, "alice")));
    assert!(!c.is_available(&s(&env, "alice")));
    assert_eq!(c.owner_of(&s(&env, "alice")), owner);
    assert_eq!(
        c.try_register(&s(&env, "alice"), &other, &other, &None, &1)
            .unwrap_err()
            .unwrap(),
        RegistryError::NameTaken
    );
}

#[test]
fn after_the_grace_period_anyone_can_register_the_name() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    let newcomer = Address::generate(&env);
    d.fund(&env, &owner, 1_000);
    d.fund(&env, &newcomer, 1_000);

    c.register(&s(&env, "alice"), &owner, &owner, &None, &1);
    skip(&env, YEAR_SECONDS + GRACE_PERIOD_SECONDS + 1);

    assert!(!c.exists(&s(&env, "alice")));
    assert!(c.is_available(&s(&env, "alice")));
    assert_eq!(
        c.try_resolve(&s(&env, "alice")).unwrap_err().unwrap(),
        RegistryError::NotFound
    );
    assert_eq!(
        c.try_renew(&s(&env, "alice"), &owner, &1)
            .unwrap_err()
            .unwrap(),
        RegistryError::NotFound
    );

    c.register(&s(&env, "alice"), &newcomer, &newcomer, &None, &1);
    assert_eq!(c.owner_of(&s(&env, "alice")), newcomer);
    assert_eq!(c.resolve(&s(&env, "alice")).address, newcomer);
    // The previous owner has no control left.
    assert_eq!(
        c.try_set_address(&s(&env, "alice"), &owner, &owner, &None)
            .unwrap_err()
            .unwrap(),
        RegistryError::Unauthorized
    );
    // Re-registering a released name does not count as a new name.
    assert_eq!(c.total_names(), 1);
}

// ------------------------------------------------------------------ renewals

#[test]
fn renewal_extends_from_the_current_expiry_and_anyone_can_pay() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    let friend = Address::generate(&env);
    d.fund(&env, &owner, 1_000);
    d.fund(&env, &friend, 1_000);

    let first = c.register(&s(&env, "abcd"), &owner, &owner, &None, &1);
    skip(&env, 1_000);
    let renewed = c.renew(&s(&env, "abcd"), &friend, &2);

    assert_eq!(renewed, first + 2 * YEAR_SECONDS);
    assert_eq!(c.expires_at(&s(&env, "abcd")), renewed);
    assert_eq!(d.balance(&env, &friend), 1_000 - 40);
    assert_eq!(d.balance(&env, &d.treasury), 20 + 40);
    // Paying for someone's renewal gives no ownership.
    assert_eq!(c.owner_of(&s(&env, "abcd")), owner);
}

#[test]
fn renewing_in_the_grace_period_restores_the_name() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 1_000);

    let first = c.register(&s(&env, "alice"), &owner, &owner, &None, &1);
    skip(&env, YEAR_SECONDS + 86_400);
    assert_eq!(
        c.try_resolve(&s(&env, "alice")).unwrap_err().unwrap(),
        RegistryError::NameExpired
    );

    let renewed = c.renew(&s(&env, "alice"), &owner, &1);
    // Counted from the old expiry, so the gap is not free time.
    assert_eq!(renewed, first + YEAR_SECONDS);
    assert_eq!(c.resolve(&s(&env, "alice")).address, owner);
}

#[test]
fn renewal_cannot_go_past_the_maximum_horizon() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 10_000);

    c.register(&s(&env, "alice"), &owner, &owner, &None, &MAX_YEARS);
    assert_eq!(
        c.try_renew(&s(&env, "alice"), &owner, &1)
            .unwrap_err()
            .unwrap(),
        RegistryError::PeriodTooLong
    );
    // Nothing was charged for the refused renewal.
    assert_eq!(d.balance(&env, &d.treasury), 5 * i128::from(MAX_YEARS));
}

#[test]
fn renew_emits_renewed_event() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 1_000);
    let first = c.register(&s(&env, "alice"), &owner, &owner, &None, &1);

    c.renew(&s(&env, "alice"), &owner, &2);

    // The token's own transfer event is filtered out; only ours is checked.
    assert_eq!(
        env.events().all().filter_by_contract(&d.id),
        soroban_sdk::vec![
            &env,
            (
                d.id.clone(),
                soroban_sdk::vec![
                    &env,
                    Symbol::new(&env, "renewed").into_val(&env),
                    s(&env, "alice").into_val(&env),
                ],
                (owner, 2_u32, first + 2 * YEAR_SECONDS, 10_i128).into_val(&env),
            ),
        ]
    );
}

// ------------------------------------------------------------------ admin

#[test]
fn admin_changes_prices_and_new_prices_apply() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    d.fund(&env, &owner, 1_000);

    let new = Prices {
        three: 300,
        four: 30,
        five_plus: 3,
    };
    c.set_prices(&new);
    assert_eq!(c.config().prices, new);

    c.register(&s(&env, "alice"), &owner, &owner, &None, &1);
    assert_eq!(d.balance(&env, &d.treasury), 3);
}

#[test]
fn negative_prices_are_refused() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let bad = Prices {
        three: 1,
        four: -1,
        five_plus: 1,
    };
    assert_eq!(
        c.try_set_prices(&bad).unwrap_err().unwrap(),
        RegistryError::InvalidPrice
    );
    assert_eq!(c.config().prices, prices());
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn deploying_with_a_negative_price_fails() {
    let env = Env::default();
    deploy(
        &env,
        Prices {
            three: -1,
            four: 0,
            five_plus: 0,
        },
    );
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn only_the_admin_can_change_prices() {
    let env = Env::default();
    let d = deploy(&env, prices());
    let c = client(&env, &d);
    let stranger = Address::generate(&env);

    c.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &d.id,
            fn_name: "set_prices",
            args: (crate::testutil::free(),).into_val(&env),
            sub_invokes: &[],
        },
    }])
    .set_prices(&crate::testutil::free());
}

#[test]
fn treasury_change_routes_new_payments() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let owner = Address::generate(&env);
    let vault = Address::generate(&env);
    d.fund(&env, &owner, 1_000);

    c.set_treasury(&vault);
    c.register(&s(&env, "alice"), &owner, &owner, &None, &1);

    assert_eq!(d.balance(&env, &vault), 5);
    assert_eq!(d.balance(&env, &d.treasury), 0);
}

#[test]
#[should_panic(expected = "Error(Auth, InvalidAction)")]
fn admin_handover_needs_the_new_admin_to_sign_too() {
    let env = Env::default();
    let d = deploy(&env, prices());
    let c = client(&env, &d);
    let new_admin = Address::generate(&env);

    // Only the current admin signs: refused.
    c.mock_auths(&[MockAuth {
        address: &d.admin,
        invoke: &MockAuthInvoke {
            contract: &d.id,
            fn_name: "set_admin",
            args: (new_admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }])
    .set_admin(&new_admin);
}

#[test]
fn admin_handover_with_both_signatures() {
    let (env, d) = setup();
    let c = client(&env, &d);
    let new_admin = Address::generate(&env);
    c.set_admin(&new_admin);
    assert_eq!(c.config().admin, new_admin);
}
