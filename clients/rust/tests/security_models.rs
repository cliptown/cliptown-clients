use cliptown_interfaces_rust::{
    EncryptedObjectManifest, LocalUnlockPolicy, SignalCiphertextEnvelope,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct SecurityModelsFixture {
    local_unlock: LocalUnlockPolicy,
    signal_envelope: SignalCiphertextEnvelope,
    encrypted_object: EncryptedObjectManifest,
}

#[test]
fn security_models_validate_and_round_trip() {
    let source = include_str!("../../../fixtures/security-models.json");
    let expected: serde_json::Value = serde_json::from_str(source).unwrap();
    let fixture: SecurityModelsFixture = serde_json::from_str(source).unwrap();

    fixture.local_unlock.validate().unwrap();
    fixture.signal_envelope.validate().unwrap();
    fixture.encrypted_object.validate().unwrap();

    assert_eq!(serde_json::to_value(fixture).unwrap(), expected);
}
