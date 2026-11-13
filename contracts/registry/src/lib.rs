//! # Sidera Registry Contract
//!
//! Maps human-readable names (`alice.sid`) to Stellar addresses with
//! memo hints, so payments never go to the wrong place.
//!
//! Names are **rented by the year** and paid for in a SEP-41 token (for
//! example XLM or USDC through its Stellar Asset Contract). The price per
//! year depends on the name's length. A name stops resolving when it
//! expires; for a grace period afterwards only renewal is possible, and
//! after that anyone may register it again.
//!
//! Authorization model:
//! - `register` requires the registering owner, who also pays.
//! - `renew` requires the payer (anyone may renew a name).
//! - `set_address` and `transfer` require the current owner of an active name.
//! - `set_primary_name` requires the address, which must be the owner of the
//!   name *and* the address the name resolves to.
//! - `set_prices`, `set_treasury` and `set_admin` require the admin.
//! - `upgrade` requires the admin.
//! - `resolve`, `exists`, `owner_of`, `names_of`, `expires_at`, `is_available`,
//!   `price`, `config` and `total_names` are read-only.
//!
//! Events (topics: event symbol + name; data in parentheses):
//! - `registered(name)` — `(owner, address, memo, expires_at)` — a name was registered.
//! - `renewed(name)` — `(payer, years, expires_at, amount)` — a name was renewed.
//! - `address_set(name)` — `(caller, address, memo)` — the payment record changed.
//! - `transferred(name)` — `(caller, new_owner)` — ownership moved.
//! - `primary_name_set(address)` — `(address, name)` — an address set a display name.
//! - `prices_set()` — `(three, four, five_plus)` — the admin changed prices.
//! - `treasury_set()` — `(treasury)` — the admin changed the treasury.
//! - `admin_set()` — `(admin)` — the admin role moved.
//! - `upgraded()` — `(wasm_hash)` — the admin replaced the contract code.
#![no_std]
// Soroban `#[contractimpl]` entrypoints take parameters **by value**: the SDK
// macro derives the contract ABI from the exported signature, so `&Env` or
// `&Address` parameters are not permitted on public entrypoints. Helper fns
// that can take references do.
#![allow(clippy::needless_pass_by_value)]

#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token::TokenClient, Address, BytesN, Env, String, Vec,
};

/// Errors for the Sidera registry.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RegistryError {
    /// Name not registered, or its entry expired.
    NotFound = 1,
    /// Name is already taken.
    NameTaken = 2,
    /// Name failed validation (empty, too long, or bad characters).
    InvalidName = 3,
    /// Caller is not the owner of this name.
    Unauthorized = 4,
    /// An arithmetic operation overflowed.
    ArithmeticOverflow = 5,
    /// The name has expired: it no longer resolves and can only be renewed
    /// (during the grace period).
    NameExpired = 6,
    /// `years` must be between 1 and [`MAX_YEARS`].
    InvalidYears = 7,
    /// Prices must not be negative.
    InvalidPrice = 8,
    /// A renewal may not push the expiry more than [`MAX_YEARS`] ahead.
    PeriodTooLong = 9,
    /// An owner may hold at most [`MAX_NAMES_PER_OWNER`] names.
    TooManyNames = 10,
    /// A memo must be 1–[`MAX_MEMO_BYTES`] bytes: the most a Stellar text memo
    /// can carry. A memo that does not fit would have to be cut, and a cut
    /// deposit memo sends funds to the wrong customer.
    InvalidMemo = 11,
}

/// A resolved payment destination: the address plus an optional memo hint.
///
/// The memo hint is Sidera's Stellar-specific addition over plain name
/// services: exchange users can publish the memo their deposit requires,
/// and wallets surface it automatically instead of losing funds.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Resolution {
    /// The G- or M-address that receives the payment.
    pub address: Address,
    /// Optional memo the destination requires (numeric ID or text).
    pub memo: Option<String>,
}

