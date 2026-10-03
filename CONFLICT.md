# cliptown/cliptown-clients#10 — chore: nightly polyglot client hardening

head: automation/nightly-client-hardening  base: main  author: ORESoftware  updated: 2026-08-28T22:26:23Z
dir: /Users/maca5/codes/.claude-fleet/scratch/merge/cliptown_cliptown-clients__10

## conflicted files
- clients/.api-surface.sha256
- clients/api-surface.json
- clients/c/.zed-api-surface.sha256
- clients/c/.zed-client-contract.json
- clients/client-api.schema.json
- clients/contract-manifest.json
- clients/cpp/.zed-api-surface.sha256
- clients/cpp/.zed-client-contract.json
- clients/dart/.zed-api-surface.sha256
- clients/dart/.zed-client-contract.json
- clients/elixir/.zed-api-surface.sha256
- clients/elixir/.zed-client-contract.json
- clients/erlang/.zed-api-surface.sha256
- clients/erlang/.zed-client-contract.json
- clients/gleam/.zed-api-surface.sha256
- clients/gleam/.zed-client-contract.json
- clients/go/.zed-api-surface.sha256
- clients/go/.zed-client-contract.json
- clients/java/.zed-api-surface.sha256
- clients/java/.zed-client-contract.json
- clients/kotlin/.zed-api-surface.sha256
- clients/kotlin/.zed-client-contract.json
- clients/php/.zed-api-surface.sha256
- clients/php/.zed-client-contract.json
- clients/python/.zed-api-surface.sha256
- clients/python/.zed-client-contract.json
- clients/ruby/.zed-api-surface.sha256
- clients/ruby/.zed-client-contract.json
- clients/rust/.zed-api-surface.sha256
- clients/rust/.zed-client-contract.json
- clients/swift/.zed-api-surface.sha256
- clients/swift/.zed-client-contract.json
- clients/typescript/.zed-contracts/nodejs/.zed-api-surface.sha256
- clients/typescript/.zed-contracts/nodejs/.zed-client-contract.json
- clients/typescript/bun/.zed-api-surface.sha256
- clients/typescript/bun/.zed-client-contract.json
- clients/typescript/deno/.zed-api-surface.sha256
- clients/typescript/deno/.zed-client-contract.json
- clients/typescript/edge/.zed-api-surface.sha256
- clients/typescript/edge/.zed-client-contract.json
- clients/wasm/.zed-api-surface.sha256
- clients/wasm/.zed-client-contract.json
- clients/zig/.zed-api-surface.sha256
- clients/zig/.zed-client-contract.json

## base (main) last 8 commits
9883542 Merge pull request #16 from feat/use-lib-core-validation-v1-20260903
3ee4d2b feat(validation): consume public lib-core SDKs
1e282dc feat(DEN-42): add functional RxJS sync stream
23c5c3f Merge pull request #12 from cliptown/agent/den-3578-client-contract-20260827
ee73dd5 Merge pull request #13 from cliptown/agent/den-3578-canonical-client-schema
b1600eb DEN-3578 Adopt the canonical JSON Schema client contract.
4ef3c4a ci: enforce canonical client contract boundary (DEN-3578)
435e616 feat: enforce JSON Schema client contracts

## head (automation/nightly-client-hardening) last 8 commits
3fb1caf feat: harden canonical polyglot client contract
e0603cb chore: exclude generated Python bytecode
89b1175 ci: align the polyglot dependency matrix
bee9716 merge(DEN-3287): integrate canonical shared policy consumer
1b3e3e3 security: scope synthetic fixture allowlist
8417f88 Merge origin/main into main after client consolidation
e61c653 build(typescript): consolidate runtime entrypoints
190ed57 Merge branch 'main' of github.com:cliptown/cliptown-clients

## merge-base: e0603cb21944b96f9fa67eeb34715cf6c5612e82

## PR diff stat (merge-base..head)
 clients/python/.zed-api-surface.sha256             |   1 +
 clients/python/.zed-client-contract.json           |  10 +
 clients/ruby/.zed-api-surface.sha256               |   1 +
 clients/ruby/.zed-client-contract.json             |  10 +
 clients/rust/.zed-api-surface.sha256               |   1 +
 clients/rust/.zed-client-contract.json             |  10 +
 clients/sdk-matrix.json                            | 109 ++++
 clients/swift/.zed-api-surface.sha256              |   1 +
 clients/swift/.zed-client-contract.json            |  10 +
 .../.zed-contracts/nodejs/.zed-api-surface.sha256  |   1 +
 .../nodejs/.zed-client-contract.json               |  10 +
 clients/typescript/bun/.zed-api-surface.sha256     |   1 +
 clients/typescript/bun/.zed-client-contract.json   |  10 +
 clients/typescript/bun/package.json                |   6 +
 clients/typescript/bun/src/index.ts                |   8 +
 clients/typescript/deno/.zed-api-surface.sha256    |   1 +
 clients/typescript/deno/.zed-client-contract.json  |  10 +
 clients/typescript/deno/deno.json                  |   5 +
 clients/typescript/deno/mod.ts                     |   8 +
 clients/typescript/edge/.zed-api-surface.sha256    |   1 +
 clients/typescript/edge/.zed-client-contract.json  |  10 +
 clients/typescript/edge/package.json               |   6 +
 clients/typescript/edge/src/index.ts               |   8 +
 clients/wasm/.zed-api-surface.sha256               |   1 +
 clients/wasm/.zed-client-contract.json             |  10 +
 clients/wasm/Cargo.toml                            |   6 +
 clients/wasm/src/lib.rs                            |   6 +
 clients/zig/.zed-api-surface.sha256                |   1 +
 clients/zig/.zed-client-contract.json              |  10 +
 55 files changed, 1777 insertions(+), 5 deletions(-)

