#![no_std]

//! Bazaar Fee Split Router — Non-custodial atomic payment splitter for Soroban.
//! Supports customizable fee basis points (up to 10.00% max cap) with zero rounding loss.

use soroban_sdk::{
    contract, contracterror, contractimpl, symbol_short, token, Address, BytesN, Env,
};

pub const DEFAULT_BAZAAR_FEE_BPS: i128 = 100; // 1%
pub const MAX_BAZAAR_FEE_BPS: i128 = 1_000; // Max 10%
pub const BPS_DENOMINATOR: i128 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SplitError {
    InvalidAmount = 1,
    RoundingNotPermitted = 2,
    SameDestination = 3,
    TransferFailed = 4,
    InvalidFeeBps = 5,
}

#[contract]
pub struct FeeSplitRouter;

#[contractimpl]
impl FeeSplitRouter {
    /// Executes a non-custodial atomic split of `gross_amount` in `token` from `payer`:
    /// - `(10,000 - fee_bps) / 10,000` is transferred directly to `provider`
    /// - `fee_bps / 10,000` is transferred directly to `treasury`
    ///
    /// Requires authorization from `payer`.
    /// Reverts atomically if any transfer fails, if fee_bps exceeds MAX_BAZAAR_FEE_BPS, or if rounding would lose precision.
    pub fn split_payment(
        env: Env,
        token: Address,
        payer: Address,
        provider: Address,
        treasury: Address,
        gross_amount: i128,
        fee_bps: i128,
        request_binding: BytesN<32>,
        card_hash: BytesN<32>,
    ) -> Result<(i128, i128), SplitError> {
        // 1. Validate destinations
        if provider == treasury || payer == provider || payer == treasury {
            return Err(SplitError::SameDestination);
        }

        // 2. Validate amount & fee_bps
        if gross_amount <= 0 {
            return Err(SplitError::InvalidAmount);
        }

        if fee_bps <= 0 || fee_bps > MAX_BAZAAR_FEE_BPS {
            return Err(SplitError::InvalidFeeBps);
        }

        // 3. Exact fee calculation without rounding loss
        let fee_numerator = gross_amount
            .checked_mul(fee_bps)
            .ok_or(SplitError::InvalidAmount)?;

        if fee_numerator % BPS_DENOMINATOR != 0 {
            return Err(SplitError::RoundingNotPermitted);
        }

        let fee_amount = fee_numerator / BPS_DENOMINATOR;
        let provider_net = gross_amount
            .checked_sub(fee_amount)
            .ok_or(SplitError::InvalidAmount)?;

        if fee_amount <= 0 || provider_net <= 0 {
            return Err(SplitError::InvalidAmount);
        }

        // 4. Require payer authorization
        payer.require_auth();

        // 5. Execute atomic token transfers
        let client = token::Client::new(&env, &token);

        // Transfer net portion to provider
        client.transfer(&payer, &provider, &provider_net);

        // Transfer fee portion to Bazaar treasury
        client.transfer(&payer, &treasury, &fee_amount);

        // 6. Emit verifiable provenance event
        env.events().publish(
            (symbol_short!("split"), token, payer),
            (provider, treasury, provider_net, fee_amount, fee_bps, request_binding, card_hash),
        );

        Ok((provider_net, fee_amount))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        Address, BytesN, Env,
    };

    #[test]
    fn test_successful_atomic_fee_split_1_percent() {
        let env = Env::default();
        env.mock_all_auths();

        let router_id = env.register_contract(None, FeeSplitRouter);
        let client = FeeSplitRouterClient::new(&env, &router_id);

        let token_admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let provider = Address::generate(&env);
        let treasury = Address::generate(&env);

        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_contract.address();
        let stellar_client = token::StellarAssetClient::new(&env, &token_addr);
        let token_client = token::Client::new(&env, &token_addr);

        // Fund payer with 100,000 atomic units (0.01 USDC)
        stellar_client.mint(&payer, &100_000);
        assert_eq!(token_client.balance(&payer), 100_000);

        let binding = BytesN::from_array(&env, &[1u8; 32]);
        let card = BytesN::from_array(&env, &[2u8; 32]);

        // Gross = 10,000 (0.001 USDC), fee_bps = 100 (1%). 99% = 9,900, 1% = 100
        let (net, fee) = client.split_payment(
            &token_addr,
            &payer,
            &provider,
            &treasury,
            &10_000,
            &100,
            &binding,
            &card,
        );

        assert_eq!(net, 9_900);
        assert_eq!(fee, 100);

        // Verify balances
        assert_eq!(token_client.balance(&payer), 90_000);
        assert_eq!(token_client.balance(&provider), 9_900);
        assert_eq!(token_client.balance(&treasury), 100);
    }

