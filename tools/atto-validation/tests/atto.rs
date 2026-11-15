use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn read(path: &str) -> String {
    fs::read_to_string(root().join(path)).unwrap_or_else(|error| panic!("{path}: {error}"))
}

fn parse(path: &str) -> Value {
    serde_json::from_str(&read(path)).unwrap_or_else(|error| panic!("{path}: {error}"))
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[test]
fn atto_is_registered_in_every_client_matrix() {
    let matrix = parse("clients/sdk-matrix.json");
    let secondary = parse("clients/client-contract-matrix.json");
    let manifest = parse("clients/contract-manifest.json");
    let expected = json!({
        "dir": "clients/atto",
        "runtime": "atto",
        "zed_target": "atto"
    });
    assert_eq!(matrix["targets"]["atto"], expected);
    assert_eq!(secondary["targets"]["atto"], expected);
    assert_eq!(matrix["standard_target_count"], 21);
    assert!(read("clients/sdk-matrix.toml").contains("\natto = true\n"));

    let targets = manifest["targets"].as_array().expect("targets array");
    assert_eq!(manifest["targetCount"].as_u64(), Some(targets.len() as u64));
    assert_eq!(
        targets.iter().filter(|entry| entry["target"] == "atto").count(),
        1
    );

    let zpkg = read(".zpkg.toml");
    assert!(zpkg.contains("[targets.atto]\ndir = \"clients/atto\"\nadapter = \"none\""));
}

#[test]
fn atto_source_receipt_is_cryptographically_bound_to_declared_target() {
    let manifest = parse("clients/contract-manifest.json");
    let entry = manifest["targets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["target"] == "atto")
        .expect("Atto entry");

    let source = read("clients/atto/src/cliptown.atto");
    let records = json!([{
        "path": "src/cliptown.atto",
        "sha256": sha256(source.as_bytes())
    }]);
    let canonical = serde_json::to_vec(&records).unwrap();
    let expected = sha256(&canonical);
    assert_eq!(entry["implementationFileCount"], 1);
    assert_eq!(entry["implementationSha256"], expected);
    assert_ne!(
        entry["implementationSha256"],
        Value::String(sha256(format!("{source}\n").as_bytes()))
    );

    let fingerprint = read("clients/.api-surface.sha256");
    let fingerprint = fingerprint.trim();
    let marker = parse("clients/atto/.zed-client-contract.json");
    assert_eq!(marker["coordinate"], "cliptown/cliptown-clients");
    assert_eq!(marker["target"], "atto");
    assert_eq!(marker["runtime"], "atto");
    assert_eq!(marker["zedTarget"], "atto");
    assert_eq!(marker["apiSurfaceSha256"], fingerprint);
    assert_eq!(entry["apiSurfaceSha256"], fingerprint);
    assert_eq!(read("clients/atto/.zed-api-surface.sha256").trim(), fingerprint);
}

#[test]
fn atto_helpers_are_bounded_without_executable_transport_claims() {
    let source = read("clients/atto/src/cliptown.atto");
    for fragment in [
        "fnc nonnegative_payload_bytes(int byte_length) -> bool",
        "fnc payload_bytes_within_limit(int byte_length) -> bool",
        "fnc nonnegative_cursor_bytes(int byte_length) -> bool",
        "fnc cursor_bytes_within_limit(int byte_length) -> bool",
        "return byte_length >= 0;",
        "return byte_length <= 1048576;",
        "return byte_length <= 4096;",
    ] {
        assert!(source.contains(fragment), "missing Atto guard: {fragment}");
    }
    assert_eq!(source.matches("fnc ").count(), 4);
    for forbidden in ["http_request(", "fetch(", "private_key(", "bearer_token("] {
        assert!(!source.contains(forbidden), "unexpected transport: {forbidden}");
    }
}
