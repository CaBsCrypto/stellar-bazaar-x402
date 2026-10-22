use super::*;
extern crate std;
use ed25519_dalek::{Signer as _, SigningKey};
use soroban_sdk::{contract, contractimpl, contracttype, testutils::{Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke}, IntoVal, TryFromVal, Val, Vec, xdr};
use std::{rc::Rc, sync::atomic::{AtomicI64, Ordering}};
use xdr::WriteXdr;
static NONCE: AtomicI64 = AtomicI64::new(100);

// Public synthetic unit-test key only. It is unrelated to any owner credential or production/testnet wallet.
fn test_key() -> SigningKey { SigningKey::from_bytes(&[42;32]) }

fn account_id() -> xdr::AccountId { xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(test_key().verifying_key().to_bytes()))) }

#[contracttype]
#[derive(Clone)]
struct AccountSignature { public_key: BytesN<32>, signature: BytesN<64> }

fn install_test_account(env: &Env) -> Address {
    let id = account_id();
    let key = Rc::new(xdr::LedgerKey::Account(xdr::LedgerKeyAccount { account_id: id.clone() }));
    let entry = Rc::new(xdr::LedgerEntry {
        last_modified_ledger_seq: 0, ext: xdr::LedgerEntryExt::V0,
        data: xdr::LedgerEntryData::Account(xdr::AccountEntry {
            account_id: id.clone(), balance: 10_000_000, seq_num: xdr::SequenceNumber(0),
            num_sub_entries: 0, inflation_dest: None, flags: 0, home_domain: Default::default(),
            thresholds: xdr::Thresholds([1,1,1,1]), signers: Default::default(), ext: xdr::AccountEntryExt::V0,
        }),
    });
    env.host().add_ledger_entry(&key, &entry, None).unwrap();
    Address::try_from_val(env, &xdr::ScAddress::Account(id)).unwrap()
}

fn authorize_invocation(env: &Env, intent: &SplitIntent, invocation: xdr::SorobanAuthorizedInvocation) -> xdr::SorobanAuthorizationEntry {
    let nonce = NONCE.fetch_add(1, Ordering::SeqCst);
    let signature_expiration_ledger = 50;
    let preimage = xdr::HashIdPreimage::SorobanAuthorization(xdr::HashIdPreimageSorobanAuthorization {
        network_id: xdr::Hash(intent.network_id.to_array()), invocation: invocation.clone(), nonce, signature_expiration_ledger,
    });
    let bytes = preimage.to_xdr(xdr::Limits::none()).unwrap();
    let digest = env.crypto().sha256(&Bytes::from_slice(env, &bytes));
    let sig = test_key().sign(&digest.to_array()).to_bytes();
    let signatures: Val = Vec::from_array(env, [AccountSignature {
        public_key: BytesN::from_array(env, &test_key().verifying_key().to_bytes()), signature: BytesN::from_array(env, &sig),
    }]).into_val(env);
    let entry = xdr::SorobanAuthorizationEntry {
        root_invocation: invocation,
        credentials: xdr::SorobanCredentials::Address(xdr::SorobanAddressCredentials {
            address: xdr::ScAddress::Account(account_id()), nonce, signature_expiration_ledger,
            signature: xdr::ScVal::try_from_val(env, &signatures).unwrap(),
        }),
    };
    env.set_auths(&[entry.clone()]);
    entry
}

// Native Soroban test-host token. It intentionally fails the SECOND transfer when requested.
// This tests host transactional rollback, not SAC authorization/trustline compatibility.
#[contract]
struct TestToken;
#[contracttype]
#[derive(Clone)]
enum TokenKey { Balance(Address), BlockTreasury }
#[contractimpl]
impl TestToken {
    pub fn seed(env: Env, payer: Address, amount: i128) { env.storage().instance().set(&TokenKey::Balance(payer), &amount); }
    pub fn block_treasury(env: Env, blocked: bool) { env.storage().instance().set(&TokenKey::BlockTreasury, &blocked); }
    pub fn balance(env: Env, address: Address) -> i128 { env.storage().instance().get(&TokenKey::Balance(address)).unwrap_or(0) }
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let treasury = Address::from_string(&String::from_str(&env, TREASURY));
        if to == treasury && env.storage().instance().get(&TokenKey::BlockTreasury).unwrap_or(false) { panic!("second transfer refused"); }
        let balance = Self::balance(env.clone(), from.clone());
        assert!(amount > 0 && balance >= amount);
        env.storage().instance().set(&TokenKey::Balance(from), &(balance - amount));
        let received = Self::balance(env.clone(), to.clone());
        env.storage().instance().set(&TokenKey::Balance(to), &(received + amount));
    }
}

