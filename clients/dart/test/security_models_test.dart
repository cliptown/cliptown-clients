import 'dart:convert';
import 'dart:io';

import 'package:cliptown_interfaces/cliptown_interfaces.dart';
import 'package:test/test.dart';

Map<String, Object?> _map(Object? value) =>
    (value! as Map<Object?, Object?>).cast<String, Object?>();

String _timestamp(DateTime value) =>
    value.toUtc().toIso8601String().replaceFirst('.000Z', 'Z');

SignalEnvelopePurpose _purposeFromWire(String value) => switch (value) {
      'account_key_transfer' => SignalEnvelopePurpose.accountKeyTransfer,
      'clip_key' => SignalEnvelopePurpose.clipKey,
      'object_key' => SignalEnvelopePurpose.objectKey,
      'device_control' => SignalEnvelopePurpose.deviceControl,
      'recovery_package' => SignalEnvelopePurpose.recoveryPackage,
      'acknowledgement' => SignalEnvelopePurpose.acknowledgement,
      'app_vault_key' => SignalEnvelopePurpose.appVaultKey,
      _ => throw FormatException('unknown Signal envelope purpose: $value'),
    };

String _purposeToWire(SignalEnvelopePurpose value) => switch (value) {
      SignalEnvelopePurpose.accountKeyTransfer => 'account_key_transfer',
      SignalEnvelopePurpose.clipKey => 'clip_key',
      SignalEnvelopePurpose.objectKey => 'object_key',
      SignalEnvelopePurpose.deviceControl => 'device_control',
      SignalEnvelopePurpose.recoveryPackage => 'recovery_package',
      SignalEnvelopePurpose.acknowledgement => 'acknowledgement',
      SignalEnvelopePurpose.appVaultKey => 'app_vault_key',
    };

