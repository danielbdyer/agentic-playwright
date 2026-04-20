/**
 * Manifest emitter — run at build time to regenerate
 * `product/manifest/manifest.json` from the declared verbs.
 *
 * Usage: `npx tsx product/build/emitter/emit-manifest.ts [--dry-run]`
 *
 * With no arguments: writes the manifest to the canonical path.
 * With `--dry-run`: computes the would-be manifest and prints the
 * path + verb count but does not write. Used by CI to verify the
 * emitter works even when no drift is expected.
 *
 * Import side effect: pulling `../../manifest/declarations` causes
 * every `declareVerb(...)` call in that module to register into the
 * verb registry. The emitter then reads the registry and writes
 * the manifest.
 *
 * Adapter-layer: this is build tooling, not runtime code. It uses
 * `node:fs` and `process.cwd()` directly; it is not an Effect
 * program.
 */

import { writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { buildManifest } from '../../domain/manifest/manifest';
import { readRegisteredVerbs } from '../../domain/manifest/declare-verb';
// Side-effect import: registers every declared verb.
import '../../manifest/declarations';

const MANIFEST_PATH = path.resolve(process.cwd(), 'product', 'manifest', 'manifest.json');

function renderManifest(generatedAt: string): string {
  const manifest = buildManifest(readRegisteredVerbs(), generatedAt);
  return JSON.stringify(manifest, null, 2) + '\n';
}

function writeAtomic(filePath: string, contents: string): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  writeFileSync(tmpPath, contents, 'utf-8');
  renameSync(tmpPath, filePath);
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  // Use a stable marker for the `generatedAt` field when --dry-run
  // is set so repeated calls produce identical output. Production
  // emission uses the current timestamp.
  const generatedAt = dryRun ? '2026-01-01T00:00:00.000Z' : new Date().toISOString();
  const contents = renderManifest(generatedAt);

  if (dryRun) {
    const count = readRegisteredVerbs().length;
    process.stdout.write(
      `emit-manifest --dry-run: would write ${count} verbs to ${path.relative(process.cwd(), MANIFEST_PATH)}\n`,
    );
    return;
  }

  writeAtomic(MANIFEST_PATH, contents);
  process.stdout.write(
    `emit-manifest: wrote ${readRegisteredVerbs().length} verbs to ${path.relative(process.cwd(), MANIFEST_PATH)}\n`,
  );
}

main();
