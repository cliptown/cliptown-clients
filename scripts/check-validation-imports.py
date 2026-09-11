#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
text = "\n".join(path.read_text(errors="ignore") for path in (ROOT / "validation-consumer").rglob("*") if path.is_file())
required = ["@cliptown/cliptown-validation", "cliptown-validation", "github.com/cliptown/cliptown-lib-core/validation/golang", "cliptown_validation"]
for dependency in required:
    assert dependency in text, f"missing public lib-core import: {dependency}"
for forbidden in ("cliptown-validation-server", "golang-server", "cliptown_validation_server"):
    assert forbidden not in text, f"client imported server-only package: {forbidden}"
print("all four clients import only public lib-core validation packages")