/// Emitted when a name is registered. Topics: `("registered", name)`;
/// data (in order): `owner`, `address`, `memo`.
#[contractevent(topics = ["registered"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registered {
    /// The registered name.
    #[topic]
    pub name: String,
    /// The owning address.
    pub owner: Address,
    /// The initial payment destination.
    pub address: Address,
    /// The initial memo hint.
    pub memo: Option<String>,
    /// When the registration expires (ledger timestamp, seconds).
    pub expires_at: u64,
}

/// Emitted when a name is renewed. Topics: `("renewed", name)`;
/// data (in order): `payer`, `years`, `expires_at`, `amount`.
#[contractevent(topics = ["renewed"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Renewed {
    /// The renewed name.
    #[topic]
    pub name: String,
    /// Who paid for the renewal.
    pub payer: Address,
    /// Years added.
    pub years: u32,
    /// The new expiry (ledger timestamp, seconds).
    pub expires_at: u64,
    /// Amount paid, in the payment token's smallest unit.
    pub amount: i128,
}

/// Emitted when the admin changes prices. Data: `three`, `four`, `five_plus`.
#[contractevent(topics = ["prices_set"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PricesSet {
    /// Yearly price of a 3-character name.
    pub three: i128,
    /// Yearly price of a 4-character name.
    pub four: i128,
    /// Yearly price of a name of 5 characters or more.
    pub five_plus: i128,
}

/// Emitted when the admin changes the treasury. Data: `treasury`.
#[contractevent(topics = ["treasury_set"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TreasurySet {
    /// The new treasury that receives payments.
    pub treasury: Address,
}

/// Emitted when the admin replaces the contract code. Data: `wasm_hash`.
#[contractevent(topics = ["upgraded"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Upgraded {
    /// Hash of the new contract code (already uploaded to the network).
    pub wasm_hash: BytesN<32>,
}

/// A name an owner holds, with its expiry.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnedName {
    /// Bare name, without the `.sid` suffix.
    pub name: String,
    /// When the registration expires (ledger timestamp, seconds).
    pub expires_at: u64,
}

/// Emitted when the admin role moves. Data: `admin`.
#[contractevent(topics = ["admin_set"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminSet {
    /// The new admin.
    pub admin: Address,
}

/// Yearly prices by name length, in the payment token's smallest unit
/// (stroops for XLM). A price of 0 makes that length free.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Prices {
    /// 3-character names.
    pub three: i128,
    /// 4-character names.
    pub four: i128,
    /// Names of 5 characters or more.
    pub five_plus: i128,
}

/// Registry settings, fixed at deployment and changeable by the admin.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// May change prices, treasury and admin.
    pub admin: Address,
    /// SEP-41 token used for payment.
    pub token: Address,
    /// Receives every payment.
    pub treasury: Address,
    /// Yearly prices by name length.
    pub prices: Prices,
}

/// Emitted when a name's payment record changes. Topics:
/// `("address_set", name)`; data (in order): `caller`, `address`, `memo`.
#[contractevent(topics = ["address_set"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AddressSet {
    /// The name whose record changed.
    #[topic]
    pub name: String,
    /// The owner that performed the update.
    pub caller: Address,
    /// The new payment destination.
    pub address: Address,
    /// The new memo hint.
    pub memo: Option<String>,
}

/// Emitted when a name's ownership moves. Topics:
/// `("transferred", name)`; data (in order): `caller`, `new_owner`.
#[contractevent(topics = ["transferred"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnershipTransferred {
    /// The name whose ownership moved.
    #[topic]
    pub name: String,
    /// The previous owner that performed the transfer.
    pub caller: Address,
    /// The new owner.
    pub new_owner: Address,
}

/// Storage keys.
#[contracttype]
#[derive(Clone, Debug)]
enum DataKey {
    /// The `Resolution` record for `String` name.
    Name(String),
    /// The owner `Address` of `String` name.
    Owner(String),
    /// The preferred display name for `Address`.
    PrimaryName(Address),
    /// Monotonic counter of distinct names ever registered (instance storage).
    Count,
    /// When `String` name expires (ledger timestamp, seconds).
    Expiry(String),
    /// Registry settings (instance storage).
    Config,
    /// Names held by `Address`, in registration order. Entries can be stale
    /// (expired and released, or re-registered by someone else); reads
    /// filter them out and writes prune them.
    OwnerNames(Address),
}

