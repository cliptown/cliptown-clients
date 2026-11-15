import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const at = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const parse = (name) => JSON.parse(at(name));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const source = at("clients/atto/src/cliptown.atto");
const manifest = parse("clients/contract-manifest.json");
const sdkMatrix = parse("clients/sdk-matrix.json");
const clientMatrix = parse("clients/client-contract-matrix.json");
const marker = parse("clients/atto/.zed-client-contract.json");
const fingerprint = at("clients/.api-surface.sha256").trim();
const entry = manifest.targets.find((item) => item.target === "atto");

test("Atto SDK target is explicitly represented in every contract registry", () => {
  assert.equal(manifest.targetCount, manifest.targets.length);
  assert.equal(manifest.targets.filter((item) => item.target === "atto").length, 1);
  assert.deepEqual(sdkMatrix.targets.atto, {
    dir: "clients/atto", runtime: "atto", zed_target: "atto",
  });
  assert.deepEqual(clientMatrix.targets.atto, sdkMatrix.targets.atto);
  assert.equal(sdkMatrix.standard_target_count, 21);
  assert.match(at(".zpkg.toml"), /\[targets\.atto\]\s+dir = "clients\/atto"\s+adapter = "none"/);
  assert.match(at("clients/sdk-matrix.toml"), /^atto = true$/m);
  assert.equal(entry.dir, "clients/atto");
  assert.equal(entry.runtime, "atto");
  assert.equal(entry.zedTarget, "atto");
});

test("Atto .atto implementation has a cryptographic source receipt", () => {
  assert.equal(entry.implementationFileCount, 1);
  const records = [{ path: "src/cliptown.atto", sha256: sha(source) }];
  assert.equal(entry.implementationSha256, sha(JSON.stringify(records)));
  assert.equal(entry.apiSurfaceSha256, fingerprint);
  assert.equal(marker.apiSurfaceSha256, fingerprint);
  assert.equal(at("clients/atto/.zed-api-surface.sha256").trim(), fingerprint);
  assert.deepEqual(marker, {
    schemaVersion: 1, coordinate: "cliptown/cliptown-clients",
    target: "atto", zedTarget: "atto", runtime: "atto",
    apiSurface: "clients/api-surface.json",
    apiSurfaceSha256: fingerprint,
    schemaId: "https://zpkg.tech/schemas/client-api.schema.json",
  });
  assert.notEqual(sha(source + "\n"), sha(source), "source mutation changes the receipt");
});

test(".atto SDK stage supplies pure and explicit size guards, not hidden transport", () => {
  assert.match(source, /fnc nonnegative_payload_bytes\(int byte_length\) -> bool/);
  assert.match(source, /return byte_length >= 0;/);
  assert.match(source, /fnc payload_bytes_within_limit\(int byte_length\) -> bool/);
  assert.match(source, /return byte_length <= 1048576;/);
  assert.match(source, /fnc nonnegative_cursor_bytes\(int byte_length\) -> bool/);
  assert.match(source, /fnc cursor_bytes_within_limit\(int byte_length\) -> bool/);
  assert.match(source, /return byte_length <= 4096;/);
  assert.doesNotMatch(source, /\b(?:fetch|socket|send_http|http_request|private_key)\s*\(/i);
});
