#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env,
};

const MIN_FEE_BPS: u32 = 1;
const MAX_FEE_BPS: u32 = 500;
const BPS_DENOMINATOR: i128 = 10_000;
const MAX_EXPIRY_LEDGERS: u32 = 120;
const REPLAY_TTL_THRESHOLD: u32 = 120_960;
const REPLAY_TTL_EXTEND_TO: u32 = 535_680;

#[derive(Clone)]
#[contracttype]
enum Key {
    Used(Address, BytesN<32>),
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct SplitRequest {
    pub token: Address,
    pub payer: Address,
    pub provider: Address,
    pub treasury: Address,
    pub gross_amount: i128,
    pub fee_bps: u32,
    pub request_binding: BytesN<32>,
    pub service_card_hash: BytesN<32>,
    pub provider_terms_hash: BytesN<32>,
    pub nonce: BytesN<32>,
    pub expires_ledger: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct SplitReceipt {
    pub token: Address,
    pub payer: Address,
    pub provider: Address,
    pub treasury: Address,
    pub gross_amount: i128,
    pub provider_amount: i128,
    pub bazaar_fee: i128,
    pub fee_bps: u32,
    pub request_binding: BytesN<32>,
    pub service_card_hash: BytesN<32>,
    pub provider_terms_hash: BytesN<32>,
    pub nonce: BytesN<32>,
    pub expires_ledger: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SplitError {
    InvalidAmount = 1,
    InvalidFee = 2,
    InvalidDestinations = 3,
    InvalidBinding = 4,
    Expired = 5,
    ExpiryTooFar = 6,
    ReplayDetected = 7,
}

#[contract]
pub struct FeeSplitRouter;

fn nonzero_hash(env: &Env, value: &BytesN<32>) -> bool {
    value != &BytesN::from_array(env, &[0; 32])
}

fn calculate_amounts(gross_amount: i128, fee_bps: u32) -> Result<(i128, i128), SplitError> {
    if gross_amount <= 0 {
        return Err(SplitError::InvalidAmount);
    }
    if !(MIN_FEE_BPS..=MAX_FEE_BPS).contains(&fee_bps) {
        return Err(SplitError::InvalidFee);
    }
    let numerator = gross_amount
        .checked_mul(fee_bps as i128)
        .ok_or(SplitError::InvalidAmount)?;
    if numerator % BPS_DENOMINATOR != 0 {
        return Err(SplitError::InvalidAmount);
    }
    let bazaar_fee = numerator / BPS_DENOMINATOR;
    let provider_amount = gross_amount
        .checked_sub(bazaar_fee)
        .ok_or(SplitError::InvalidAmount)?;
    if bazaar_fee <= 0 || provider_amount <= 0 || provider_amount + bazaar_fee != gross_amount {
        return Err(SplitError::InvalidAmount);
    }
    Ok((provider_amount, bazaar_fee))
}

#[contractimpl]
impl FeeSplitRouter {
    pub fn split(env: Env, request: SplitRequest) -> Result<SplitReceipt, SplitError> {
        request.payer.require_auth();
        if request.provider == request.treasury
            || request.provider == request.payer
            || request.treasury == request.payer
        {
            return Err(SplitError::InvalidDestinations);
        }
        if !nonzero_hash(&env, &request.request_binding)
            || !nonzero_hash(&env, &request.service_card_hash)
            || !nonzero_hash(&env, &request.provider_terms_hash)
            || !nonzero_hash(&env, &request.nonce)
        {
            return Err(SplitError::InvalidBinding);
        }
        let current = env.ledger().sequence();
        if request.expires_ledger <= current {
            return Err(SplitError::Expired);
        }
        if request.expires_ledger > current.saturating_add(MAX_EXPIRY_LEDGERS) {
            return Err(SplitError::ExpiryTooFar);
        }
        let (provider_amount, bazaar_fee) =
            calculate_amounts(request.gross_amount, request.fee_bps)?;
        let replay_key = Key::Used(request.payer.clone(), request.request_binding.clone());
        if env.storage().persistent().has(&replay_key) {
            return Err(SplitError::ReplayDetected);
        }
        env.storage().persistent().set(&replay_key, &true);
        env.storage().persistent().extend_ttl(
            &replay_key,
            REPLAY_TTL_THRESHOLD,
            REPLAY_TTL_EXTEND_TO,
        );

        let token_client = token::Client::new(&env, &request.token);
        token_client.transfer(&request.payer, &request.provider, &provider_amount);
        token_client.transfer(&request.payer, &request.treasury, &bazaar_fee);

        let receipt = SplitReceipt {
            token: request.token,
            payer: request.payer,
            provider: request.provider,
            treasury: request.treasury,
            gross_amount: request.gross_amount,
            provider_amount,
            bazaar_fee,
            fee_bps: request.fee_bps,
            request_binding: request.request_binding,
            service_card_hash: request.service_card_hash,
            provider_terms_hash: request.provider_terms_hash,
            nonce: request.nonce,
            expires_ledger: request.expires_ledger,
        };
        env.events().publish(
            (
                symbol_short!("split"),
                receipt.provider.clone(),
                receipt.treasury.clone(),
            ),
            receipt.clone(),
        );
        Ok(receipt)
    }

    pub fn is_request_used(env: Env, payer: Address, request_binding: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&Key::Used(payer, request_binding))
    }
}

#[cfg(test)]
mod test {
    extern crate std;

    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, Events as _, Ledger as _},
        token::{StellarAssetClient, TokenClient},
        vec, Address, BytesN, Env, IntoVal, TryIntoVal,
    };