/// Longest memo hint, in bytes (the Stellar `MEMO_TEXT` limit).
pub const MAX_MEMO_BYTES: u32 = 28;

/// Most names one owner may hold. Keeps `names_of` and the index writes cheap.
pub const MAX_NAMES_PER_OWNER: u32 = 100;

/// Seconds in a (365-day) registration year.
pub const YEAR_SECONDS: u64 = 31_536_000;
/// Longest registration or renewal horizon, in years.
pub const MAX_YEARS: u32 = 10;
/// After expiry, only renewal is possible for this long (30 days); after it
/// the name is released and anyone may register it.
pub const GRACE_PERIOD_SECONDS: u64 = 2_592_000;

/// Where a name is in its life cycle.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Status {
    /// Never registered.
    Missing,
    /// Registered and resolving, until `expiry`.
    Active(u64),
    /// Expired but still reserved for renewal by anyone.
    Grace(u64),
    /// Past the grace period: free to register again.
    Released,
}

/// TTL management: bump the lifetime of every name record on write and on
/// hot lookups so long-held names never silently archive.
///
/// On Stellar, one ledger closes roughly every 5 seconds; 17,280 ledgers is
/// about a day, and 30 days is the comfortable renewal horizon.
const TTL_THRESHOLD_LEDGERS: u32 = 17_280;
const TTL_EXTEND_TO_LEDGERS: u32 = 518_400; // 30 days

/// Minimum and maximum name length (excluding the `.sid` suffix, which the
/// registry stores implicitly).
const NAME_MIN_LEN: u32 = 3;
const NAME_MAX_LEN: u32 = 32;

/// The primary-name record for an address.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrimaryNameRecord {
    pub name: String,
}

/// Emitted when an address sets its preferred display name.
/// Topics: `("primary_name_set", address)`; data (in order): `address`, `name`.
#[contractevent(topics = ["primary_name_set"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrimaryNameSet {
    #[topic]
    pub address: Address,
    pub name: String,
}

/// The deployable Sidera registry contract.
#[contract]
pub struct SideraRegistry;

