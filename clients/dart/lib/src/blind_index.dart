import 'dart:convert';

import 'package:crypto/crypto.dart';

List<String> blindTerms(List<int> searchKey, String plaintext) {
  final List<String> words =
      plaintext
          .toLowerCase()
          .split(RegExp(r'[^\p{L}\p{N}]+', unicode: true))
          .where((String word) => word.length >= 2)
          .toSet()
          .toList()
        ..sort();
  final Hmac hmac = Hmac(sha256, searchKey);
  return words
      .take(256)
      .map((String word) => hmac.convert(utf8.encode(word)).toString())
      .toList(growable: false);
}
