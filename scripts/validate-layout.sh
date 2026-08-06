#!/usr/bin/env bash
set -euo pipefail
for path in \
  clients/rust/Cargo.toml \
  clients/typescript/package.json \
  clients/dart/pubspec.yaml \
  clients/go/go.mod \
  .zpkg.toml; do
  test -f "$path" || { echo "missing $path" >&2; exit 1; }
done

grep -Fq 'dir = "clients/go"' .zpkg.toml || {
  echo 'Go SDK is not declared as a zed-pkg target' >&2
  exit 1
}
