#![no_std]

//! Bazaar Service Registry v0 — metadata provenance only.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, xdr::ToXdr, Address, Bytes,
    BytesN, Env,
};

const INSTANCE_TTL_THRESHOLD: u32 = 17_280;
const INSTANCE_TTL_EXTEND_TO: u32 = 120_960;
const RECORD_TTL_THRESHOLD: u32 = 17_280;
const RECORD_TTL_EXTEND_TO: u32 = 120_960;
const MAX_CARD_URI_LEN: u32 = 256;
const SERVICE_ID_DOMAIN: &[u8] = b"stellar-bazaar:service-registry:v1\0";

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub enum Status {
    Draft,
    Reviewed,
    Published,
    Suspended,
    Revoked,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Record {
    pub provider: Address,
    pub service_key: BytesN<32>,
    pub card_hash: BytesN<32>,
    pub card_uri: Bytes,
    pub revision: u32,
    pub status: Status,
    pub updated_ledger: u32,
}

#[derive(Clone)]
#[contracttype]
enum Key {
    Curator,
    Service(BytesN<32>),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    ServiceExists = 3,
    ServiceNotFound = 4,
    UpdateRejected = 5,
    InvalidStatusTransition = 6,
    RevokeRejected = 7,
    CardUriInvalid = 8,
    RevisionOverflow = 9,
}

#[contract]
pub struct ServiceRegistry;

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

fn bump_record(env: &Env, key: &Key) {
    env.storage()
        .persistent()
        .extend_ttl(key, RECORD_TTL_THRESHOLD, RECORD_TTL_EXTEND_TO);
}

fn curator(env: &Env) -> Result<Address, RegistryError> {
    let value = env
        .storage()
        .instance()
        .get(&Key::Curator)
        .ok_or(RegistryError::NotInitialized)?;
    bump_instance(env);
    Ok(value)
}

fn read(env: &Env, id: &BytesN<32>) -> Result<Record, RegistryError> {
    let key = Key::Service(id.clone());
    let value = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(RegistryError::ServiceNotFound)?;
    bump_record(env, &key);
    bump_instance(env);
    Ok(value)
}

fn write(env: &Env, id: &BytesN<32>, record: &Record) {
    let key = Key::Service(id.clone());
    env.storage().persistent().set(&key, record);
    bump_record(env, &key);
    bump_instance(env);
}

fn valid_card_uri(uri: &Bytes) -> bool {
    let prefix = b"https://";
    if uri.len() <= prefix.len() as u32 || uri.len() > MAX_CARD_URI_LEN {
        return false;
    }
    for (index, expected) in prefix.iter().enumerate() {
        if uri.get(index as u32) != Some(*expected) {
            return false;
        }
    }
    let mut host_len = 0u32;
    for index in prefix.len() as u32..uri.len() {
        let Some(byte) = uri.get(index) else {
            return false;
        };
        if byte == b'/' || byte == b'?' {
            break;
        }
        if byte == b'@' || byte == b'\\' || byte == b'#' {
            return false;
        }
        if !(byte.is_ascii_alphanumeric()
            || byte == b'.'
            || byte == b'-'
            || byte == b':'
            || byte == b'['
            || byte == b']')
        {
            return false;
        }
        host_len += 1;
    }
    if host_len == 0 {
        return false;
    }
    for index in 0..uri.len() {
        let Some(byte) = uri.get(index) else {
            return false;
        };
        if !(0x21..=0x7e).contains(&byte) || byte == b'\\' || byte == b'#' {
            return false;
        }
    }
    true
}

fn derive_service_id_inner(env: &Env, provider: &Address, service_key: &BytesN<32>) -> BytesN<32> {
    let mut material = Bytes::from_slice(env, SERVICE_ID_DOMAIN);
    material.append(&provider.clone().to_xdr(env));
    material.append(&Bytes::from(service_key));
    env.crypto().sha256(&material).to_bytes()
}

#[contractimpl]
impl ServiceRegistry {
    pub fn initialize(env: Env, registry_curator: Address) -> Result<(), RegistryError> {
        registry_curator.require_auth();
        if env.storage().instance().has(&Key::Curator) {
            return Err(RegistryError::AlreadyInitialized);
        }
        env.storage()
            .instance()
            .set(&Key::Curator, &registry_curator);
        bump_instance(&env);
        Ok(())
    }

    pub fn derive_service_id(env: Env, provider: Address, service_key: BytesN<32>) -> BytesN<32> {
        derive_service_id_inner(&env, &provider, &service_key)
    }

    pub fn register(
        env: Env,
        provider: Address,
        service_key: BytesN<32>,
        card_hash: BytesN<32>,
        card_uri: Bytes,
    ) -> Result<BytesN<32>, RegistryError> {
        provider.require_auth();
        if !valid_card_uri(&card_uri) {
            return Err(RegistryError::CardUriInvalid);
        }
        let service_id = derive_service_id_inner(&env, &provider, &service_key);
        if env
            .storage()
            .persistent()
            .has(&Key::Service(service_id.clone()))
        {
            return Err(RegistryError::ServiceExists);
        }
        let record = Record {
            provider: provider.clone(),
            service_key,
            card_hash,
            card_uri,
            revision: 1,
            status: Status::Draft,
            updated_ledger: env.ledger().sequence(),
        };
        write(&env, &service_id, &record);
        env.events().publish(
            (symbol_short!("service"), service_id.clone()),
            (symbol_short!("draft"), record.revision, record.card_hash),
        );
        Ok(service_id)
    }

    pub fn update_draft(
        env: Env,
        service_id: BytesN<32>,
        provider: Address,
        card_hash: BytesN<32>,
        card_uri: Bytes,
        expected_revision: u32,
    ) -> Result<(), RegistryError> {
        provider.require_auth();
        if !valid_card_uri(&card_uri) {
            return Err(RegistryError::CardUriInvalid);
        }
        let mut record = read(&env, &service_id)?;
        if record.provider != provider
            || record.status != Status::Draft
            || record.revision != expected_revision
        {
            return Err(RegistryError::UpdateRejected);
        }
        record.revision = record
            .revision
            .checked_add(1)
            .ok_or(RegistryError::RevisionOverflow)?;
        record.card_hash = card_hash;
        record.card_uri = card_uri;
        record.updated_ledger = env.ledger().sequence();
        write(&env, &service_id, &record);
        env.events().publish(
            (symbol_short!("service"), service_id),
            (symbol_short!("updated"), record.revision, record.card_hash),
        );
        Ok(())
    }

    pub fn set_status(env: Env, service_id: BytesN<32>, next: Status) -> Result<(), RegistryError> {
        let registry_curator = curator(&env)?;
        registry_curator.require_auth();
        let mut record = read(&env, &service_id)?;
        let valid = matches!(
            (&record.status, &next),
            (Status::Draft, Status::Reviewed)
                | (Status::Reviewed, Status::Published)
                | (Status::Reviewed, Status::Suspended)
                | (Status::Published, Status::Suspended)
                | (Status::Suspended, Status::Reviewed)
        );
        if !valid {
            return Err(RegistryError::InvalidStatusTransition);
        }
        record.status = next;
        record.updated_ledger = env.ledger().sequence();
        write(&env, &service_id, &record);
        env.events().publish(
            (symbol_short!("service"), service_id),
            (symbol_short!("status"), record.revision, record.status),
        );
        Ok(())
    }

    pub fn revoke(
        env: Env,
        service_id: BytesN<32>,
        provider: Address,
    ) -> Result<(), RegistryError> {
        provider.require_auth();
        let mut record = read(&env, &service_id)?;
        if record.provider != provider || record.status == Status::Revoked {
            return Err(RegistryError::RevokeRejected);
        }
        record.status = Status::Revoked;
        record.updated_ledger = env.ledger().sequence();
        write(&env, &service_id, &record);
        env.events().publish(
            (symbol_short!("service"), service_id),
            (symbol_short!("revoked"), record.revision, record.card_hash),
        );
        Ok(())
    }

    pub fn get(env: Env, service_id: BytesN<32>) -> Result<Record, RegistryError> {
        read(&env, &service_id)
    }
}

#[cfg(test)]
mod test {
    extern crate std;
    use super::*;
    use soroban_sdk::{
        testutils::{storage::Instance as _, storage::Persistent as _, Address as _, Events as _},
        vec, Address, Bytes, BytesN, Env, IntoVal, String, Symbol, TryIntoVal,
    };

    fn initialized() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract = env.register_contract(None, ServiceRegistry);
        let provider = Address::generate(&env);
        let curator = Address::generate(&env);
        ServiceRegistryClient::new(&env, &contract).initialize(&curator);
        (env, contract, provider, curator)
    }
    fn hash(env: &Env, marker: u8) -> BytesN<32> {
        BytesN::from_array(env, &[marker; 32])
    }
    fn uri(env: &Env) -> Bytes {
        Bytes::from_slice(env, b"https://provider.example/.well-known/bazaar.json")
    }

    fn decode_hex_32(value: &str) -> [u8; 32] {
        let mut output = [0u8; 32];
        for (index, chunk) in value.as_bytes().chunks_exact(2).enumerate() {
            let digit = |byte: u8| match byte {
                b'0'..=b'9' => byte - b'0',
                b'a'..=b'f' => byte - b'a' + 10,
                _ => panic!("invalid vector hex"),
            };
            output[index] = digit(chunk[0]) * 16 + digit(chunk[1]);
        }
        output
    }

    #[test]
    fn initialization_registration_and_identity_are_fail_closed() {
        let (env, contract, provider, curator) = initialized();
        let client = ServiceRegistryClient::new(&env, &contract);
        assert_eq!(
            client.try_initialize(&curator),
            Err(Ok(RegistryError::AlreadyInitialized))
        );
        let key = hash(&env, 1);
        let id = client.register(&provider, &key, &hash(&env, 2), &uri(&env));
        let record = client.get(&id);
        assert_eq!(record.provider, provider);
        assert_eq!(record.service_key, key);
        assert_eq!(record.status, Status::Draft);
        assert_eq!(record.revision, 1);
        assert_eq!(
            client.derive_service_id(&record.provider, &record.service_key),
            id
        );
        assert_eq!(
            client.try_register(
                &record.provider,
                &record.service_key,
                &record.card_hash,
                &record.card_uri
            ),
            Err(Ok(RegistryError::ServiceExists))
        );
        let other = Address::generate(&env);
        assert_ne!(id, client.derive_service_id(&other, &record.service_key));
        assert_ne!(
            id,
            client.derive_service_id(&record.provider, &hash(&env, 3))
        );
    }

    #[test]
    fn uri_revision_lifecycle_and_revocation_rules_are_stable() {
        let (env, contract, provider, _) = initialized();
        let client = ServiceRegistryClient::new(&env, &contract);
        let invalid = Bytes::from_slice(&env, b"http://unsafe.example/card.json");
        assert_eq!(
            client.try_register(&provider, &hash(&env, 3), &hash(&env, 4), &invalid),
            Err(Ok(RegistryError::CardUriInvalid))
        );
        let id = client.register(&provider, &hash(&env, 5), &hash(&env, 6), &uri(&env));
        assert_eq!(
            client.try_update_draft(&id, &provider, &hash(&env, 7), &uri(&env), &2),
            Err(Ok(RegistryError::UpdateRejected))
        );
        client.update_draft(&id, &provider, &hash(&env, 7), &uri(&env), &1);
        assert_eq!(client.get(&id).revision, 2);
        assert_eq!(
            client.try_set_status(&id, &Status::Published),
            Err(Ok(RegistryError::InvalidStatusTransition))
        );
        client.set_status(&id, &Status::Reviewed);
        client.set_status(&id, &Status::Published);
        assert_eq!(
            client.try_update_draft(&id, &provider, &hash(&env, 8), &uri(&env), &2),
            Err(Ok(RegistryError::UpdateRejected))
        );
        client.revoke(&id, &provider);
        assert_eq!(client.get(&id).status, Status::Revoked);
        assert_eq!(
            client.try_revoke(&id, &provider),
            Err(Ok(RegistryError::RevokeRejected))
        );
        assert_eq!(
            client.try_set_status(&id, &Status::Reviewed),
            Err(Ok(RegistryError::InvalidStatusTransition))
        );

        for unsafe_uri in [
            b"https://".as_slice(),
            b"https://user@example.com/card".as_slice(),
            b"https://example.com/card#fragment".as_slice(),
            b"https://example.com\\card".as_slice(),
            b"https://example.com/card with-space".as_slice(),
        ] {
            assert_eq!(
                client.try_register(
                    &provider,
                    &hash(&env, 11),
                    &hash(&env, 12),
                    &Bytes::from_slice(&env, unsafe_uri)
                ),
                Err(Ok(RegistryError::CardUriInvalid))
            );
        }
    }

    #[test]
    fn shared_typescript_rust_identity_vector_matches() {
        let env = Env::default();
        let vector = include_str!("../test-vectors/service-id-v1.tsv").trim();
        let mut fields = vector.split('|');
        let provider = Address::from_string(&String::from_str(&env, fields.next().unwrap()));
        let service_key = BytesN::from_array(&env, &decode_hex_32(fields.next().unwrap()));
        let expected = BytesN::from_array(&env, &decode_hex_32(fields.next().unwrap()));
        assert_eq!(
            derive_service_id_inner(&env, &provider, &service_key),
            expected
        );
    }

    #[test]
    fn persistent_record_ttl_is_extended() {
        let (env, contract, provider, _) = initialized();
        let client = ServiceRegistryClient::new(&env, &contract);
        let id = client.register(&provider, &hash(&env, 13), &hash(&env, 14), &uri(&env));
        let ttl = env.as_contract(&contract, || {
            env.storage()
                .persistent()
                .get_ttl(&Key::Service(id.clone()))
        });
        assert!(ttl >= RECORD_TTL_EXTEND_TO - 1);
        let instance_ttl = env.as_contract(&contract, || env.storage().instance().get_ttl());
        assert!(instance_ttl >= INSTANCE_TTL_EXTEND_TO - 1);
    }

    #[test]
    fn missing_authorization_is_rejected_by_host() {
        let env = Env::default();
        let contract = env.register_contract(None, ServiceRegistry);
        let curator = Address::generate(&env);
        let client = ServiceRegistryClient::new(&env, &contract);
        assert!(matches!(client.try_initialize(&curator), Err(Err(_))));
    }

    #[test]
    fn draft_event_contains_only_expected_provenance_fields() {
        let (env, contract, provider, _) = initialized();
        let client = ServiceRegistryClient::new(&env, &contract);
        let card_hash = hash(&env, 15);
        let id = client.register(&provider, &hash(&env, 16), &card_hash, &uri(&env));
        let events = env.events().all();
        let (event_contract, topics, data) = events.last().unwrap();
        assert_eq!(event_contract, contract);
        assert_eq!(
            topics,
            vec![
                &env,
                symbol_short!("service").into_val(&env),
                id.into_val(&env)
            ]
        );
        let decoded: (Symbol, u32, BytesN<32>) = data.try_into_val(&env).unwrap();
        assert_eq!(decoded, (symbol_short!("draft"), 1u32, card_hash));
    }
}
