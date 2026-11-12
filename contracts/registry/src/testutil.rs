//! Shared test setup: a registry deployed with a real Stellar Asset Contract
//! as its payment token.

use super::{Prices, SideraRegistry};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, Env};

/// A deployed registry and everything around it.
pub struct Deployed {
    /// Registry contract id.
    pub id: Address,
    /// Payment token (a Stellar Asset Contract).
    pub token: Address,
    /// Receives every payment.
    pub treasury: Address,
    /// Registry admin.
    pub admin: Address,
}

impl Deployed {
    /// Mint `amount` of the payment token to `to`.
    pub fn fund(&self, env: &Env, to: &Address, amount: i128) {
        StellarAssetClient::new(env, &self.token)
            .mock_all_auths()
            .mint(to, &amount);
    }

    /// Token balance of `who`.
    pub fn balance(&self, env: &Env, who: &Address) -> i128 {
        TokenClient::new(env, &self.token).balance(who)
    }
}

/// Every length free: lets tests that are not about payment ignore the token.
pub fn free() -> Prices {
    Prices {
        three: 0,
        four: 0,
        five_plus: 0,
    }
}

/// Deploy a registry with `prices`.
pub fn deploy(env: &Env, prices: Prices) -> Deployed {
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(env));
    let id = env.register(
        SideraRegistry,
        (admin.clone(), sac.address(), treasury.clone(), prices),
    );
    Deployed {
        id,
        token: sac.address(),
        treasury,
        admin,
    }
}