    struct Fixture {
        env: Env,
        contract: Address,
        token: Address,
        payer: Address,
        provider: Address,
        treasury: Address,
    }

    fn hash(env: &Env, marker: u8) -> BytesN<32> {
        BytesN::from_array(env, &[marker; 32])
    }

    fn fixture(balance: i128) -> Fixture {
        let env = Env::default();
        env.ledger().set_sequence_number(1_000);
        env.mock_all_auths();
        let issuer = Address::generate(&env);
        let token = env.register_stellar_asset_contract_v2(issuer).address();
        let contract = env.register_contract(None, FeeSplitRouter);
        let payer = Address::generate(&env);
        let provider = Address::generate(&env);
        let treasury = Address::generate(&env);
        StellarAssetClient::new(&env, &token).mint(&payer, &balance);
        Fixture {
            env,
            contract,
            token,
            payer,
            provider,
            treasury,
        }
    }

    fn request(f: &Fixture, gross: i128, fee_bps: u32, marker: u8, expires: u32) -> SplitRequest {
        SplitRequest {
            token: f.token.clone(),
            payer: f.payer.clone(),
            provider: f.provider.clone(),
            treasury: f.treasury.clone(),
            gross_amount: gross,
            fee_bps,
            request_binding: hash(&f.env, marker),
            service_card_hash: hash(&f.env, marker + 20),
            provider_terms_hash: hash(&f.env, marker + 40),
            nonce: hash(&f.env, marker + 60),
            expires_ledger: expires,
        }
    }

    #[test]
    fn exact_split_moves_directly_and_router_holds_zero() {
        let f = fixture(10_000);
        let client = FeeSplitRouterClient::new(&f.env, &f.contract);
        let req = request(&f, 10_000, 100, 1, 1_120);
        let receipt = client.split(&req);
        let auths = f.env.auths();
        assert_eq!(auths.len(), 1);
        assert_eq!(auths[0].0, f.payer);
        match &auths[0].1.function {
            AuthorizedFunction::Contract((address, function, args)) => {
                assert_eq!(address, &f.contract);
                assert_eq!(function, &symbol_short!("split"));
                assert_eq!(args, &vec![&f.env, req.clone().into_val(&f.env)]);
            }
            _ => panic!("split must be the payer authorization root"),
        }
        assert_eq!(auths[0].1.sub_invocations.len(), 2);
        let expected_nested = [
            (f.provider.clone(), 9_900_i128),
            (f.treasury.clone(), 100_i128),
        ];
        for (invocation, (destination, amount)) in
            auths[0].1.sub_invocations.iter().zip(expected_nested)
        {
            match &invocation.function {
                AuthorizedFunction::Contract((address, function, args)) => {
                    assert_eq!(address, &f.token);
                    assert_eq!(function, &symbol_short!("transfer"));
                    assert_eq!(
                        args,
                        &vec![
                            &f.env,
                            f.payer.clone().into_val(&f.env),
                            destination.into_val(&f.env),
                            amount.into_val(&f.env),
                        ]
                    );
                }
                _ => panic!("each nested authorization must be an exact token transfer"),
            }
        }
        let token = TokenClient::new(&f.env, &f.token);
        assert_eq!(receipt.provider_amount, 9_900);
        assert_eq!(receipt.bazaar_fee, 100);
        assert_eq!(token.balance(&f.payer), 0);
        assert_eq!(token.balance(&f.provider), 9_900);
        assert_eq!(token.balance(&f.treasury), 100);
        assert_eq!(token.balance(&f.contract), 0);
        assert!(client.is_request_used(&f.payer, &req.request_binding));
        let events = f.env.events().all();
        let (event_contract, topics, data) = events.last().unwrap();
        assert_eq!(event_contract, f.contract);
        assert_eq!(
            topics,
            vec![
                &f.env,
                symbol_short!("split").into_val(&f.env),
                f.provider.into_val(&f.env),
                f.treasury.into_val(&f.env)
            ]
        );
        let event_receipt: SplitReceipt = data.try_into_val(&f.env).unwrap();
        assert_eq!(event_receipt, receipt);
    }

