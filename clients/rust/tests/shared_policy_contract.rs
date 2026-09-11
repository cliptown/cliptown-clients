use cliptown_client_rust::shared_policy::{
    authorize_delegated_operation, evaluate_idempotency, DelegatedClaims, DelegationError,
    DelegationPolicy, IdempotencyBinding, IdempotencyDecision, IdempotencyError,
    IdempotentOperation, Operation, CLIPTOWN_API_AUDIENCE, CLIPTOWN_LIB_REVISION,
    LOA2_ASSURANCE_CONTEXT, MEMEBANK_CLIENT_ID, MEMEBANK_READ_SCOPE, MEMEBANK_WRITE_SCOPE,
};

const NOW: i64 = 1_800_000_000;
const SHA256_A: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const SHA256_B: &str = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

fn policy() -> DelegationPolicy<'static> {
    DelegationPolicy {
        issuer: "https://auth.example.test",
        now_unix_seconds: NOW,
        maximum_token_lifetime_seconds: 300,
        maximum_authentication_age_seconds: 600,
        clock_skew_seconds: 30,
    }
}

fn claims(scope: &'static str) -> DelegatedClaims<'static> {
    DelegatedClaims {
        issuer: "https://auth.example.test",
        audience: CLIPTOWN_API_AUDIENCE,
        authorized_party: MEMEBANK_CLIENT_ID,
        subject: "00000000-0000-4000-8000-000000000001",
        session_id: "00000000-0000-4000-8000-000000000002",
        token_id: "delegated-token-0001",
        parent_token_id: "parent-token-0001",
        scope,
        issued_at_unix_seconds: NOW - 10,
        not_before_unix_seconds: NOW - 10,
        expires_at_unix_seconds: NOW + 290,
        authenticated_at_unix_seconds: Some(NOW - 60),
        assurance_level: 2,
        assurance_context: Some(LOA2_ASSURANCE_CONTEXT),
        authentication_methods: &["passkey"],
        session_active: true,
        delegated: true,
    }
}

#[test]
fn client_exposes_the_exact_canonical_library_revision() {
    assert_eq!(
        CLIPTOWN_LIB_REVISION,
        "eafe227afad95b75673c3e9b704cf9cc3bc2ee9d"
    );
    assert_eq!(Operation::Read.required_scope(), MEMEBANK_READ_SCOPE);
    assert_eq!(Operation::Write.required_scope(), MEMEBANK_WRITE_SCOPE);
    assert!(!Operation::Read.requires_recent_loa2());
    assert!(Operation::Write.requires_recent_loa2());
}

#[test]
fn shared_delegation_policy_is_used_instead_of_client_local_copies() {
    let mut read = claims(MEMEBANK_READ_SCOPE);
    read.assurance_level = 1;
    read.assurance_context = None;
    read.authentication_methods = &["password"];
    read.authenticated_at_unix_seconds = None;
    let authorized = authorize_delegated_operation(read, Operation::Read, policy()).unwrap();
    assert_eq!(authorized.subject, "00000000-0000-4000-8000-000000000001");
    assert_eq!(authorized.scope, MEMEBANK_READ_SCOPE);

    let mut stale_write = claims(MEMEBANK_WRITE_SCOPE);
    stale_write.authenticated_at_unix_seconds = Some(NOW - 1_000);
    assert_eq!(
        authorize_delegated_operation(stale_write, Operation::Write, policy()),
        Err(DelegationError::AssuranceRequired)
    );
}

#[test]
fn shared_idempotency_policy_replays_exact_requests_and_rejects_mismatch() {
    let binding = IdempotencyBinding {
        subject: "00000000-0000-4000-8000-000000000001",
        key: "create-request-0001",
        operation: IdempotentOperation::Create,
        normalized_route: "/v1/integrations/memebank/transfers",
        request_digest: SHA256_A,
        expires_at_unix_seconds: NOW + 300,
    };

    assert_eq!(
        evaluate_idempotency(
            NOW,
            Some(binding),
            binding.subject,
            binding.key,
            binding.operation,
            binding.normalized_route,
            binding.request_digest,
        ),
        Ok(IdempotencyDecision::Replay)
    );
    assert_eq!(
        evaluate_idempotency(
            NOW,
            Some(binding),
            binding.subject,
            binding.key,
            binding.operation,
            binding.normalized_route,
            SHA256_B,
        ),
        Err(IdempotencyError::Conflict)
    );
}
