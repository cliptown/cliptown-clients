import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {
  validateEncryptedObjectManifest,
  validateLocalUnlockPolicy,
  validateSignalEnvelope,
  type EncryptedObjectManifest,
  type LocalUnlockPolicy,
  type SignalCiphertextEnvelope,
} from '@cliptown/interfaces';

interface SecurityModelsFixture {
  local_unlock: LocalUnlockPolicy;
  signal_envelope: SignalCiphertextEnvelope;
  encrypted_object: EncryptedObjectManifest;
}

test('security models validate and round-trip through JSON', () => {
  const source = JSON.parse(
    readFileSync(
      new URL('../../../fixtures/security-models.json', import.meta.url),
      'utf8',
    ),
  ) as SecurityModelsFixture;

  validateLocalUnlockPolicy(source.local_unlock);
  validateSignalEnvelope(source.signal_envelope);
  validateEncryptedObjectManifest(source.encrypted_object);

  const roundTripped = JSON.parse(
    JSON.stringify({
      local_unlock: source.local_unlock,
      signal_envelope: source.signal_envelope,
      encrypted_object: source.encrypted_object,
    }),
  ) as SecurityModelsFixture;

  assert.deepEqual(roundTripped, source);
});
