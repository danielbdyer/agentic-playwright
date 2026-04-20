/**
 * Drift check — fails the build when the on-disk manifest at
 * `product/manifest/manifest.json` disagrees with the set of
 * declared verbs in a non-additive way.
 *
 * Usage: `npx tsx product/build/emitter/drift-check.ts`
 *
 * Runs at prebuild. Exit code 0 → no drift (or only additive drift
 * when `--allow-additive` is passed). Exit code 1 → drift detected.
 *
 * Additive drift (new verbs in code that aren't in the on-disk
 * manifest yet) is tolerated during development — the next
 * `emit-manifest` run catches up. Non-additive drift (a declared
 * verb's signature changed, a verb was removed, a verb's category
 * moved) fails the build so the manifest update is a deliberate
 * gesture rather than a silent regeneration.
 *
 * See `docs/v2-direction.md §6 Step 2` for the policy.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildManifest } from '../../domain/manifest/manifest';
import type { Manifest } from '../../domain/manifest/manifest';
import type { VerbEntry } from '../../domain/manifest/verb-entry';
import { readRegisteredVerbs } from '../../domain/manifest/declare-verb';
// Side-effect import: registers every declared verb.
import '../../manifest/declarations';

const MANIFEST_PATH = path.resolve(process.cwd(), 'product', 'manifest', 'manifest.json');

function loadOnDiskManifest(): Manifest | null {
  if (!existsSync(MANIFEST_PATH)) return null;
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  return JSON.parse(raw) as Manifest;
}

function verbEntryKey(entry: VerbEntry): string {
  // A stable, content-sensitive key that excludes `sinceVersion`
  // and the other metadata that are allowed to shift additively.
  // Drift is detected when this key changes between on-disk and
  // in-code for the same verb `name`.
  return JSON.stringify({
    category: entry.category,
    inputs: entry.inputs,
    outputs: entry.outputs,
    errorFamilies: [...entry.errorFamilies].sort(),
    declaredIn: entry.declaredIn,
  });
}

interface DriftReport {
  readonly removed: readonly string[];
  readonly changed: readonly { readonly name: string; readonly before: string; readonly after: string }[];
  readonly added: readonly string[];
}

function diff(before: Manifest | null, after: Manifest): DriftReport {
  if (before === null) {
    return {
      removed: [],
      changed: [],
      added: after.verbs.map((v) => v.name),
    };
  }
  const beforeByName = new Map(before.verbs.map((v) => [v.name, v]));
  const afterByName = new Map(after.verbs.map((v) => [v.name, v]));

  const removed: string[] = [];
  const changed: { readonly name: string; readonly before: string; readonly after: string }[] = [];
  const added: string[] = [];

  for (const v of before.verbs) {
    if (!afterByName.has(v.name)) {
      removed.push(v.name);
    }
  }
  for (const v of after.verbs) {
    const previous = beforeByName.get(v.name);
    if (previous === undefined) {
      added.push(v.name);
      continue;
    }
    const beforeKey = verbEntryKey(previous);
    const afterKey = verbEntryKey(v);
    if (beforeKey !== afterKey) {
      changed.push({ name: v.name, before: beforeKey, after: afterKey });
    }
  }
  return { removed, changed, added };
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const allowAdditive = args.has('--allow-additive');

  const onDisk = loadOnDiskManifest();
  const inCode = buildManifest(readRegisteredVerbs(), '2026-01-01T00:00:00.000Z');
  const report = diff(onDisk, inCode);

  const hasNonAdditiveDrift = report.removed.length > 0 || report.changed.length > 0;
  const hasAdditiveDrift = report.added.length > 0;

  if (!hasNonAdditiveDrift && !hasAdditiveDrift) {
    process.stdout.write('manifest drift-check: no drift.\n');
    return;
  }

  if (hasNonAdditiveDrift) {
    process.stderr.write('manifest drift-check: non-additive drift detected.\n');
    for (const name of report.removed) {
      process.stderr.write(`  removed:  ${name}\n`);
    }
    for (const entry of report.changed) {
      process.stderr.write(`  changed:  ${entry.name}\n`);
      process.stderr.write(`    before: ${entry.before}\n`);
      process.stderr.write(`    after:  ${entry.after}\n`);
    }
    process.stderr.write(
      "\nTo resolve: re-run `npx tsx product/build/emitter/emit-manifest.ts` and commit the regenerated manifest. Non-additive drift must be a deliberate gesture, not a silent update.\n",
    );
    process.exit(1);
  }

  if (hasAdditiveDrift && !allowAdditive) {
    process.stderr.write('manifest drift-check: additive drift detected (new verbs in code not yet in manifest):\n');
    for (const name of report.added) {
      process.stderr.write(`  added: ${name}\n`);
    }
    process.stderr.write(
      '\nTo resolve: re-run `npx tsx product/build/emitter/emit-manifest.ts`. Re-run this check with --allow-additive if you want to accept additive drift during development.\n',
    );
    process.exit(1);
  }

  process.stdout.write(
    `manifest drift-check: additive drift tolerated (${report.added.length} new verb(s)).\n`,
  );
}

main();