    #[test]
    fn bounded_configurable_fee_and_exact_arithmetic() {
        assert_eq!(calculate_amounts(10_000, 1), Ok((9_999, 1)));
        assert_eq!(calculate_amounts(10_000, 100), Ok((9_900, 100)));
        assert_eq!(calculate_amounts(10_000, 500), Ok((9_500, 500)));
        for fee in [0, 501, 10_000] {
            assert_eq!(calculate_amounts(10_000, fee), Err(SplitError::InvalidFee));
        }
        for gross in [0, -1, 1, 99, 101, 9_999, 10_001, i128::MAX] {
            assert!(calculate_amounts(gross, 100).is_err());
        }
    }

    #[test]
    fn expiry_binding_destinations_and_replay_fail_closed() {
        let f = fixture(50_000);
        let client = FeeSplitRouterClient::new(&f.env, &f.contract);
        let valid = request(&f, 10_000, 100, 2, 1_100);
        assert_eq!(
            client.try_split(&SplitRequest {
                expires_ledger: 1_000,
                ..valid.clone()
            }),
            Err(Ok(SplitError::Expired))
        );
        assert_eq!(
            client.try_split(&SplitRequest {
                expires_ledger: 1_121,
                ..valid.clone()
            }),
            Err(Ok(SplitError::ExpiryTooFar))
        );
        assert_eq!(
            client.try_split(&SplitRequest {
                provider: f.treasury.clone(),
                ..valid.clone()
            }),
            Err(Ok(SplitError::InvalidDestinations))
        );
        assert_eq!(
            client.try_split(&SplitRequest {
                nonce: BytesN::from_array(&f.env, &[0; 32]),
                ..valid.clone()
            }),
            Err(Ok(SplitError::InvalidBinding))
        );
        client.split(&valid);
        assert_eq!(
            client.try_split(&valid),
            Err(Ok(SplitError::ReplayDetected))
        );
    }

    #[test]
    fn failed_second_transfer_rolls_back_first_and_replay_marker() {
        let f = fixture(9_950);
        let client = FeeSplitRouterClient::new(&f.env, &f.contract);
        let req = request(&f, 10_000, 100, 3, 1_100);
        assert!(client.try_split(&req).is_err());
        let token = TokenClient::new(&f.env, &f.token);
        assert_eq!(token.balance(&f.payer), 9_950);
        assert_eq!(token.balance(&f.provider), 0);
        assert_eq!(token.balance(&f.treasury), 0);
        assert!(!client.is_request_used(&f.payer, &req.request_binding));
    }

    #[test]
    fn property_samples_preserve_total_without_rounding() {
        for fee_bps in 1_u32..=500 {
            for units in 1_i128..=100_i128 {
                let gross = units * 10_000;
                let (provider, fee) = calculate_amounts(gross, fee_bps).unwrap();
                assert_eq!(provider + fee, gross);
                assert_eq!(fee, units * fee_bps as i128);
            }
        }
    }
}
