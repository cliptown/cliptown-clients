#!/usr/bin/env python3
from __future__ import annotations
import json
import pathlib
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[1]
REQUIRED = {
    "c": ("clients/c", "CMakeLists.txt"),
    "cpp": ("clients/cpp", "CMakeLists.txt"),
    "zig": ("clients/zig", "build.zig"),
    "nodejs": ("clients/typescript", "package.json"),
    "golang": ("clients/go", "go.mod"),
    "python": ("clients/python", "pyproject.toml"),
    "ruby": ("clients/ruby", "cliptown_client.gemspec"),
    "php": ("clients/php", "composer.json"),
    "rust": ("clients/rust", "Cargo.toml"),
    "dart": ("clients/dart", "pubspec.yaml"),
    "gleam": ("clients/gleam", "gleam.toml"),
    "erlang": ("clients/erlang", "rebar.config"),
    "elixir": ("clients/elixir", "mix.exs"),
    "java": ("clients/java", "pom.xml"),
    "kotlin": ("clients/kotlin", "pom.xml"),
    "swift": ("clients/swift", "Package.swift"),
}
with (ROOT / ".zpkg.toml").open("rb") as handle:
    manifest = tomllib.load(handle)
with (ROOT / ".zpkg.lock").open("rb") as handle:
    lock = tomllib.load(handle)
assert manifest["dependencies"] == {"cliptown/cliptown-interfaces": "^0.1.0"}
assert lock["version"] == 1
assert set(manifest["targets"]) == {"repository", *REQUIRED}
for target, (directory, sentinel) in REQUIRED.items():
    assert manifest["targets"][target]["dir"] == directory
    assert (ROOT / directory / sentinel).is_file(), (target, directory, sentinel)
package = json.loads((ROOT / "clients/typescript/package.json").read_text())
for runtime in ("nodejs", "deno", "bun", "edge"):
    assert f"./{runtime}" in package["exports"]
    assert (ROOT / "clients/typescript/src/runtimes" / f"{runtime}.ts").is_file()
print("ClipTown client matrix: 16 requested language slices and four TypeScript runtimes")
