//! Canonical ClipTown authorization, transfer, and idempotency policy.
//!
//! Transport clients re-export these primitives from `cliptown-lib` rather than
//! copying product policy into each SDK. Bearer verification, HTTP, storage, and
//! factor ceremonies remain outside this module.

/// Immutable `cliptown-lib` revision consumed by this client build.
pub const CLIPTOWN_LIB_REVISION: &str = "eafe227afad95b75673c3e9b704cf9cc3bc2ee9d";

pub use cliptown_lib::{
    acknowledge_transfer, authorize_delegated_operation, cancel_transfer, effective_state,
    evaluate_idempotency, AcknowledgementDisposition, AuthorizedSubject, DelegatedClaims,
    DelegationError, DelegationPolicy, IdempotencyBinding, IdempotencyDecision, IdempotencyError,
    IdempotentOperation, Operation, TransferState, TransferTransitionError, CLIPTOWN_API_AUDIENCE,
    LOA2_ASSURANCE_CONTEXT, MEMEBANK_CLIENT_ID, MEMEBANK_DELETE_SCOPE, MEMEBANK_READ_SCOPE,
    MEMEBANK_WRITE_SCOPE,
};
