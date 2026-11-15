//! Pure, Rust-native public/private API surface boundary checker.
//! The complete JSON-Schema/fingerprint/provenance verifier is a separate gate.
use serde_json::Value;
use std::collections::BTreeSet;

fn named_references(value: &Value) -> BTreeSet<String> {
    match value {
        Value::Object(map) => {
            let immediate = (map.get("kind").and_then(Value::as_str) == Some("named"))
                .then(|| map.get("name").and_then(Value::as_str))
                .flatten();
            immediate
                .into_iter()
                .map(str::to_owned)
                .chain(map.values().flat_map(|item| named_references(item).into_iter()))
                .collect()
        }
        Value::Array(items) => items
            .iter()
            .flat_map(|item| named_references(item).into_iter())
            .collect(),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => BTreeSet::new(),
    }
}

/// Drop private members recursively before inspecting public signatures.
/// A private implementation may mention private types without exposing them.
fn public_only(value: &Value) -> Option<Value> {
    match value {
        Value::Object(map) => {
            if map.get("visibility").and_then(Value::as_str) == Some("private") {
                return None;
            }
            Some(Value::Object(
                map.iter()
                    .filter_map(|(key, child)| {
                        public_only(child).map(|visible| (key.clone(), visible))
                    })
                    .collect(),
            ))
        }
        Value::Array(values) => Some(Value::Array(
            values.iter().filter_map(public_only).collect(),
        )),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => Some(value.clone()),
    }
}

/// Empty means every public signature is free of private named type references.
pub fn boundary_errors(surface: &Value) -> Vec<String> {
    let Some(symbols) = surface.get("symbols").and_then(Value::as_array) else {
        return vec!["contract has no symbols".to_owned()];
    };
    if symbols.is_empty() {
        return vec!["contract has no symbols".to_owned()];
    }
    let private_names: BTreeSet<String> = symbols
        .iter()
        .filter(|symbol| symbol.get("visibility").and_then(Value::as_str) == Some("private"))
        .filter_map(|symbol| symbol.get("name").and_then(Value::as_str))
        .map(str::to_owned)
        .collect();

    symbols
        .iter()
        .filter(|symbol| symbol.get("visibility").and_then(Value::as_str) == Some("public"))
        .filter_map(|symbol| {
            let public = public_only(symbol)?;
            let references = named_references(&public);
            let exposed: Vec<_> = references.intersection(&private_names).cloned().collect();
            (!exposed.is_empty()).then(|| {
                format!(
                    "{}: {}",
                    symbol
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("<unnamed>"),
                    exposed.join(", ")
                )
            })
        })
        .collect()
}

pub fn validate_client_targets<'a>(names: impl IntoIterator<Item = &'a str>) -> Result<usize, String> {
    let targets: BTreeSet<&str> = names
        .into_iter()
        .filter(|name| !name.is_empty() && !name.starts_with('.'))
        .collect();
    if targets.len() < 15 {
        return Err(format!("expected at least 15 client targets, got {}", targets.len()));
    }
    for required in ["dart", "rust"] {
        if !targets.contains(required) {
            return Err(format!("missing core client target: {required}"));
        }
    }
    if !["typescript", "ts", "nodejs"]
        .iter()
        .any(|name| targets.contains(name))
    {
        return Err("missing TypeScript client target".to_owned());
    }
    Ok(targets.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_private_type_in_public_method_and_constructor() {
        let document = json!({"symbols": [
            {"name": "Secret", "visibility": "private"},
            {"name": "Visible", "visibility": "public",
                "methods": [
                    {"visibility": "public", "returns": {"kind": "named", "name": "Secret"}}
                ]}
        ]});
        assert_eq!(boundary_errors(&document), vec!["Visible: Secret"]);
    }

    #[test]
    fn ignores_private_fields_but_rejects_private_type_in_public_field() {
        let fixture = |visibility: &str| json!({"symbols": [
            {"name": "Secret", "visibility": "private"},
            {"name": "Visible", "visibility": "public", "definition": {
                "kind": "object", "fields": [
                    {"visibility": visibility, "type": {"kind": "named", "name": "Secret"}}
                ]
            }}
        ]});
        assert!(boundary_errors(&fixture("private")).is_empty());
        assert_eq!(boundary_errors(&fixture("public")), vec!["Visible: Secret"]);
    }

    #[test]
    fn malformed_and_empty_contracts_fail_closed() {
        assert_eq!(boundary_errors(&json!({})), vec!["contract has no symbols"]);
        assert_eq!(boundary_errors(&json!({"symbols": []})), vec!["contract has no symbols"]);
    }

    #[test]
    fn core_targets_require_portable_runtime_floors() {
        let good: Vec<_> = [
            "dart", "rust", "typescript", "c", "cpp", "zig", "go", "python",
            "ruby", "php", "gleam", "erlang", "elixir", "java", "kotlin",
        ].into_iter().collect();
        assert_eq!(validate_client_targets(good), Ok(15));
        assert!(validate_client_targets(["rust", "dart"]).is_err());
    }
}
