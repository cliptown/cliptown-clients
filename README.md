# cliptown-clients

Official transport SDKs for Rust, TypeScript, Dart, and Go. The SDKs send and receive encrypted envelopes; they do not receive plaintext encryption keys.

## Packages

- `clients/rust` — used by `cliptown-cli` and Rust services.
- `clients/typescript` — used by the Chrome extension and web tooling.
- `clients/dart` — used by the Flutter app.
- `clients/go` — used by MemeBank and other Go services for shared-auth delegated API calls.
- `.zpkg.toml` — publishes the complete client matrix as one `zed-pkg` package.

All write methods accept an idempotency key. Sync cursors are opaque. Peer-to-peer transports use the same signed mutation envelope as the server API so Wi-Fi/Bluetooth exchanges can later reconcile without creating duplicates.

## MemeBank integration

MemeBank interoperability is API-first. The Go SDK implements the versioned subject-owned transfer surface defined by `cliptown-interfaces/openapi/memebank-integration.openapi.yaml`:

- create a ciphertext-only transfer;
- list and retrieve transfers with opaque cursors;
- acknowledge import, ignore, or rejection idempotently;
- cancel a pending transfer through the scoped API.

The token provider supplies a short-lived shared-auth delegated bearer with `aud=cliptown-api`, `azp=memebank-api`, and the exact `cliptown:memebank:*` scope. The SDK does not call 3FA, accept a 3FA-specific proof, discover installed mobile apps, invoke deep links, use local IPC, share a database, or monitor the clipboard. Native copy/paste remains a separate user feature rather than the integration transport.

The Go client refuses plaintext remote HTTP and redirects carrying authorization, bounds request and response bodies, validates identifiers/versions/media types/digests/cursors/idempotency before network access, and maps status codes to deterministic errors without exposing response ciphertext.

## Canonical shared policy

The Rust client consumes `cliptown/cliptown-lib` at immutable revision
`5c68349aadc5fb44c60f365ad457b58c42ed5d27`. The public
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

The original branch was certified in hosted runs `31301089272` and
`31301299064`. This integration advances the immutable library pin to the final
semantic union and re-runs the same locked Rust, TypeScript, Dart, Go, package,
and Zed-graph checks.

## Cross-language fixtures

`fixtures/security-models.json` is a ciphertext-only golden fixture for the merged device-unlock, Signal-envelope, and encrypted-object models. Rust, TypeScript, and Dart each load the same file, execute their public validators, and emit the same canonical JSON fields. The fixture contains no private keys, raw biometric material, recovery codes, plaintext clip data, or production identifiers.

`fixtures/sync-page.json` models a final synchronization page that still advances its opaque cursor while carrying an encrypted tombstone. The Rust, TypeScript, and Dart clients verify `has_more = false`, a non-null next cursor, the monotonic server sequence, and the deleted clip envelope. This prevents clients from treating final-page status as permission to discard cursor advancement or tombstones.

## Package dry runs

```sh
node scripts/package-dry-run.mjs
```

The command creates registry-independent Rust, npm, and Dart source archives under `dist/package-dry-run`, plus `SHA256SUMS` and a machine-readable package manifest. The Go module is validated independently with `go vet` and `go test`; its zed-pkg target points at the versioned module directory. Release-only manifests replace the local interface path and immutable `cliptown-lib` Git dependency with explicit `0.1.0` registry requirements without changing development manifests.

This is a packaging rehearsal, not publication. It does not contact crates.io, npm, pub.dev, Zed Cloud, or GitHub Releases and requires no registry credentials. Real publishing remains blocked until the corresponding interface and library packages, provenance, signing, and protected release workflow are reviewed.

CI enforces the exact shared-library revision; canonical Rust, Dart, and Go formatting; Clippy and Go vet; unit and shared-policy conformance tests; TypeScript typechecking/tests; package-layout validation; and the package dry-run archive contract against the merged interface contract. Rust is pinned to 1.88 and uses the committed Cargo lock. Dart formatting is pinned to SDK 3.12.2 and runs after dependency resolution so local and hosted checks use the package's declared language version.
