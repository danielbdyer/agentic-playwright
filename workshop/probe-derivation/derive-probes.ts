/**
 * Probe derivation — walks the product manifest + fixture documents
 * and produces a `Probe[]` set.
 *
 * Per `docs/v2-direction.md §6 Step 5` and `docs/v2-substrate.md
 * §6a`, the spike produces a `ProbeDerivation` with three
 * buckets: `probes` (successfully synthesized), `uncoveredVerbs`
 * (no fixture), `unfixturableVerbs` (fixture explicitly
 * declared `syntheticInput: true`).
 *
 * Adapter-layer: reads `product/manifest/manifest.json` from
 * disk and calls into the file-backed fixture loader. The pure
 * derivation function is `deriveProbesFromInputs`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Manifest } from '../../product/domain/manifest/manifest';
import type { Probe, ProbeDerivation, ProbeFixtureDocument } from './probe-ir';
import { loadFixtureDocumentForVerb } from './fixture-loader';

/** Pure derivation: given a manifest and a map of (verb name →
 *  fixture document | null-for-unfixturable | undefined-for-missing),
 *  produce the probe derivation. */
export function deriveProbesFromInputs(input: {
  readonly manifest: Manifest;
  readonly fixtureByVerb: ReadonlyMap<string, ProbeFixtureDocument | null | undefined>;
}): ProbeDerivation {
  const probes: Probe[] = [];
  const uncoveredVerbs: string[] = [];
  const unfixturableVerbs: string[] = [];

  for (const verb of input.manifest.verbs) {
    const doc = input.fixtureByVerb.get(verb.name);
    if (doc === undefined) {
      uncoveredVerbs.push(verb.name);
      continue;
    }
    if (doc === null || doc.syntheticInput === true) {
      unfixturableVerbs.push(verb.name);
      continue;
    }
    for (const fixture of doc.fixtures) {
      probes.push({
        id: `probe:${verb.name}:${fixture.name}`,
        verb: verb.name,
        fixtureName: fixture.name,
        declaredIn: doc.declaredIn,
        expected: fixture.expected,
        input: fixture.input,
        worldSetup: fixture.worldSetup,
        exercises: fixture.exercises ?? [],
      });
    }
  }

  return {
    probes,
    uncoveredVerbs: uncoveredVerbs.sort(),
    unfixturableVerbs: unfixturableVerbs.sort(),
  };
}

/** File-backed derivation — reads the manifest and the sibling
 *  fixture YAMLs from disk. Returns both the derivation and a
 *  handle to the manifest so the caller can summarize coverage. */
export function deriveProbesFromDisk(repoRoot: string = process.cwd()): {
  readonly manifest: Manifest;
  readonly derivation: ProbeDerivation;
} {
  const manifestPath = path.resolve(repoRoot, 'product', 'manifest', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
  const fixtureByVerb = new Map<string, ProbeFixtureDocument | null | undefined>();
  for (const verb of manifest.verbs) {
    const doc = loadFixtureDocumentForVerb(repoRoot, verb.name, verb.declaredIn);
    fixtureByVerb.set(verb.name, doc ?? undefined);
  }
  return {
    manifest,
    derivation: deriveProbesFromInputs({ manifest, fixtureByVerb }),
  };
}
