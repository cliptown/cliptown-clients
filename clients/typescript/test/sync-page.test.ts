import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {
  validateClipEnvelope,
  type ClipEnvelope,
  type SyncCursor,
} from '@cliptown/interfaces';

interface SyncPageFixture {
  items: ClipEnvelope[];
  next_cursor: SyncCursor;
  has_more: boolean;
}

test('final page advances cursor and preserves tombstone', () => {
  const source = JSON.parse(
    readFileSync(new URL('../../../fixtures/sync-page.json', import.meta.url), 'utf8'),
  ) as SyncPageFixture;

  assert.equal(source.has_more, false);
  assert.equal(source.next_cursor.cursor, 'server-sequence:42');
  assert.equal(source.next_cursor.server_sequence, 42);
  assert.equal(source.items.length, 1);

  const tombstone = source.items[0];
  assert.ok(tombstone);
  validateClipEnvelope(tombstone);
  assert.equal(tombstone.deleted, true);
  assert.equal(tombstone.pinned, false);
  assert.deepEqual(tombstone.blind_terms, []);
  assert.equal(tombstone.opt_in_embedding, null);

  assert.deepEqual(JSON.parse(JSON.stringify(source)), source);
});