#[contractimpl]
impl SideraRegistry {
    /// Set up the registry. Runs once, atomically with deployment, so no one
    /// can take the admin role in between.
    ///
    /// # Panics
    ///
    /// With [`RegistryError::InvalidPrice`] if any price is negative.
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        treasury: Address,
        prices: Prices,
    ) {
        if Self::prices_invalid(&prices) {
            panic_with_error!(&env, RegistryError::InvalidPrice);
        }
        let config = Config {
            admin,
            token,
            treasury,
            prices,
        };
        env.storage().instance().set(&DataKey::Config, &config);
        Self::bump_instance(&env);
    }

    /// Register `name` (without the `.sid` suffix) for `years` years, owned
    /// by `owner`, with its initial payment record. `owner` pays
    /// [`SideraRegistry::price`] to the treasury. Returns the expiry
    /// (ledger timestamp, seconds).
    ///
    /// A name is available if it was never registered or if its grace
    /// period has ended.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::InvalidName`] — the name failed validation.
    /// * [`RegistryError::InvalidYears`] — `years` is 0 or above [`MAX_YEARS`].
    /// * [`RegistryError::NameTaken`] — the name is active or in its grace period.
    /// * [`RegistryError::InvalidMemo`] — the memo is empty or longer than 28 bytes.
    /// * [`RegistryError::ArithmeticOverflow`] — a price or time overflowed.
    pub fn register(
        env: Env,
        name: String,
        owner: Address,
        address: Address,
        memo: Option<String>,
        years: u32,
    ) -> Result<u64, RegistryError> {
        Self::validate_name(&name)?;
        Self::validate_years(years)?;
        Self::validate_memo(memo.as_ref())?;
        owner.require_auth();

        let fresh = match Self::status(&env, &name) {
            Status::Missing => true,
            Status::Released => false,
            Status::Active(_) | Status::Grace(_) => return Err(RegistryError::NameTaken),
        };
        if !fresh {
            // A released name leaves its previous owner's list.
            let previous: Option<Address> = env
                .storage()
                .persistent()
                .get(&DataKey::Owner(name.clone()));
            if let Some(previous) = previous {
                Self::unlist(&env, &previous, &name);
            }
        }
        Self::list(&env, &owner, &name)?;

        let amount = Self::quote(&env, &name, years)?;
        let expires_at = env
            .ledger()
            .timestamp()
            .checked_add(Self::period(years)?)
            .ok_or(RegistryError::ArithmeticOverflow)?;
        // Take payment first: if the transfer fails, the whole call fails and
        // nothing below is written.
        Self::collect(&env, &owner, amount);

        let record = Resolution { address, memo };
        let storage = env.storage().persistent();
        storage.set(&DataKey::Name(name.clone()), &record);
        storage.set(&DataKey::Owner(name.clone()), &owner);
        storage.set(&DataKey::Expiry(name.clone()), &expires_at);
        Self::bump_name(&env, &name);

        if fresh {
            let count: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
            let next = count
                .checked_add(1)
                .ok_or(RegistryError::ArithmeticOverflow)?;
            env.storage().instance().set(&DataKey::Count, &next);
        }
        Self::bump_instance(&env);

        Registered {
            name,
            owner,
            address: record.address,
            memo: record.memo,
            expires_at,
        }
        .publish(&env);

        Ok(expires_at)
    }

    /// Extend `name` by `years` years, paid by `payer` (anyone may renew).
    /// Works while the name is active and during its grace period. Returns
    /// the new expiry.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::InvalidYears`] — `years` is 0 or above [`MAX_YEARS`].
    /// * [`RegistryError::NotFound`] — the name is not registered, or was released.
    /// * [`RegistryError::PeriodTooLong`] — the new expiry would be more than
    ///   [`MAX_YEARS`] years from now.
    /// * [`RegistryError::ArithmeticOverflow`] — a price or time overflowed.
    pub fn renew(env: Env, name: String, payer: Address, years: u32) -> Result<u64, RegistryError> {
        Self::validate_years(years)?;
        payer.require_auth();

        let expiry = match Self::status(&env, &name) {
            Status::Active(expiry) | Status::Grace(expiry) => expiry,
            Status::Missing | Status::Released => return Err(RegistryError::NotFound),
        };
        let expires_at = expiry
            .checked_add(Self::period(years)?)
            .ok_or(RegistryError::ArithmeticOverflow)?;
        let horizon = env
            .ledger()
            .timestamp()
            .checked_add(Self::period(MAX_YEARS)?)
            .ok_or(RegistryError::ArithmeticOverflow)?;
        if expires_at > horizon {
            return Err(RegistryError::PeriodTooLong);
        }

        let amount = Self::quote(&env, &name, years)?;
        Self::collect(&env, &payer, amount);

        env.storage()
            .persistent()
            .set(&DataKey::Expiry(name.clone()), &expires_at);
        Self::bump_name(&env, &name);
        Self::bump_instance(&env);

        Renewed {
            name,
            payer,
            years,
            expires_at,
            amount,
        }
        .publish(&env);

        Ok(expires_at)
    }

    /// Set the preferred display name for `address`.
    ///
    /// The name must be active, owned by `address`, and resolve to
    /// `address`, so no one can display a name that does not point to them.
    /// The registry stores `name` **without** the `.sid` suffix.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::InvalidName`] — `name` failed validation.
    /// * [`RegistryError::NotFound`] — `name` is not registered.
    /// * [`RegistryError::NameExpired`] — `name` has expired.
    /// * [`RegistryError::Unauthorized`] — `address` does not own `name`, or
    ///   `name` does not resolve to `address`.
    pub fn set_primary_name(env: Env, address: Address, name: String) -> Result<(), RegistryError> {
        address.require_auth();
        Self::validate_name(&name)?;
        Self::require_active(&env, &name)?;
        if !Self::points_to(&env, &name, &address) {
            return Err(RegistryError::Unauthorized);
        }

        let key = DataKey::PrimaryName(address.clone());
        let record = PrimaryNameRecord { name: name.clone() };
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);

        PrimaryNameSet { address, name }.publish(&env);

        Ok(())
    }

    /// Return the preferred display name for `address`, if one has been set
    /// **and is still valid**: the name is active, owned by `address`, and
    /// resolves to `address`. A primary name that stopped matching (expired,
    /// transferred or repointed) is not returned.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — `address` has no valid primary name.
    pub fn primary_name(env: Env, address: Address) -> Result<String, RegistryError> {
        let key = DataKey::PrimaryName(address.clone());
        let record: PrimaryNameRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::NotFound)?;
        let valid = matches!(Self::status(&env, &record.name), Status::Active(_))
            && Self::points_to(&env, &record.name, &address);
        if !valid {
            return Err(RegistryError::NotFound);
        }
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
        Ok(record.name)
    }

    /// Resolve `name` to its payment destination (address + memo hint).
    ///
    /// Read-only but TTL-aware: resolving a name bumps its entries so a
    /// popular name never archives.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered, or was released.
    /// * [`RegistryError::NameExpired`] — the name has expired. Wallets must
    ///   not send to an expired name.
    pub fn resolve(env: Env, name: String) -> Result<Resolution, RegistryError> {
        Self::require_active(&env, &name)?;
        let record: Resolution = env
            .storage()
            .persistent()
            .get(&DataKey::Name(name.clone()))
            .ok_or(RegistryError::NotFound)?;
        Self::touch_name(&env, &name);
        Ok(record)
    }

    /// Update the address and/or memo attached to `name`. Owner-only, and
    /// only while the name is active.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered, or was released.
    /// * [`RegistryError::NameExpired`] — the name has expired.
    /// * [`RegistryError::Unauthorized`] — `caller` is not the owner.
    /// * [`RegistryError::InvalidMemo`] — the memo is empty or longer than 28 bytes.
    pub fn set_address(
        env: Env,
        name: String,
        caller: Address,
        address: Address,
        memo: Option<String>,
    ) -> Result<(), RegistryError> {
        caller.require_auth();
        Self::validate_memo(memo.as_ref())?;
        Self::require_active(&env, &name)?;
        Self::require_owner(&env, &name, &caller)?;

        let record = Resolution { address, memo };
        AddressSet {
            name: name.clone(),
            caller,
            address: record.address.clone(),
            memo: record.memo.clone(),
        }
        .publish(&env);

        env.storage()
            .persistent()
            .set(&DataKey::Name(name.clone()), &record);
        Self::touch_name(&env, &name);
        Ok(())
    }

    /// Transfer ownership of `name` to `new_owner`. Owner-only, and only
    /// while the name is active. The expiry does not change.
    ///
    /// The transfer is unilateral (the recipient's acceptance is not
    /// required), matching DNS/ENS convention. The new owner proves control
    /// by calling `set_address` afterwards.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered, or was released.
    /// * [`RegistryError::NameExpired`] — the name has expired.
    /// * [`RegistryError::Unauthorized`] — `caller` is not the owner.
    pub fn transfer(
        env: Env,
        name: String,
        caller: Address,
        new_owner: Address,
    ) -> Result<(), RegistryError> {
        caller.require_auth();
        Self::require_active(&env, &name)?;
        Self::require_owner(&env, &name, &caller)?;
        let caller_for_index = caller.clone();

        OwnershipTransferred {
            name: name.clone(),
            caller,
            new_owner: new_owner.clone(),
        }
        .publish(&env);

        // Remove first, then add: correct even when transferring to oneself.
        Self::unlist(&env, &caller_for_index, &name);
        Self::list(&env, &new_owner, &name)?;
        env.storage()
            .persistent()
            .set(&DataKey::Owner(name.clone()), &new_owner);
        Self::touch_name(&env, &name);
        Ok(())
    }

    /// The current owner of `name`, while it is active or in its grace period.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered, or was released.
    pub fn owner_of(env: Env, name: String) -> Result<Address, RegistryError> {
        match Self::status(&env, &name) {
            Status::Active(_) | Status::Grace(_) => env
                .storage()
                .persistent()
                .get(&DataKey::Owner(name))
                .ok_or(RegistryError::NotFound),
            Status::Missing | Status::Released => Err(RegistryError::NotFound),
        }
    }

    /// When `name` expires (ledger timestamp, seconds), while it is active or
    /// in its grace period.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered, or was released.
    pub fn expires_at(env: Env, name: String) -> Result<u64, RegistryError> {
        match Self::status(&env, &name) {
            Status::Active(expiry) | Status::Grace(expiry) => Ok(expiry),
            Status::Missing | Status::Released => Err(RegistryError::NotFound),
        }
    }

    /// Whether `name` is taken: active or in its grace period (no TTL side effects).
    #[must_use]
    pub fn exists(env: Env, name: String) -> bool {
        matches!(
            Self::status(&env, &name),
            Status::Active(_) | Status::Grace(_)
        )
    }

    /// Whether `name` is valid and can be registered now.
    #[must_use]
    pub fn is_available(env: Env, name: String) -> bool {
        Self::validate_name(&name).is_ok()
            && matches!(
                Self::status(&env, &name),
                Status::Missing | Status::Released
            )
    }

    /// What registering or renewing `name` for `years` years costs, in the
    /// payment token's smallest unit.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::InvalidName`] — the name failed validation.
    /// * [`RegistryError::InvalidYears`] — `years` is 0 or above [`MAX_YEARS`].
    /// * [`RegistryError::ArithmeticOverflow`] — the price overflowed.
    pub fn price(env: Env, name: String, years: u32) -> Result<i128, RegistryError> {
        Self::validate_name(&name)?;
        Self::validate_years(years)?;
        Self::quote(&env, &name, years)
    }

    /// The registry settings: admin, payment token, treasury and prices.
    #[must_use]
    pub fn config(env: Env) -> Config {
        Self::load_config(&env)
    }

    /// Change yearly prices. Admin-only. Existing registrations keep their expiry.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::InvalidPrice`] — a price is negative.
    pub fn set_prices(env: Env, prices: Prices) -> Result<(), RegistryError> {
        let mut config = Self::load_config(&env);
        config.admin.require_auth();
        if Self::prices_invalid(&prices) {
            return Err(RegistryError::InvalidPrice);
        }
        PricesSet {
            three: prices.three,
            four: prices.four,
            five_plus: prices.five_plus,
        }
        .publish(&env);
        config.prices = prices;
        Self::save_config(&env, &config);
        Ok(())
    }

    /// Change the address that receives payments. Admin-only.
    pub fn set_treasury(env: Env, treasury: Address) {
        let mut config = Self::load_config(&env);
        config.admin.require_auth();
        TreasurySet {
            treasury: treasury.clone(),
        }
        .publish(&env);
        config.treasury = treasury;
        Self::save_config(&env, &config);
    }

    /// Hand the admin role to `new_admin`. Both the current and the new
    /// admin must sign, so the role cannot be sent to a mistyped address.
    pub fn set_admin(env: Env, new_admin: Address) {
        let mut config = Self::load_config(&env);
        config.admin.require_auth();
        new_admin.require_auth();
        AdminSet {
            admin: new_admin.clone(),
        }
        .publish(&env);
        config.admin = new_admin;
        Self::save_config(&env, &config);
    }

    /// The names `owner` holds (active or in their grace period), with their
    /// expiry, in registration order.
    #[must_use]
    pub fn names_of(env: Env, owner: Address) -> Vec<OwnedName> {
        let key = DataKey::OwnerNames(owner.clone());
        let listed: Vec<String> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        let mut out = Vec::new(&env);
        for name in listed.iter() {
            if let Some(expires_at) = Self::held_by(&env, &name, &owner) {
                out.push_back(OwnedName { name, expires_at });
            }
        }
        if !listed.is_empty() {
            env.storage().persistent().extend_ttl(
                &key,
                TTL_THRESHOLD_LEDGERS,
                TTL_EXTEND_TO_LEDGERS,
            );
        }
        out
    }

    /// Replace the contract code with an already-uploaded WASM, keeping the
    /// contract ID and all stored names. Admin-only.
    pub fn upgrade(env: Env, wasm_hash: BytesN<32>) {
        Self::load_config(&env).admin.require_auth();
        Upgraded {
            wasm_hash: wasm_hash.clone(),
        }
        .publish(&env);
        env.deployer().update_current_contract_wasm(wasm_hash);
    }

    /// Number of distinct names ever registered. Re-registering a released
    /// name does not count again.
    #[must_use]
    pub fn total_names(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    // ------------------------------------------------------------------ helpers

    /// Where `name` is in its life cycle, from its stored expiry.
    fn status(env: &Env, name: &String) -> Status {
        let expiry: Option<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::Expiry(name.clone()));
        let Some(expiry) = expiry else {
            return Status::Missing;
        };
        let now = env.ledger().timestamp();
        if now <= expiry {
            Status::Active(expiry)
        } else if now <= expiry.saturating_add(GRACE_PERIOD_SECONDS) {
            Status::Grace(expiry)
        } else {
            Status::Released
        }
    }

    /// Fail unless `name` is active.
    fn require_active(env: &Env, name: &String) -> Result<(), RegistryError> {
        match Self::status(env, name) {
            Status::Active(_) => Ok(()),
            Status::Grace(_) => Err(RegistryError::NameExpired),
            Status::Missing | Status::Released => Err(RegistryError::NotFound),
        }
    }

    /// Require that `caller` owns `name`.
    fn require_owner(env: &Env, name: &String, caller: &Address) -> Result<(), RegistryError> {
        let owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(name.clone()))
            .ok_or(RegistryError::NotFound)?;
        if caller != &owner {
            return Err(RegistryError::Unauthorized);
        }
        Ok(())
    }

    /// Whether `address` both owns `name` and is where `name` resolves.
    fn points_to(env: &Env, name: &String, address: &Address) -> bool {
        let storage = env.storage().persistent();
        let owner: Option<Address> = storage.get(&DataKey::Owner(name.clone()));
        let record: Option<Resolution> = storage.get(&DataKey::Name(name.clone()));
        owner.as_ref() == Some(address) && record.is_some_and(|r| &r.address == address)
    }

    /// If `owner` currently holds `name` (active or grace), its expiry.
    fn held_by(env: &Env, name: &String, owner: &Address) -> Option<u64> {
        let expiry = match Self::status(env, name) {
            Status::Active(expiry) | Status::Grace(expiry) => expiry,
            Status::Missing | Status::Released => return None,
        };
        let current: Option<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(name.clone()));
        (current.as_ref() == Some(owner)).then_some(expiry)
    }

    /// Add `name` to `owner`'s list, pruning entries `owner` no longer holds.
    fn list(env: &Env, owner: &Address, name: &String) -> Result<(), RegistryError> {
        let key = DataKey::OwnerNames(owner.clone());
        let listed: Vec<String> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));
        let mut kept = Vec::new(env);
        for n in listed.iter() {
            if &n != name && Self::held_by(env, &n, owner).is_some() {
                kept.push_back(n);
            }
        }
        if kept.len() >= MAX_NAMES_PER_OWNER {
            return Err(RegistryError::TooManyNames);
        }
        kept.push_back(name.clone());
        env.storage().persistent().set(&key, &kept);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, env.storage().max_ttl());
        Ok(())
    }

    /// Remove `name` from `owner`'s list.
    fn unlist(env: &Env, owner: &Address, name: &String) {
        let key = DataKey::OwnerNames(owner.clone());
        let listed: Option<Vec<String>> = env.storage().persistent().get(&key);
        let Some(listed) = listed else { return };
        let mut kept = Vec::new(env);
        for n in listed.iter() {
            if &n != name {
                kept.push_back(n);
            }
        }
        env.storage().persistent().set(&key, &kept);
    }

    /// Price of `years` years of `name`, without validation.
    fn quote(env: &Env, name: &String, years: u32) -> Result<i128, RegistryError> {
        let prices = Self::load_config(env).prices;
        let per_year = match name.len() {
            3 => prices.three,
            4 => prices.four,
            _ => prices.five_plus,
        };
        per_year
            .checked_mul(i128::from(years))
            .ok_or(RegistryError::ArithmeticOverflow)
    }

    /// Move `amount` of the payment token from `from` to the treasury.
    /// Free names (amount 0) skip the token call.
    fn collect(env: &Env, from: &Address, amount: i128) {
        if amount > 0 {
            let config = Self::load_config(env);
            TokenClient::new(env, &config.token).transfer(from, &config.treasury, &amount);
        }
    }

    /// `years` years in seconds.
    fn period(years: u32) -> Result<u64, RegistryError> {
        u64::from(years)
            .checked_mul(YEAR_SECONDS)
            .ok_or(RegistryError::ArithmeticOverflow)
    }

    /// A memo, when present, must fit a Stellar text memo: 1–28 bytes.
    fn validate_memo(memo: Option<&String>) -> Result<(), RegistryError> {
        match memo {
            Some(m) if m.is_empty() || m.len() > MAX_MEMO_BYTES => Err(RegistryError::InvalidMemo),
            _ => Ok(()),
        }
    }

    fn validate_years(years: u32) -> Result<(), RegistryError> {
        if (1..=MAX_YEARS).contains(&years) {
            Ok(())
        } else {
            Err(RegistryError::InvalidYears)
        }
    }

    fn prices_invalid(prices: &Prices) -> bool {
        prices.three < 0 || prices.four < 0 || prices.five_plus < 0
    }

    fn load_config(env: &Env) -> Config {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, RegistryError::NotFound))
    }

    fn save_config(env: &Env, config: &Config) {
        env.storage().instance().set(&DataKey::Config, config);
        Self::bump_instance(env);
    }

    /// After a paid write (register/renew): keep the name's entries alive as
    /// long as the network allows, since the owner paid for years.
    fn bump_name(env: &Env, name: &String) {
        let max = env.storage().max_ttl();
        let storage = env.storage().persistent();
        for key in [
            DataKey::Name(name.clone()),
            DataKey::Owner(name.clone()),
            DataKey::Expiry(name.clone()),
        ] {
            storage.extend_ttl(&key, TTL_THRESHOLD_LEDGERS, max);
        }
    }

    /// On reads and owner updates: the usual 30-day bump for all three entries.
    fn touch_name(env: &Env, name: &String) {
        let storage = env.storage().persistent();
        for key in [
            DataKey::Name(name.clone()),
            DataKey::Owner(name.clone()),
            DataKey::Expiry(name.clone()),
        ] {
            storage.extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
        }
    }

    fn bump_instance(env: &Env) {
        let max = env.storage().max_ttl();
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD_LEDGERS, max);
    }

    /// Validate a bare name (no `.sid` suffix): 3–32 chars of a–z, 0–9, or
    /// hyphen; hyphens may not lead or trail.
    fn validate_name(name: &String) -> Result<(), RegistryError> {
        let len = name.len();
        if !(NAME_MIN_LEN..=NAME_MAX_LEN).contains(&len) {
            return Err(RegistryError::InvalidName);
        }
        for (i, b) in name.to_bytes().iter().enumerate() {
            let ok = b.is_ascii_lowercase()
                || b.is_ascii_digit()
                || (b == b'-' && i > 0 && i + 1 < len as usize);
            if !ok {
                return Err(RegistryError::InvalidName);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod testutil;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod pricing_tests;

#[cfg(test)]
mod index_tests;

#[cfg(test)]
mod props;
