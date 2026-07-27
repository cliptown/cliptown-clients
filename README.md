# cliptown-clients

Official transport SDKs for Rust, TypeScript, and Dart. The SDKs send and receive encrypted `ClipEnvelope` values; they do not receive plaintext encryption keys.

## Packages

- `clients/rust` — used by `cliptown-cli` and Rust services.
- `clients/typescript` — used by the Chrome extension and web tooling.
- `clients/dart` — used by the Flutter app.
- `.zpkg.toml` — publishes the three targets as one `zed-pkg` package.

All write methods accept an idempotency key. Sync cursors are opaque. Peer-to-peer transports use the same signed mutation envelope as the server API so Wi-Fi/Bluetooth exchanges can later reconcile without creating duplicates.
