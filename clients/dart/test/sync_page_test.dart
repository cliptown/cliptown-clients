import 'dart:convert';
import 'dart:io';

import 'package:cliptown_interfaces/cliptown_interfaces.dart';
import 'package:test/test.dart';

Map<String, Object?> _map(Object? value) =>
    (value! as Map<Object?, Object?>).cast<String, Object?>();

String _timestamp(DateTime value) =>
    value.toUtc().toIso8601String().replaceFirst('.000Z', 'Z');

void main() {
  test('final page advances cursor and preserves tombstone', () {
    final source = _map(
      jsonDecode(File('../../fixtures/sync-page.json').readAsStringSync()),
    );
    final items = source['items']! as List<Object?>;
    final tombstone = ClipEnvelope.fromJson(_map(items.single));
    final cursor = _map(source['next_cursor']);

    tombstone.validate();
    expect(source['has_more'], isFalse);
    expect(cursor['cursor'], 'server-sequence:42');
    expect(cursor['server_sequence'], 42);
    expect(tombstone.deleted, isTrue);
    expect(tombstone.pinned, isFalse);
    expect(tombstone.blindTerms, isEmpty);
    expect(tombstone.optInEmbedding, isNull);

    final roundTrippedTombstone = tombstone.toJson()
      ..['created_at'] = _timestamp(tombstone.createdAt)
      ..['updated_at'] = _timestamp(tombstone.updatedAt);
    final roundTripped = <String, Object?>{
      'items': <Object?>[roundTrippedTombstone],
      'next_cursor': <String, Object?>{
        'cursor': cursor['cursor'],
        'server_sequence': cursor['server_sequence'],
      },
      'has_more': source['has_more'],
    };

    expect(roundTripped, equals(source));
  });
}
