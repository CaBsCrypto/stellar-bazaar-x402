#![no_std]

//! Bazaar Service Registry v0 — metadata provenance only.
//!
//! This contract never receives, holds, releases, or forwards payment assets.
//! It anchors a canonical off-chain ServiceCard SHA-256 digest (`BytesN<32>`),
//! provider owner, URI, revision and curated lifecycle state.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, String};

#[derive(Clone)]
#[contracttype]
pub enum Status { Draft, Reviewed, Published, Suspended, Revoked }

#[derive(Clone)]
#[contracttype]
pub struct Record {
    pub provider: Address,
    pub card_hash: BytesN<32>,
    pub card_uri: String,
    pub revision: u32,
    pub status: Status,
    pub updated_ledger: u32,
}

#[derive(Clone)]
#[contracttype]
enum Key { Curator, Service(BytesN<32>) }

#[contract]
pub struct ServiceRegistry;

fn curator(env: &Env) -> Address { env.storage().instance().get(&Key::Curator).unwrap() }
fn read(env: &Env, id: &BytesN<32>) -> Record { env.storage().persistent().get(&Key::Service(id.clone())).unwrap() }
fn write(env: &Env, id: &BytesN<32>, record: &Record) { env.storage().persistent().set(&Key::Service(id.clone()), record); }

#[contractimpl]
impl ServiceRegistry {
    pub fn initialize(env: Env, registry_curator: Address) {
        if env.storage().instance().has(&Key::Curator) { panic!("already initialized"); }
        registry_curator.require_auth();
        env.storage().instance().set(&Key::Curator, &registry_curator);
    }

    /// Provider-authenticated creation. A service starts as Draft.
    pub fn register(env: Env, service_id: BytesN<32>, provider: Address, card_hash: BytesN<32>, card_uri: String) {
        provider.require_auth();
        if env.storage().persistent().has(&Key::Service(service_id.clone())) { panic!("service exists"); }
        let record = Record { provider: provider.clone(), card_hash, card_uri, revision: 1, status: Status::Draft, updated_ledger: env.ledger().sequence() };
        write(&env, &service_id, &record);
        env.events().publish((symbol_short!("service"), service_id), (symbol_short!("draft"), record.revision, record.card_hash));
    }

    /// Only the provider may replace a draft's URI/hash, and every replacement increments the revision.
    pub fn update_draft(env: Env, service_id: BytesN<32>, provider: Address, card_hash: BytesN<32>, card_uri: String, expected_revision: u32) {
        provider.require_auth();
        let mut record = read(&env, &service_id);
        if record.provider != provider || !matches!(record.status, Status::Draft) || record.revision != expected_revision { panic!("update rejected"); }
        record.card_hash = card_hash;
        record.card_uri = card_uri;
        record.revision += 1;
        record.updated_ledger = env.ledger().sequence();
        write(&env, &service_id, &record);
        env.events().publish((symbol_short!("service"), service_id), (symbol_short!("updated"), record.revision, record.card_hash));
    }

    /// Curator validates metadata externally, then advances Draft -> Reviewed -> Published.
    pub fn set_status(env: Env, service_id: BytesN<32>, next: Status) {
        let registry_curator = curator(&env);
        registry_curator.require_auth();
        let mut record = read(&env, &service_id);
        let valid = matches!((&record.status, &next),
            (Status::Draft, Status::Reviewed) |
            (Status::Reviewed, Status::Published) |
            (Status::Reviewed, Status::Suspended) |
            (Status::Published, Status::Suspended) |
            (Status::Suspended, Status::Reviewed)
        );
        if !valid { panic!("invalid status transition"); }
        record.status = next;
        record.updated_ledger = env.ledger().sequence();
        write(&env, &service_id, &record);
        env.events().publish((symbol_short!("service"), service_id), (symbol_short!("status"), record.revision, record.status));
    }

    /// A provider can permanently revoke but can never reactivate a record.
    pub fn revoke(env: Env, service_id: BytesN<32>, provider: Address) {
        provider.require_auth();
        let mut record = read(&env, &service_id);
        if record.provider != provider || matches!(record.status, Status::Revoked) { panic!("revoke rejected"); }
        record.status = Status::Revoked;
        record.updated_ledger = env.ledger().sequence();
        write(&env, &service_id, &record);
        env.events().publish((symbol_short!("service"), service_id), (symbol_short!("revoked"), record.revision, record.card_hash));
    }

    pub fn get(env: Env, service_id: BytesN<32>) -> Record { read(&env, &service_id) }
}
