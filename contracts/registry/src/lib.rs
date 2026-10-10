//! # Sidera Registry Contract
//!
//! Maps human-readable names (`alice.sid`) to Stellar addresses with
//! memo hints, so payments never go to the wrong place.
//!
//! This is the Day-1 MVP slice: registration, ownership, address updates,
//! ownership transfer, and resolution with memo hints. Pricing/renewals and
//! subnames follow in later tranches.
//!
//! Authorization model:
//! - `register` requires the registering owner.
//! - `set_address` and `transfer` require the current owner.
//! - `resolve`, `exists`, `owner_of`, and `total_names` are read-only.
//!
//! Events (topics: event symbol + name; data in parentheses):
//! - `registered(name)` — `(owner, address, memo)` — a name was registered.
//! - `address_set(name)` — `(caller, address, memo)` — the payment record changed.
//! - `transferred(name)` — `(caller, new_owner)` — ownership moved.
//! - `primary_name_set(address)` — `(address, name)` — an address set a display name.
#![no_std]
// Soroban `#[contractimpl]` entrypoints take parameters **by value**: the SDK
// macro derives the contract ABI from the exported signature, so `&Env` or
// `&Address` parameters are not permitted on public entrypoints. Helper fns
// that can take references do.
#![allow(clippy::needless_pass_by_value)]

#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String,
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
    /// Monotonic registration counter (hot, small, instance storage).
    Count,
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
    /// Register `name` (without the `.sid` suffix), owned by `owner`, and
    /// attach the initial address record. Returns the canonical stored name.
    ///
    /// First-come-first-served: registration fails with
    /// [`RegistryError::NameTaken`] if the name is already owned.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NameTaken`] — the name is already registered.
    /// * [`RegistryError::InvalidName`] — the name failed validation.
    /// * [`RegistryError::ArithmeticOverflow`] — the registration counter
    ///   overflowed.
    pub fn register(
        env: Env,
        name: String,
        owner: Address,
        address: Address,
        memo: Option<String>,
    ) -> Result<String, RegistryError> {
        Self::validate_name(&name)?;
        owner.require_auth();

        let key = DataKey::Name(name.clone());
        if env.storage().persistent().has(&key) {
            return Err(RegistryError::NameTaken);
        }

        let record = Resolution { address, memo };
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .set(&DataKey::Owner(name.clone()), &owner);

        // Both keys share the name's lifetime; extend them together.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
        env.storage().persistent().extend_ttl(
            &DataKey::Owner(name.clone()),
            TTL_THRESHOLD_LEDGERS,
            TTL_EXTEND_TO_LEDGERS,
        );

        let count: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let next = count
            .checked_add(1)
            .ok_or(RegistryError::ArithmeticOverflow)?;
        env.storage().instance().set(&DataKey::Count, &next);

        Registered {
            name: name.clone(),
            owner,
            address: record.address.clone(),
            memo: record.memo.clone(),
        }
        .publish(&env);

        Ok(name)
    }

    /// Set the preferred display name for `address`. Owner-only.
    ///
    /// The registry stores `name` **without** the `.sid` suffix; wallets
    /// should append it when displaying the result of `primary_name`.
    ///
    /// Setting a primary name does not create or modify a forward name
    /// registration: any address owner can set a display name for its own
    /// address.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::InvalidName`] — `name` failed validation.
    /// * [`RegistryError::Unauthorized`] — `address` did not authorize the write.
    pub fn set_primary_name(env: Env, address: Address, name: String) -> Result<(), RegistryError> {
        address.require_auth();
        Self::validate_name(&name)?;

        let key = DataKey::PrimaryName(address.clone());
        let record = PrimaryNameRecord { name: name.clone() };
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);

        PrimaryNameSet {
            address: address.clone(),
            name: name.clone(),
        }
        .publish(&env);

        Ok(())
    }

    /// Return the preferred display name for `address`, if one has been set.
    ///
    /// Returns [`RegistryError::NotFound`] when `address` has no primary name.
    ///
    /// Read-only but TTL-aware: looking up a primary name bumps its entry so a
    /// frequently referenced address does not lose its display name.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — `address` has no primary name.
    pub fn primary_name(env: Env, address: Address) -> Result<String, RegistryError> {
        let key = DataKey::PrimaryName(address.clone());
        let record: PrimaryNameRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::NotFound)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
        Ok(record.name)
    }

    /// Resolve `name` to its payment destination (address + memo hint).
    ///
    /// Read-only but TTL-aware: resolving a name bumps its entry so a
    /// popular name never archives.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered.
    pub fn resolve(env: Env, name: String) -> Result<Resolution, RegistryError> {
        let key = DataKey::Name(name.clone());
        let record: Resolution = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::NotFound)?;
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
        env.storage().persistent().extend_ttl(
            &DataKey::Owner(name),
            TTL_THRESHOLD_LEDGERS,
            TTL_EXTEND_TO_LEDGERS,
        );
        Ok(record)
    }

    /// Update the address and/or memo attached to `name`. Owner-only.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered.
    /// * [`RegistryError::Unauthorized`] — `caller` is not the owner.
    pub fn set_address(
        env: Env,
        name: String,
        caller: Address,
        address: Address,
        memo: Option<String>,
    ) -> Result<(), RegistryError> {
        caller.require_auth();
        Self::require_owner(&env, &name, &caller)?;

        let record = Resolution { address, memo };
        AddressSet {
            name: name.clone(),
            caller,
            address: record.address.clone(),
            memo: record.memo.clone(),
        }
        .publish(&env);

        let key = DataKey::Name(name);
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
        Ok(())
    }

    /// Transfer ownership of `name` to `new_owner`. Owner-only.
    ///
    /// The transfer is unilateral (the recipient's acceptance is not
    /// required), matching DNS/ENS convention. The new owner proves control
    /// by calling `set_address` afterwards.
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered.
    /// * [`RegistryError::Unauthorized`] — `caller` is not the owner.
    pub fn transfer(
        env: Env,
        name: String,
        caller: Address,
        new_owner: Address,
    ) -> Result<(), RegistryError> {
        caller.require_auth();
        Self::require_owner(&env, &name, &caller)?;

        OwnershipTransferred {
            name: name.clone(),
            caller,
            new_owner: new_owner.clone(),
        }
        .publish(&env);

        let owner_key = DataKey::Owner(name);
        env.storage().persistent().set(&owner_key, &new_owner);
        env.storage().persistent().extend_ttl(
            &owner_key,
            TTL_THRESHOLD_LEDGERS,
            TTL_EXTEND_TO_LEDGERS,
        );
        Ok(())
    }

    /// The current owner of `name` (read-only view).
    ///
    /// # Errors
    ///
    /// * [`RegistryError::NotFound`] — the name is not registered.
    pub fn owner_of(env: Env, name: String) -> Result<Address, RegistryError> {
        env.storage()
            .persistent()
            .get(&DataKey::Owner(name))
            .ok_or(RegistryError::NotFound)
    }

    /// Whether `name` is registered (no TTL side effects).
    #[must_use]
    pub fn exists(env: Env, name: String) -> bool {
        env.storage().persistent().has(&DataKey::Name(name))
    }

    /// Total registered names (hot counter).
    #[must_use]
    pub fn total_names(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
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
mod tests;

#[cfg(test)]
mod props;
