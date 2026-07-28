# cliptown-clients

Official transport SDKs for Rust, TypeScript, and Dart. The SDKs send and receive encrypted `ClipEnvelope` values; they do not receive plaintext encryption keys.

## Packages

- `clients/rust` — used by `cliptown-cli` and Rust services.
- `clients/typescript` — used by the Chrome extension and web tooling.
- `clients/dart` — used by the Flutter app.
- `.zpkg.toml` — publishes the three targets as one `zed-pkg` package.

All write methods accept an idempotency key. Sync cursors are opaque. Peer-to-peer transports use the same signed mutation envelope as the server API so Wi-Fi/Bluetooth exchanges can later reconcile without creating duplicates.

## Cross-language fixtures

`fixtures/security-models.json` is a ciphertext-only golden fixture for the merged device-unlock, Signal-envelope, and encrypted-object models. Rust, TypeScript, and Dart each load the same file, execute their public validators, and emit the same canonical JSON fields. The fixture contains no private keys, raw biometric material, recovery codes, plaintext clip data, or production identifiers.

`fixtures/sync-page.json` models a final synchronization page that still advances its opaque cursor while carrying an encrypted tombstone. The three client languages verify `has_more = false`, a non-null next cursor, the monotonic server sequence, and the deleted clip envelope. This prevents clients from treating final-page status as permission to discard cursor advancement or tombstones.

CI enforces canonical Rust and Dart formatting, Clippy, unit tests, TypeScript typechecking/tests, and package-layout validation against the merged interface contract. Dart formatting is pinned to SDK 3.12.2 and runs after dependency resolution so local and hosted checks use the package's declared language version.