    #[test]
    fn test_successful_atomic_fee_split_3_percent() {
        let env = Env::default();
        env.mock_all_auths();

        let router_id = env.register_contract(None, FeeSplitRouter);
        let client = FeeSplitRouterClient::new(&env, &router_id);

        let token_admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let provider = Address::generate(&env);
        let treasury = Address::generate(&env);

        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_contract.address();
        let stellar_client = token::StellarAssetClient::new(&env, &token_addr);
        let token_client = token::Client::new(&env, &token_addr);

        stellar_client.mint(&payer, &100_000);

        let binding = BytesN::from_array(&env, &[1u8; 32]);
        let card = BytesN::from_array(&env, &[2u8; 32]);

        // Gross = 10,000 (0.001 USDC), fee_bps = 300 (3%). 97% = 9,700, 3% = 300
        let (net, fee) = client.split_payment(
            &token_addr,
            &payer,
            &provider,
            &treasury,
            &10_000,
            &300,
            &binding,
            &card,
        );

        assert_eq!(net, 9_700);
        assert_eq!(fee, 300);

        assert_eq!(token_client.balance(&payer), 90_000);
        assert_eq!(token_client.balance(&provider), 9_700);
        assert_eq!(token_client.balance(&treasury), 300);
    }

    #[test]
    fn test_fee_bps_exceeding_max_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let router_id = env.register_contract(None, FeeSplitRouter);
        let client = FeeSplitRouterClient::new(&env, &router_id);

        let token_admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let provider = Address::generate(&env);
        let treasury = Address::generate(&env);

        let token_contract = env.register_stellar_asset_contract_v2(token_admin);
        let token_addr = token_contract.address();
        let binding = BytesN::from_array(&env, &[1u8; 32]);
        let card = BytesN::from_array(&env, &[2u8; 32]);

        // fee_bps = 1001 (> 1000 max)
        let result = client.try_split_payment(
            &token_addr,
            &payer,
            &provider,
            &treasury,
            &10_000,
            &1001,
            &binding,
            &card,
        );

        assert_eq!(result, Err(Ok(SplitError::InvalidFeeBps)));
    }

    #[test]
    fn test_rounding_amounts_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let router_id = env.register_contract(None, FeeSplitRouter);
        let client = FeeSplitRouterClient::new(&env, &router_id);

        let token_admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let provider = Address::generate(&env);
        let treasury = Address::generate(&env);

        let token_contract = env.register_stellar_asset_contract_v2(token_admin);
        let token_addr = token_contract.address();
        let binding = BytesN::from_array(&env, &[1u8; 32]);
        let card = BytesN::from_array(&env, &[2u8; 32]);

        // 10,001 cannot be divided into exact 3% (300 bps) without remainder
        let result = client.try_split_payment(
            &token_addr,
            &payer,
            &provider,
            &treasury,
            &10_001,
            &300,
            &binding,
            &card,
        );

        assert_eq!(result, Err(Ok(SplitError::RoundingNotPermitted)));
    }

    #[test]
    fn test_same_destination_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let router_id = env.register_contract(None, FeeSplitRouter);
        let client = FeeSplitRouterClient::new(&env, &router_id);

        let token_admin = Address::generate(&env);
        let payer = Address::generate(&env);
        let same_dest = Address::generate(&env);

        let token_contract = env.register_stellar_asset_contract_v2(token_admin);
        let token_addr = token_contract.address();
        let binding = BytesN::from_array(&env, &[1u8; 32]);
        let card = BytesN::from_array(&env, &[2u8; 32]);

        let result = client.try_split_payment(
            &token_addr,
            &payer,
            &same_dest,
            &same_dest,
            &10_000,
            &100,
            &binding,
            &card,
        );

        assert_eq!(result, Err(Ok(SplitError::SameDestination)));
    }
}
