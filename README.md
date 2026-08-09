# cliptown-clients

Official transport SDKs for Rust, TypeScript, and Dart. The SDKs send and receive encrypted `ClipEnvelope` values; they do not receive plaintext encryption keys.

## Packages

- `clients/rust` — used by `cliptown-cli` and Rust services.
- `clients/typescript` — used by the Chrome extension and web tooling.
- `clients/dart` — used by the Flutter app.
- `.zpkg.toml` — publishes the complete client matrix as one `zed-pkg` package.

All write methods accept an idempotency key. Sync cursors are opaque. Peer-to-peer transports use the same signed mutation envelope as the server API so Wi-Fi/Bluetooth exchanges can later reconcile without creating duplicates.

## Canonical shared policy

The Rust client consumes `cliptown/cliptown-lib` at immutable revision
`eafe227afad95b75673c3e9b704cf9cc3bc2ee9d`. The public
`cliptown_client_rust::shared_policy` module re-exports the canonical delegated
authorization, transfer-state, and digest-bound idempotency primitives.

Transport code does not copy those policies. It remains responsible only for
bounded HTTPS requests, token-provider integration, wire models, and safe error
mapping. Signature verification, revocation-aware introspection, factor
ceremonies, databases, cloud storage, mobile app discovery, deep links, local
IPC, and clipboard fallback remain outside the SDK and shared domain crate.

The Zed graph is:

```text
cliptown-clients -> cliptown-interfaces + cliptown-lib
```

Cargo pins the exact reviewed Git commit for reproducible source consumption.
The Zed manifest retains semantic version requirements; resolver-produced lock
state must be updated by the Zed CLI after the corresponding package versions
are published. Lock data must never be synthesized by hand.

The Cargo lock was generated—not hand-edited—by the self-removing DEN-3287
workflow in run `31301089272`. That run used Rust 1.88, resolved the exact public
library revision, then passed locked metadata, Clippy with warnings denied, and
all Rust tests before committing the lock and deleting the writer workflow.
Permanent read-only CI is the promotion gate for the resulting branch head.

## Cross-language fixtures

`fixtures/security-models.json` is a ciphertext-only golden fixture for the merged device-unlock, Signal-envelope, and encrypted-object models. Rust, TypeScript, and Dart each load the same file, execute their public validators, and emit the same canonical JSON fields. The fixture contains no private keys, raw biometric material, recovery codes, plaintext clip data, or production identifiers.

`fixtures/sync-page.json` models a final synchronization page that still advances its opaque cursor while carrying an encrypted tombstone. The three client languages verify `has_more = false`, a non-null next cursor, the monotonic server sequence, and the deleted clip envelope. This prevents clients from treating final-page status as permission to discard cursor advancement or tombstones.

## Package dry runs

```sh
node scripts/package-dry-run.mjs
```

The command creates registry-independent Rust, npm, and Dart source archives under `dist/package-dry-run`, plus `SHA256SUMS` and a machine-readable package manifest. Release-only manifests replace the local interface path and the immutable `cliptown-lib` Git dependency with explicit `0.1.0` registry requirements without changing development manifests.

This is a packaging rehearsal, not publication. It does not contact crates.io, npm, pub.dev, Zed Cloud, or GitHub Releases and requires no registry credentials. Real publishing remains blocked until the corresponding interface and library packages, provenance, signing, and protected release workflow are reviewed.

CI enforces the exact shared-library revision, canonical Rust and Dart formatting, Clippy, unit and shared-policy conformance tests, TypeScript typechecking/tests, package-layout validation, and the package dry-run archive contract against the merged interface contract. Rust is pinned to 1.88 and uses the committed Cargo lock. Dart formatting is pinned to SDK 3.12.2 and runs after dependency resolution so local and hosted checks use the package's declared language version.
