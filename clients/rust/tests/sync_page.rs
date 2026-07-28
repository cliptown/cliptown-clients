use cliptown_interfaces_rust::{ClipEnvelope, SyncCursor};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct SyncPageFixture {
    items: Vec<ClipEnvelope>,
    next_cursor: SyncCursor,
    has_more: bool,
}

#[test]
fn final_page_advances_cursor_and_preserves_tombstone() {
    let source = include_str!("../../../fixtures/sync-page.json");
    let expected: serde_json::Value = serde_json::from_str(source).unwrap();
    let fixture: SyncPageFixture = serde_json::from_str(source).unwrap();

    assert!(!fixture.has_more);
    assert_eq!(fixture.next_cursor.cursor.as_deref(), Some("server-sequence:42"));
    assert_eq!(fixture.next_cursor.server_sequence, 42);
    assert_eq!(fixture.items.len(), 1);

    let tombstone = &fixture.items[0];
    tombstone.validate().unwrap();
    assert!(tombstone.deleted);
    assert!(!tombstone.pinned);
    assert!(tombstone.blind_terms.is_empty());
    assert!(tombstone.opt_in_embedding.is_none());

    assert_eq!(serde_json::to_value(fixture).unwrap(), expected);
}
