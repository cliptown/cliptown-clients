import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'dist', 'package-dry-run');
const workspace = join(output, 'workspace');

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: {...process.env, ...options.env},
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`${command} ${args.join(' ')} failed${details ? `:\n${details}` : ''}`);
  }
  return result.stdout?.trim() ?? '';
}

function copy(path, destination) {
  if (!existsSync(path)) fail(`missing package input: ${path}`);
  mkdirSync(dirname(destination), {recursive: true});
  cpSync(path, destination, {recursive: true});
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function artifact(path, kind) {
  return {
    kind,
    file: basename(path),
    bytes: statSync(path).size,
    sha256: sha256(path),
  };
}

function match(text, expression, label) {
  const result = text.match(expression)?.[1];
  if (!result) fail(`could not read ${label}`);
  return result;
}

rmSync(output, {recursive: true, force: true});
mkdirSync(workspace, {recursive: true});

const zpkgText = readFileSync(join(root, '.zpkg.toml'), 'utf8');
const zpkgVersion = match(zpkgText, /^version = "([^"]+)"$/m, 'zed-pkg version');
for (const target of ['clients/rust', 'clients/typescript', 'clients/dart']) {
  if (!existsSync(join(root, target))) fail(`zed-pkg target is missing: ${target}`);
  if (!zpkgText.includes(`dir = "${target}"`)) fail(`zed-pkg target is not declared: ${target}`);
}

const rustSource = join(root, 'clients', 'rust');
const rustManifestText = readFileSync(join(rustSource, 'Cargo.toml'), 'utf8');
const rustName = match(rustManifestText, /^name = "([^"]+)"$/m, 'Rust package name');
const rustVersion = match(rustManifestText, /^version = "([^"]+)"$/m, 'Rust package version');
const rustReleaseManifest = rustManifestText.replace(
  /cliptown-interfaces-rust = \{ path = "[^"]+" \}/,
  'cliptown-interfaces-rust = "0.1.0"',
);
if (rustReleaseManifest === rustManifestText || /\bpath\s*=/.test(rustReleaseManifest)) {
  fail('Rust release manifest still contains a workspace-only path dependency');
}
const rustWorkspace = join(workspace, 'rust');
const rustPackageName = `${rustName}-${rustVersion}`;
const rustPackageRoot = join(rustWorkspace, rustPackageName);
copy(join(rustSource, 'src'), join(rustPackageRoot, 'src'));
copy(join(rustSource, 'tests'), join(rustPackageRoot, 'tests'));
writeFileSync(join(rustPackageRoot, 'Cargo.toml'), rustReleaseManifest);
writeFileSync(
  join(rustPackageRoot, '.cargo_vcs_info.json'),
  `${JSON.stringify({git: {sha1: process.env.GITHUB_SHA ?? null, dirty: false}, path_in_vcs: 'clients/rust'}, null, 2)}\n`,
);
const rustArchive = join(output, `${rustPackageName}.crate`);
run('tar', ['-czf', rustArchive, '-C', rustWorkspace, rustPackageName]);
run('tar', ['-tzf', rustArchive], {capture: true});

const typescriptSource = join(root, 'clients', 'typescript');
const typescriptManifest = JSON.parse(readFileSync(join(typescriptSource, 'package.json'), 'utf8'));
const typescriptVersion = typescriptManifest.version;
const typescriptName = typescriptManifest.name;
const typescriptReleaseManifest = {
  ...typescriptManifest,
  dependencies: {
    ...typescriptManifest.dependencies,
    '@cliptown/interfaces': '0.1.0',
  },
};
if (Object.values(typescriptReleaseManifest.dependencies ?? {}).some((value) => String(value).startsWith('file:'))) {
  fail('TypeScript release manifest still contains a workspace-only file dependency');
}
const typescriptWorkspace = join(workspace, 'typescript');
copy(join(typescriptSource, 'dist'), join(typescriptWorkspace, 'dist'));
writeFileSync(join(typescriptWorkspace, 'package.json'), `${JSON.stringify(typescriptReleaseManifest, null, 2)}\n`);
run('npm', ['pack', '--dry-run', '--json'], {cwd: typescriptWorkspace, capture: true});
const npmResult = JSON.parse(
  run('npm', ['pack', '--json', '--pack-destination', output], {
    cwd: typescriptWorkspace,
    capture: true,
  }),
);
const npmArchive = join(output, npmResult[0]?.filename ?? '');
if (!existsSync(npmArchive)) fail('npm pack did not produce an archive');

const dartSource = join(root, 'clients', 'dart');
const dartManifestText = readFileSync(join(dartSource, 'pubspec.yaml'), 'utf8');
const dartName = match(dartManifestText, /^name:\s*([^\s]+)$/m, 'Dart package name');
const dartVersion = match(dartManifestText, /^version:\s*([^\s]+)$/m, 'Dart package version');
const dartReleaseManifest = dartManifestText
  .replace(/^publish_to:\s*none\s*\n/m, '')
  .replace(/  cliptown_interfaces:\n    path:\s*[^\n]+\n/m, '  cliptown_interfaces: ^0.1.0\n');
if (/\n\s+path:\s*/.test(dartReleaseManifest) || /^publish_to:\s*none$/m.test(dartReleaseManifest)) {
  fail('Dart release manifest still contains a workspace-only path or disabled publication');
}
const dartWorkspace = join(workspace, 'dart');
copy(join(dartSource, 'lib'), join(dartWorkspace, 'lib'));
writeFileSync(join(dartWorkspace, 'pubspec.yaml'), dartReleaseManifest);
const dartArchive = join(output, `${dartName}-${dartVersion}.tar.gz`);
run('tar', ['-czf', dartArchive, '-C', dartWorkspace, '.']);
run('tar', ['-tzf', dartArchive], {capture: true});

const versions = new Set([zpkgVersion, rustVersion, typescriptVersion, dartVersion]);
if (versions.size !== 1) {
  fail(`package versions disagree: ${[...versions].join(', ')}`);
}

const artifacts = [
  artifact(rustArchive, 'cargo-source-archive'),
  artifact(npmArchive, 'npm-tarball'),
  artifact(dartArchive, 'dart-source-archive'),
];
const releasePlan = {
  schema_version: 1,
  version: zpkgVersion,
  publish: false,
  packages: {
    rust: {
      name: rustName,
      dependency: 'cliptown-interfaces-rust@0.1.0',
      registry_validation: 'blocked_until_interface_crate_is_published',
    },
    typescript: {name: typescriptName, dependency: '@cliptown/interfaces@0.1.0'},
    dart: {name: dartName, dependency: 'cliptown_interfaces@^0.1.0'},
    zed_pkg: {name: 'cliptown/cliptown-clients', targets: ['rust', 'nodejs', 'dart']},
  },
  artifacts,
};
writeFileSync(join(output, 'package-manifest.json'), `${JSON.stringify(releasePlan, null, 2)}\n`);
writeFileSync(
  join(output, 'SHA256SUMS'),
  `${artifacts.map((item) => `${item.sha256}  ${item.file}`).join('\n')}\n`,
);
rmSync(workspace, {recursive: true, force: true});
console.log(`package dry run produced ${artifacts.length} archives for version ${zpkgVersion}`);
