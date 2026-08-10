//! Canonical ClipTown authorization, transfer, and idempotency policy.
//!
//! Transport clients re-export these primitives from `cliptown-lib` rather than
//! copying product policy into each SDK. Bearer verification, HTTP, storage, and
//! factor ceremonies remain outside this module.

/// Immutable `cliptown-lib` revision consumed by this client build.
pub const CLIPTOWN_LIB_REVISION: &str = "5c68349aadc5fb44c60f365ad457b58c42ed5d27";

pub use cliptown_lib::{
    acknowledge_transfer, authorize_delegated_operation, cancel_transfer, effective_state,
    evaluate_idempotency, AcknowledgementDisposition, AuthorizedSubject, DelegatedClaims,
    DelegationError, DelegationPolicy, IdempotencyBinding, IdempotencyDecision, IdempotencyError,
    IdempotentOperation, Operation, TransferState, TransferTransitionError, CLIPTOWN_API_AUDIENCE,
    LOA2_ASSURANCE_CONTEXT, MEMEBANK_CLIENT_ID, MEMEBANK_DELETE_SCOPE, MEMEBANK_READ_SCOPE,
    MEMEBANK_WRITE_SCOPE,
};