void main() {
  test('security models validate and round-trip through JSON', () {
    final source = _map(
      jsonDecode(
        File('../../fixtures/security-models.json').readAsStringSync(),
      ),
    );

    final unlockJson = _map(source['local_unlock']);
    final kdfJson = _map(unlockJson['pin_kdf']);
    final unlock = LocalUnlockPolicy(
      pinEnabled: unlockJson['pin_enabled']! as bool,
      biometricEnabled: unlockJson['biometric_enabled']! as bool,
      passkeyEnabled: unlockJson['passkey_enabled']! as bool,
      pinKdf: PinKdfPolicy(
        algorithm: kdfJson['algorithm']! as String,
        memoryKib: kdfJson['memory_kib']! as int,
        iterations: kdfJson['iterations']! as int,
        parallelism: kdfJson['parallelism']! as int,
        maxAttempts: kdfJson['max_attempts']! as int,
        lockoutSeconds: kdfJson['lockout_seconds']! as int,
      ),
    );

    final envelopeJson = _map(source['signal_envelope']);
    final metadataJson = _map(envelopeJson['metadata']);
    final envelope = SignalCiphertextEnvelope(
      metadata: SignalEnvelopeMetadata(
        protocolVersion: metadataJson['protocol_version']! as int,
        envelopeId: metadataJson['envelope_id']! as String,
        accountId: metadataJson['account_id']! as String,
        senderDeviceId: metadataJson['sender_device_id']! as String,
        recipientDeviceId: metadataJson['recipient_device_id']! as String,
        sessionId: metadataJson['session_id']! as String,
        messageNumber: metadataJson['message_number']! as int,
        purpose: _purposeFromWire(metadataJson['purpose']! as String),
        createdAt: DateTime.parse(metadataJson['created_at']! as String),
        expiresAt: DateTime.parse(metadataJson['expires_at']! as String),
      ),
      ciphertext: envelopeJson['ciphertext']! as String,
    );

    final objectJson = _map(source['encrypted_object']);
    final chunks = (objectJson['chunks']! as List<Object?>)
        .map(_map)
        .map(
          (json) => EncryptedObjectChunk(
            chunkIndex: json['chunk_index']! as int,
            ciphertextLength: json['ciphertext_length']! as int,
            ciphertextSha256: json['ciphertext_sha256']! as String,
            nonce: json['nonce']! as String,
            randomizedStorageKey: json['randomized_storage_key']! as String,
          ),
        )
        .toList(growable: false);
    final wrappedKeys = (objectJson['wrapped_keys']! as List<Object?>)
        .map(_map)
        .map(
          (json) => WrappedContentKey(
            recipientDeviceId: json['recipient_device_id']! as String,
            keyId: json['key_id']! as String,
            algorithm: json['algorithm']! as String,
            nonce: json['nonce']! as String,
            wrappedKey: json['wrapped_key']! as String,
            associatedDataHash: json['associated_data_hash']! as String,
          ),
        )
        .toList(growable: false);
    final encryptedObject = EncryptedObjectManifest(
      manifestId: objectJson['manifest_id']! as String,
      objectId: objectJson['object_id']! as String,
      clipId: objectJson['clip_id']! as String,
      contentCipherVersion: objectJson['content_cipher_version']! as String,
      plaintextLength: objectJson['plaintext_length']! as int,
      ciphertextLength: objectJson['ciphertext_length']! as int,
      chunkSize: objectJson['chunk_size']! as int,
      chunks: chunks,
      wrappedKeys: wrappedKeys,
      encryptedMetadata: objectJson['encrypted_metadata']!,
      ciphertextSha256: objectJson['ciphertext_sha256']! as String,
      createdAt: DateTime.parse(objectJson['created_at']! as String),
    );

    unlock.validate();
    envelope.validate();
    encryptedObject.validate();

    final roundTripped = <String, Object?>{
      'local_unlock': <String, Object?>{
        'pin_enabled': unlock.pinEnabled,
        'biometric_enabled': unlock.biometricEnabled,
        'passkey_enabled': unlock.passkeyEnabled,
        'pin_kdf': <String, Object?>{
          'algorithm': unlock.pinKdf!.algorithm,
          'memory_kib': unlock.pinKdf!.memoryKib,
          'iterations': unlock.pinKdf!.iterations,
          'parallelism': unlock.pinKdf!.parallelism,
          'max_attempts': unlock.pinKdf!.maxAttempts,
          'lockout_seconds': unlock.pinKdf!.lockoutSeconds,
        },
      },
      'signal_envelope': <String, Object?>{
        'metadata': <String, Object?>{
          'protocol_version': envelope.metadata.protocolVersion,
          'envelope_id': envelope.metadata.envelopeId,
          'account_id': envelope.metadata.accountId,
          'sender_device_id': envelope.metadata.senderDeviceId,
          'recipient_device_id': envelope.metadata.recipientDeviceId,
          'session_id': envelope.metadata.sessionId,
          'message_number': envelope.metadata.messageNumber,
          'purpose': _purposeToWire(envelope.metadata.purpose),
          'created_at': _timestamp(envelope.metadata.createdAt),
          'expires_at': _timestamp(envelope.metadata.expiresAt),
        },
        'ciphertext': envelope.ciphertext,
      },
      'encrypted_object': <String, Object?>{
        'manifest_id': encryptedObject.manifestId,
        'object_id': encryptedObject.objectId,
        'clip_id': encryptedObject.clipId,
        'content_cipher_version': encryptedObject.contentCipherVersion,
        'plaintext_length': encryptedObject.plaintextLength,
        'ciphertext_length': encryptedObject.ciphertextLength,
        'chunk_size': encryptedObject.chunkSize,
        'chunks': encryptedObject.chunks
            .map(
              (chunk) => <String, Object?>{
                'chunk_index': chunk.chunkIndex,
                'ciphertext_length': chunk.ciphertextLength,
                'ciphertext_sha256': chunk.ciphertextSha256,
                'nonce': chunk.nonce,
                'randomized_storage_key': chunk.randomizedStorageKey,
              },
            )
            .toList(growable: false),
        'wrapped_keys': encryptedObject.wrappedKeys
            .map(
              (key) => <String, Object?>{
                'recipient_device_id': key.recipientDeviceId,
                'key_id': key.keyId,
                'algorithm': key.algorithm,
                'nonce': key.nonce,
                'wrapped_key': key.wrappedKey,
                'associated_data_hash': key.associatedDataHash,
              },
            )
            .toList(growable: false),
        'encrypted_metadata': encryptedObject.encryptedMetadata,
        'ciphertext_sha256': encryptedObject.ciphertextSha256,
        'created_at': _timestamp(encryptedObject.createdAt),
      },
    };

    expect(roundTripped, equals(source));
  });
}
