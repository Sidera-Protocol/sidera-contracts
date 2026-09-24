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
#![no_std]
// Soroban `#[contractimpl]` entrypoints take parameters **by value**: the SDK
// macro derives the contract ABI from the exported signature, so `&Env` or
// `&Address` parameters are not permitted on public entrypoints. Helper fns
// that can take references do.
#![allow(clippy::needless_pass_by_value)]

#[cfg(test)]
extern crate std;

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

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

/// Storage keys.
#[contracttype]
#[derive(Clone, Debug)]
enum DataKey {
    /// The `Resolution` record for `String` name.
    Name(String),
    /// The owner `Address` of `String` name.
    Owner(String),
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

        Ok(name)
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

        let key = DataKey::Name(name);
        let record = Resolution { address, memo };
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