## base diff stat (merge-base..base)
 clients/typescript/src/index.ts                    |    1 +
 clients/typescript/src/reactive-sync.ts            |  415 ++++++
 clients/typescript/test/reactive-sync.test.ts      |  218 +++
 clients/wasm/.zed-api-surface.sha256               |    1 +
 clients/wasm/.zed-client-contract.json             |   10 +
 clients/wasm/Cargo.toml                            |    6 +
 clients/wasm/src/lib.rs                            |    6 +
 clients/zig/.zed-api-surface.sha256                |    1 +
 clients/zig/.zed-client-contract.json              |   10 +
 schemas/client-api.schema.json                     |  718 +++++++++
 scripts/check-validation-imports.py                |   11 +
 scripts/client_contract_boundary.py                |  123 ++
 scripts/harden_client_contract.py                  | 1573 ++++++++++++++++++++
 scripts/verify_client_contract.py                  |  284 ++++
 tests/test_client_contract_boundary.py             |   77 +
 validation-consumer/.zpkg.toml                     |   26 +
 validation-consumer/README.md                      |    5 +
 validation-consumer/gleam/gleam.toml               |    9 +
 .../gleam/src/cliptown_validation_consumer.gleam   |    4 +
 .../test/cliptown_validation_consumer_test.gleam   |   15 +
 validation-consumer/golang/consumer.go             |   12 +
 validation-consumer/golang/consumer_test.go        |   11 +
 validation-consumer/golang/go.mod                  |    7 +
 validation-consumer/rust/Cargo.toml                |   13 +
 validation-consumer/rust/src/lib.rs                |   23 +
 validation-consumer/typescript/package.json        |    9 +
 validation-consumer/typescript/src/index.ts        |   14 +
 .../typescript/test/consumer.test.ts               |   11 +
 validation-consumer/typescript/tsconfig.json       |   15 +
 91 files changed, 5788 insertions(+), 4 deletions(-)

## merge output
Auto-merging clients/.api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/.api-surface.sha256
Auto-merging clients/api-surface.json
CONFLICT (add/add): Merge conflict in clients/api-surface.json
Auto-merging clients/c/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/c/.zed-api-surface.sha256
Auto-merging clients/c/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/c/.zed-client-contract.json
Auto-merging clients/client-api.schema.json
CONFLICT (add/add): Merge conflict in clients/client-api.schema.json
Auto-merging clients/contract-manifest.json
CONFLICT (add/add): Merge conflict in clients/contract-manifest.json
Auto-merging clients/cpp/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/cpp/.zed-api-surface.sha256
Auto-merging clients/cpp/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/cpp/.zed-client-contract.json
Auto-merging clients/dart/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/dart/.zed-api-surface.sha256
Auto-merging clients/dart/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/dart/.zed-client-contract.json
Auto-merging clients/elixir/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/elixir/.zed-api-surface.sha256
Auto-merging clients/elixir/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/elixir/.zed-client-contract.json
Auto-merging clients/erlang/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/erlang/.zed-api-surface.sha256
Auto-merging clients/erlang/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/erlang/.zed-client-contract.json
Auto-merging clients/gleam/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/gleam/.zed-api-surface.sha256
Auto-merging clients/gleam/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/gleam/.zed-client-contract.json
Auto-merging clients/go/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/go/.zed-api-surface.sha256
Auto-merging clients/go/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/go/.zed-client-contract.json
Auto-merging clients/java/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/java/.zed-api-surface.sha256
Auto-merging clients/java/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/java/.zed-client-contract.json
Auto-merging clients/kotlin/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/kotlin/.zed-api-surface.sha256
Auto-merging clients/kotlin/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/kotlin/.zed-client-contract.json
Auto-merging clients/php/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/php/.zed-api-surface.sha256
Auto-merging clients/php/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/php/.zed-client-contract.json
Auto-merging clients/python/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/python/.zed-api-surface.sha256
Auto-merging clients/python/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/python/.zed-client-contract.json
Auto-merging clients/ruby/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/ruby/.zed-api-surface.sha256
Auto-merging clients/ruby/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/ruby/.zed-client-contract.json
Auto-merging clients/rust/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/rust/.zed-api-surface.sha256
Auto-merging clients/rust/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/rust/.zed-client-contract.json
Auto-merging clients/swift/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/swift/.zed-api-surface.sha256
Auto-merging clients/swift/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/swift/.zed-client-contract.json
Auto-merging clients/typescript/.zed-contracts/nodejs/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/typescript/.zed-contracts/nodejs/.zed-api-surface.sha256
Auto-merging clients/typescript/.zed-contracts/nodejs/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/typescript/.zed-contracts/nodejs/.zed-client-contract.json
Auto-merging clients/typescript/bun/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/typescript/bun/.zed-api-surface.sha256
Auto-merging clients/typescript/bun/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/typescript/bun/.zed-client-contract.json
Auto-merging clients/typescript/deno/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/typescript/deno/.zed-api-surface.sha256
Auto-merging clients/typescript/deno/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/typescript/deno/.zed-client-contract.json
Auto-merging clients/typescript/edge/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/typescript/edge/.zed-api-surface.sha256
Auto-merging clients/typescript/edge/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/typescript/edge/.zed-client-contract.json
Auto-merging clients/wasm/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/wasm/.zed-api-surface.sha256
Auto-merging clients/wasm/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/wasm/.zed-client-contract.json
Auto-merging clients/zig/.zed-api-surface.sha256
CONFLICT (add/add): Merge conflict in clients/zig/.zed-api-surface.sha256
Auto-merging clients/zig/.zed-client-contract.json
CONFLICT (add/add): Merge conflict in clients/zig/.zed-client-contract.json
Automatic merge failed; fix conflicts and then commit the result.