fn fixture() -> (Env, Address, SplitIntent) {
    let env = Env::default();
    let network: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(&env, TESTNET_PASSPHRASE)).into();
    env.ledger().with_mut(|l| { l.network_id = network.to_array(); l.timestamp = 1000; l.sequence_number = 10; });
    let asset = Address::from_string(&String::from_str(&env, ASSET));
    env.register_contract(Some(&asset), TestToken);
    let router = env.register_contract(None, FeeSplitRouter);
    let intent = SplitIntent {
        asset, payer: install_test_account(&env),
        provider: Address::from_string(&String::from_str(&env, "GAHV4MBWHHMFJ6P55UJNQPUAUDGFV6DGJY4TSZ22JGT3CVFIYYSWDJ2C")),
        treasury: Address::from_string(&String::from_str(&env, TREASURY)),
        router: router.clone(), gross: 100_000, fee_bps: FEE_BPS,
        network_id: network, order_id: BytesN::from_array(&env, &[1;32]),
        card_hash: BytesN::from_array(&env, &[2;32]), input_hash: BytesN::from_array(&env, &[3;32]), expires_at: 1200,
    };
    TestTokenClient::new(&env, &intent.asset).seed(&intent.payer, &100_000);
    (env, router, intent)
}

fn authorize(env: &Env, intent: &SplitIntent) -> xdr::SorobanAuthorizationEntry {
    let (net, fee) = amounts(intent.gross).unwrap();
    let template: xdr::SorobanAuthorizationEntry = MockAuth {
        address: &intent.payer,
        invoke: &MockAuthInvoke {
            contract: &intent.router, fn_name: "split_payment", args: (intent.clone(),).into_val(env),
            sub_invokes: &[
                MockAuthInvoke { contract: &intent.asset, fn_name: "transfer", args: (intent.payer.clone(), intent.provider.clone(), net).into_val(env), sub_invokes: &[] },
                MockAuthInvoke { contract: &intent.asset, fn_name: "transfer", args: (intent.payer.clone(), intent.treasury.clone(), fee).into_val(env), sub_invokes: &[] },
            ],
        },
    }.into();
    authorize_invocation(env, intent, template.root_invocation)
}

#[test]
fn exact_150_bps_math_and_overflow() {
    assert_eq!(amounts(100_000), Ok((98_500, 1_500)));
    assert_eq!(amounts(200), Ok((197, 3)));
    assert_eq!(amounts(201), Err(SplitError::RoundingNotPermitted));
    assert_eq!(amounts(0), Err(SplitError::InvalidAmount));
    assert_eq!(amounts(-1), Err(SplitError::InvalidAmount));
    assert_eq!(amounts(i128::MAX), Err(SplitError::InvalidAmount));
}

#[test]
fn strict_authorized_tree_transfers_both_destinations() {
    let (env, router, intent) = fixture();
    authorize(&env, &intent);
    let result = FeeSplitRouterClient::new(&env, &router).split_payment(&intent);
    assert_eq!(result, (98_500, 1_500));
    let token = TestTokenClient::new(&env, &intent.asset);
    assert_eq!(token.balance(&intent.payer), 0);
    assert_eq!(token.balance(&intent.provider), 98_500);
    assert_eq!(token.balance(&intent.treasury), 1_500);
    assert_eq!(token.balance(&router), 0);
    assert_eq!(env.events().all().len(), 1);
    let event = env.events().all().get(0).unwrap();
    assert_eq!(event.0, router);
    assert_eq!(event.1, (symbol_short!("split_v1"), intent.order_id.clone()).into_val(&env));
    assert_eq!(SplitReceipt::try_from_val(&env, &event.2).unwrap(), SplitReceipt { intent, net: 98_500, fee: 1_500 });
}

