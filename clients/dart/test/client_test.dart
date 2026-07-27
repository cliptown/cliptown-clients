import 'package:cliptown_client/cliptown_client.dart';
import 'package:test/test.dart';

void main() {
  test('rejects insecure remote endpoints', () {
    expect(
      () => CliptownClient(
        endpoint: 'http://example.com',
        accessToken: () async => 'x',
      ),
      throwsArgumentError,
    );
  });
}
