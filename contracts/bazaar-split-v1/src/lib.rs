#![no_std]
//! Undeployed Bazaar-specific split profile. This contract is NOT Stellar x402 `exact`.
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Bytes, BytesN, Env, String};

pub const FEE_BPS: u32 = 150;
pub const MAX_LIFETIME_SECONDS: u64 = 300;
pub const ASSET: &str = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
pub const TREASURY: &str = "GATWLYZ5KF4H4YEPBINI6DARECUCI5CIN5ZEOF7YN7XYJ22Z5TLRXZ2X";
pub const TESTNET_PASSPHRASE: &[u8] = b"Test SDF Network ; September 2015";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitIntent {
    pub asset: Address,
    pub payer: Address,
    pub provider: Address,
    pub treasury: Address,
    pub router: Address,
    pub gross: i128,
    pub fee_bps: u32,
    pub network_id: BytesN<32>,
    pub order_id: BytesN<32>,
    pub card_hash: BytesN<32>,
    pub input_hash: BytesN<32>,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitReceipt { pub intent: SplitIntent, pub net: i128, pub fee: i128 }

#[contracttype]
#[derive(Clone)]
enum DataKey { Used(Address, BytesN<32>) }

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SplitError {
    InvalidAmount = 1, RoundingNotPermitted = 2, SameDestination = 3,
    InvalidFee = 4, InvalidNetwork = 5, InvalidAsset = 6, InvalidTreasury = 7,
    InvalidRouter = 8, Expired = 9, LifetimeTooLong = 10, ReplayedOrder = 11,
    EmptyBinding = 12, InvalidAccount = 13,
}

pub fn amounts(gross: i128) -> Result<(i128, i128), SplitError> {
    if gross <= 0 { return Err(SplitError::InvalidAmount); }
    let numerator = gross.checked_mul(FEE_BPS as i128).ok_or(SplitError::InvalidAmount)?;
    if numerator % 10_000 != 0 { return Err(SplitError::RoundingNotPermitted); }
    let fee = numerator / 10_000;
    let net = gross.checked_sub(fee).ok_or(SplitError::InvalidAmount)?;
    if net <= 0 || fee <= 0 { return Err(SplitError::InvalidAmount); }
    Ok((net, fee))
}

fn is_account(address: &Address) -> bool {
    let mut encoded = [0u8;56];
    address.to_string().copy_into_slice(&mut encoded);
    encoded[0] == b'G'
}

#[contract]
pub struct FeeSplitRouter;

#[contractimpl]
impl FeeSplitRouter {
    /// Full intent AND both nested SAC transfers must be included in payer authorization.
    /// No relayer key, admin withdrawal, custody, fee override or arbitrary call is supported.
    pub fn split_payment(env: Env, intent: SplitIntent) -> Result<(i128, i128), SplitError> {
        let expected_network: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(&env, TESTNET_PASSPHRASE)).into();
        if env.ledger().network_id() != expected_network || intent.network_id != expected_network {
            return Err(SplitError::InvalidNetwork);
        }
        if intent.asset != Address::from_string(&String::from_str(&env, ASSET)) { return Err(SplitError::InvalidAsset); }
        if intent.treasury != Address::from_string(&String::from_str(&env, TREASURY)) { return Err(SplitError::InvalidTreasury); }
        if intent.router != env.current_contract_address() || intent.router == intent.asset { return Err(SplitError::InvalidRouter); }
        if !is_account(&intent.payer) || !is_account(&intent.provider) { return Err(SplitError::InvalidAccount); }
        if intent.payer == intent.provider || intent.payer == intent.treasury || intent.provider == intent.treasury { return Err(SplitError::SameDestination); }
        if intent.fee_bps != FEE_BPS { return Err(SplitError::InvalidFee); }
        let now = env.ledger().timestamp();
        if intent.expires_at <= now { return Err(SplitError::Expired); }
        if intent.expires_at - now > MAX_LIFETIME_SECONDS { return Err(SplitError::LifetimeTooLong); }
        let empty = BytesN::from_array(&env, &[0;32]);
        if intent.order_id == empty || intent.card_hash == empty || intent.input_hash == empty { return Err(SplitError::EmptyBinding); }
        let (net, fee) = amounts(intent.gross)?;
        intent.payer.require_auth();
        let used_key = DataKey::Used(intent.payer.clone(), intent.order_id.clone());
        if env.storage().persistent().has(&used_key) { return Err(SplitError::ReplayedOrder); }
        // Persistent entries archive rather than becoming absent: restoration cannot turn a paid order into a new order.
        // Record first to prevent nested re-entry. A failed transfer rolls this write back too.
        env.storage().persistent().set(&used_key, &true);
        env.storage().persistent().extend_ttl(&used_key, 100, 1000);
        let client = token::Client::new(&env, &intent.asset);
        client.transfer(&intent.payer, &intent.provider, &net);
        client.transfer(&intent.payer, &intent.treasury, &fee);
        env.events().publish((symbol_short!("split_v1"), intent.order_id.clone()), SplitReceipt { intent, net, fee });
        Ok((net, fee))
    }
}

#[cfg(test)]
mod test;
