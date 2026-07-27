import 'dart:convert';

import 'package:cliptown_interfaces/cliptown_interfaces.dart';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

typedef AccessTokenProvider = Future<String> Function();

class ClipPage {
  const ClipPage({required this.items, required this.nextCursor});
  final List<ClipEnvelope> items;
  final String? nextCursor;

  factory ClipPage.fromJson(Map<String, Object?> json) => ClipPage(
    items: (json['items']! as List<Object?>)
        .map(
          (Object? item) =>
              ClipEnvelope.fromJson(item! as Map<String, Object?>),
        )
        .toList(growable: false),
    nextCursor: json['next_cursor'] as String?,
  );
}

class CliptownClient {
  CliptownClient({
    required String endpoint,
    required this.accessToken,
    http.Client? httpClient,
  }) : endpoint = endpoint.replaceFirst(RegExp(r'/$'), ''),
       httpClient = httpClient ?? http.Client() {
    final Uri uri = Uri.parse(this.endpoint);
    final bool local = uri.host == 'localhost' || uri.host == '127.0.0.1';
    if (uri.scheme != 'https' && !(local && uri.scheme == 'http')) {
      throw ArgumentError('endpoint must use HTTPS outside localhost');
    }
  }

  final String endpoint;
  final AccessTokenProvider accessToken;
  final http.Client httpClient;

  Future<ClipPage> listClips({String? cursor, int limit = 100}) async {
    _validateLimit(limit, 500);
    final Uri uri = Uri.parse('$endpoint/v1/clips').replace(
      queryParameters: <String, String>{
        'limit': '$limit',
        if (cursor != null) 'cursor': cursor,
      },
    );
    return ClipPage.fromJson(
      await _decode(await httpClient.get(uri, headers: await _headers())),
    );
  }

  Future<ClipEnvelope> putClip(
    ClipEnvelope clip, {
    String? idempotencyKey,
  }) async {
    clip.validate();
    final Map<String, String> headers = await _headers(json: true);
    final String key = idempotencyKey ?? _newIdempotencyKey();
    if (key.length < 16 || key.length > 128) {
      throw ArgumentError(
        'idempotency key must contain from 16 through 128 characters',
      );
    }
    headers['idempotency-key'] = key;
    final Map<String, Object?> body = await _decode(
      await httpClient.put(
        Uri.parse('$endpoint/v1/clips/${Uri.encodeComponent(clip.clipId)}'),
        headers: headers,
        body: jsonEncode(clip.toJson()),
      ),
    );
    return ClipEnvelope.fromJson(body);
  }

  Future<void> deleteClip(String clipId) async {
    await _decode(
      await httpClient.delete(
        Uri.parse('$endpoint/v1/clips/${Uri.encodeComponent(clipId)}'),
        headers: await _headers(),
      ),
      allowEmpty: true,
    );
  }

  Future<ClipPage> search(Map<String, Object?> request) async {
    _validateSearchRequest(request);
    return ClipPage.fromJson(
      await _decode(
        await httpClient.post(
          Uri.parse('$endpoint/v1/search'),
          headers: await _headers(json: true),
          body: jsonEncode(request),
        ),
      ),
    );
  }

  Future<Map<String, Object?>> push(
    List<ClipEnvelope> mutations, {
    String? cursor,
  }) async {
    if (mutations.length > 500)
      throw ArgumentError('a sync push may contain at most 500 mutations');
    for (final ClipEnvelope clip in mutations) {
      clip.validate();
    }
    return _decode(
      await httpClient.post(
        Uri.parse('$endpoint/v1/sync/push'),
        headers: await _headers(json: true),
        body: jsonEncode(<String, Object?>{
          'mutations': mutations
              .map((ClipEnvelope clip) => clip.toJson())
              .toList(growable: false),
          'cursor': cursor,
        }),
      ),
    );
  }

  Future<Map<String, Object?>> pull({String? cursor, int limit = 100}) async {
    _validateLimit(limit, 500);
    return _decode(
      await httpClient.post(
        Uri.parse('$endpoint/v1/sync/pull'),
        headers: await _headers(json: true),
        body: jsonEncode(<String, Object?>{'cursor': cursor, 'limit': limit}),
      ),
    );
  }

  Future<Map<String, String>> _headers({bool json = false}) async =>
      <String, String>{
        'accept': 'application/json',
        'authorization': 'Bearer ${await accessToken()}',
        if (json) 'content-type': 'application/json',
      };

  Map<String, Object?> _decode(
    http.Response response, {
    bool allowEmpty = false,
  }) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('ClipTown API ${response.statusCode}: ${response.body}');
    }
    if (response.body.isEmpty) {
      if (allowEmpty) return <String, Object?>{};
      throw const FormatException('ClipTown API returned an empty response');
    }
    return (jsonDecode(response.body) as Map<Object?, Object?>)
        .cast<String, Object?>();
  }

  static void _validateLimit(int limit, int maximum) {
    if (limit < 1 || limit > maximum) {
      throw RangeError.range(limit, 1, maximum, 'limit');
    }
  }

  static const Uuid _uuid = Uuid();

  static String _newIdempotencyKey() => _uuid.v7();

  static void _validateSearchRequest(Map<String, Object?> request) {
    final String mode = request['privacy_mode'] as String? ?? '';
    final List<Object?> blindTerms =
        request['blind_terms'] as List<Object?>? ?? const <Object?>[];
    final List<Object?>? embedding =
        request['query_embedding'] as List<Object?>?;
    final Object? rawLimit = request['limit'];
    if (rawLimit != null) {
      if (rawLimit is! int)
        throw ArgumentError('search limit must be an integer');
      _validateLimit(rawLimit, 100);
    }
    if (mode == 'local_only' && (blindTerms.isNotEmpty || embedding != null)) {
      throw ArgumentError('local_only search cannot send search artifacts');
    }
    if (mode == 'blind_index') {
      if (blindTerms.isEmpty || blindTerms.length > 64) {
        throw ArgumentError(
          'blind_index search requires from 1 through 64 blind terms',
        );
      }
      if (blindTerms.any(
        (Object? term) =>
            term is! String || term.length < 16 || term.length > 128,
      )) {
        throw ArgumentError(
          'blind search terms must contain from 16 through 128 characters',
        );
      }
    }
    if (mode == 'opt_in_vector') {
      if (embedding == null || embedding.length != 1536) {
        throw ArgumentError(
          'opt_in_vector search requires exactly 1536 embedding values',
        );
      }
      if (embedding.any((Object? value) => value is! num || !value.isFinite)) {
        throw ArgumentError('query embedding values must be finite numbers');
      }
    }
    if (!const <String>{
      'local_only',
      'blind_index',
      'opt_in_vector',
    }.contains(mode)) {
      throw ArgumentError('unknown search privacy mode');
    }
  }
}