#[test]
fn compiled_wasm_executes_atomic_split_and_second_transfer_rollback_in_local_vm() {
    let wasm_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/wasm32v1-none/release/bazaar_fee_split_router_v1.wasm");
    let wasm = std::fs::read(wasm_path).expect("Build the locked offline wasm32v1-none release before running this test");
    for blocked in [false, true] {
        let (env, _, mut intent) = fixture();
        let router = env.register_contract_wasm(None, wasm.as_slice());
        intent.router = router.clone();
        let token = TestTokenClient::new(&env, &intent.asset);
        token.block_treasury(&blocked);
        authorize(&env, &intent);
        let client = FeeSplitRouterClient::new(&env, &router);
        if blocked {
            assert!(client.try_split_payment(&intent).is_err());
            assert_eq!(token.balance(&intent.payer), 100_000);
            assert_eq!(token.balance(&intent.provider), 0);
            assert_eq!(token.balance(&intent.treasury), 0);
            assert_eq!(env.events().all().len(), 0);
            env.as_contract(&router, || assert!(!env.storage().persistent().has(&DataKey::Used(intent.payer.clone(), intent.order_id.clone()))));
        } else {
            assert_eq!(client.split_payment(&intent), (98_500, 1_500));
            assert_eq!(token.balance(&intent.payer), 0);
            assert_eq!(token.balance(&intent.provider), 98_500);
            assert_eq!(token.balance(&intent.treasury), 1_500);
        }
        assert_eq!(token.balance(&router), 0);
    }
}

#[test]
fn unauthorized_root_rejected_without_balance_changes() {
    let (env, router, intent) = fixture();
    env.set_auths(&[]);
    assert!(FeeSplitRouterClient::new(&env, &router).try_split_payment(&intent).is_err());
    let token = TestTokenClient::new(&env, &intent.asset);
    assert_eq!(token.balance(&intent.payer), 100_000);
    assert_eq!(token.balance(&intent.provider), 0);
    assert_eq!(token.balance(&intent.treasury), 0);
}

#[test]
fn invalid_ed25519_signature_expired_credential_and_replayed_nonce_rejected() {
    for mutation in 0..2 {
        let (env, router, intent) = fixture();
        let mut entry = authorize(&env, &intent);
        if let xdr::SorobanCredentials::Address(ref mut credentials) = entry.credentials {
            if mutation == 0 {
                let corrupted: Val = Vec::from_array(&env, [AccountSignature {
                    public_key: BytesN::from_array(&env, &test_key().verifying_key().to_bytes()),
                    signature: BytesN::from_array(&env, &[0;64]),
                }]).into_val(&env);
                credentials.signature = xdr::ScVal::try_from_val(&env, &corrupted).unwrap();
            } else { credentials.signature_expiration_ledger = 9; }
        }
        env.set_auths(&[entry]);
        assert!(FeeSplitRouterClient::new(&env, &router).try_split_payment(&intent).is_err());
        assert_eq!(TestTokenClient::new(&env, &intent.asset).balance(&intent.payer), 100_000);
    }
    let (env, router, intent) = fixture();
    let entry = authorize(&env, &intent);
    let client = FeeSplitRouterClient::new(&env, &router);
    client.split_payment(&intent);
    env.set_auths(&[entry]);
    assert!(client.try_split_payment(&intent).is_err());
    assert_eq!(TestTokenClient::new(&env, &intent.asset).balance(&intent.treasury), 1_500);
}

