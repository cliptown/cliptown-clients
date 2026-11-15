# AttoLang source-only ClipTown client boundary

This target introduces native `.atto` source and a contract-backed Zed SDK target. **It is not a production network SDK.** Current AttoLang compiler capabilities do not prove async HTTP, bearer-token handling, encryption, or peer transport on this target.

The four pure predicates in `src/cliptown.atto` support local preflight for UTF-8 `.atto` source and opaque cursor byte counts. A caller must check **both** nonnegative and upper-bound predicates; values above 1 MiB for source or 4 KiB for cursors must fail before processing. Byte counts are measured on encoded UTF-8 bytes, not characters.

Do not send plaintext clipboard content, source code, source-derived identifiers, private encryption keys, bearer tokens or application-vault data through this module. The established server API continues to accept ciphertext-only envelopes through supported transport SDKs.

The Atto source is a small, reviewable *syntax candidate*: CI runs structural tests and verifies its source SHA-256, API surface markers, and target registry. Runtime execution against pinned Atto compiler backends, Zed target recognition and complete transport conformance are still required before this is promoted from draft.