#[test]
fn tampered_card_input_order_and_provider_do_not_match_authorized_root() {
    for field in 0..4 {
        let (env, router, intent) = fixture();
        authorize(&env, &intent);
        let mut altered = intent.clone();
        match field { 0 => altered.card_hash = BytesN::from_array(&env, &[9;32]), 1 => altered.input_hash = BytesN::from_array(&env, &[9;32]), 2 => altered.order_id = BytesN::from_array(&env, &[9;32]), _ => altered.provider = Address::from_string(&String::from_str(&env, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF")) }
        assert!(FeeSplitRouterClient::new(&env, &router).try_split_payment(&altered).is_err());
        assert_eq!(TestTokenClient::new(&env, &intent.asset).balance(&intent.payer), 100_000);
    }
}

#[test]
fn incomplete_nested_authorization_is_rejected_atomically() {
    let (env, router, intent) = fixture();
    let template: xdr::SorobanAuthorizationEntry = MockAuth { address: &intent.payer, invoke: &MockAuthInvoke {
        contract: &router, fn_name: "split_payment", args: (intent.clone(),).into_val(&env),
        sub_invokes: &[MockAuthInvoke { contract: &intent.asset, fn_name: "transfer", args: (intent.payer.clone(), intent.provider.clone(), 98_500i128).into_val(&env), sub_invokes: &[] }],
    }}.into();
    authorize_invocation(&env, &intent, template.root_invocation);
    assert!(FeeSplitRouterClient::new(&env, &router).try_split_payment(&intent).is_err());
    let token = TestTokenClient::new(&env, &intent.asset);
    assert_eq!(token.balance(&intent.payer), 100_000);
    assert_eq!(token.balance(&intent.provider), 0);
    assert_eq!(token.balance(&intent.treasury), 0);
}

#[test]
fn second_transfer_failure_rolls_back_first_transfer_used_marker_and_event() {
    let (env, router, intent) = fixture();
    let token = TestTokenClient::new(&env, &intent.asset);
    token.block_treasury(&true);
    authorize(&env, &intent);
    assert!(FeeSplitRouterClient::new(&env, &router).try_split_payment(&intent).is_err());
    assert_eq!(token.balance(&intent.payer), 100_000);
    assert_eq!(token.balance(&intent.provider), 0);
    assert_eq!(token.balance(&intent.treasury), 0);
    assert_eq!(env.events().all().len(), 0);
    env.as_contract(&router, || assert!(!env.storage().persistent().has(&DataKey::Used(intent.payer.clone(), intent.order_id.clone()))));
    // A proven local rollback leaves this never-paid fixture admissible. No uncertain network retry is modeled here.
    token.block_treasury(&false);
    authorize(&env, &intent);
    assert_eq!(FeeSplitRouterClient::new(&env, &router).split_payment(&intent), (98_500, 1_500));
}

#[test]
fn same_order_cannot_be_paid_twice_even_with_new_auth() {
    let (env, router, intent) = fixture();
    authorize(&env, &intent);
    let client = FeeSplitRouterClient::new(&env, &router);
    client.split_payment(&intent);
    authorize(&env, &intent);
    assert_eq!(client.try_split_payment(&intent), Err(Ok(SplitError::ReplayedOrder)));
}

#[test]
fn pinned_runtime_and_fee_fields_rejected() {
    for field in 0..8 {
        let (env, router, mut intent) = fixture();
        let expected = match field {
            0 => { intent.network_id = BytesN::from_array(&env, &[7;32]); SplitError::InvalidNetwork },
            1 => { intent.asset = Address::generate(&env); SplitError::InvalidAsset },
            2 => { intent.treasury = Address::generate(&env); SplitError::InvalidTreasury },
            3 => { intent.router = Address::generate(&env); SplitError::InvalidRouter },
            4 => { intent.fee_bps = 100; SplitError::InvalidFee },
            5 => { intent.expires_at = 1000; SplitError::Expired },
            6 => { intent.expires_at = 1301; SplitError::LifetimeTooLong },
            _ => { intent.order_id = BytesN::from_array(&env, &[0;32]); SplitError::EmptyBinding },
        };
        assert_eq!(FeeSplitRouterClient::new(&env, &router).try_split_payment(&intent), Err(Ok(expected)));
    }
}
