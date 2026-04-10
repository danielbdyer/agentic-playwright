/**
 * Decompose hybrid canonical compounds into per-atom/per-composition
 * files under `.canonical-artifacts/`.
 *
 * Cold-start convergence plan Phase A work item 1.
 *
 * Usage:
 *   npx tsx scripts/decompose-canon.ts [--suite-root <path>]
 *
 * Defaults to `dogfood/` as the suite root. Reads the existing
 * hybrid YAML/JSON knowledge files, decomposes them via the
 * existing canon decomposers, and writes each atom and composition
 * envelope as a JSON file at the address-derived path under
 * `{suiteRoot}/.canonical-artifacts/{atoms,compositions}/{agentic,deterministic}/{class|subType}/`.
 *
 * Idempotent: re-running against an already-decomposed tree produces
 * no changes (file contents are deterministic, so a diff is empty).
 *
 * Does NOT delete the source hybrid files — that happens after the
 * equivalence law test confirms the decomposed tree is bit-equivalent.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { createProjectPaths } from '../lib/application/paths';
import { atomAddressToPath } from '../lib/domain/pipeline/atom-address';
import { compositionAddressToPath } from '../lib/domain/pipeline/composition-address';
import { stableStringify } from '../lib/domain/kernel/hash';

// ─── Decomposers ───
import { decomposeScreenElements } from '../lib/application/canon/decompose-screen-elements';
import { decomposeScreenHints } from '../lib/application/canon/decompose-screen-hints';
import { decomposeScreenPostures } from '../lib/application/canon/decompose-screen-postures';
import { decomposeScreenSurfaces } from '../lib/application/canon/decompose-screen-surfaces';
import { decomposeRouteKnowledge } from '../lib/application/canon/decompose-route-knowledge';
import { decomposePatterns } from '../lib/application/canon/decompose-patterns';
import { decomposeSnapshots } from '../lib/application/canon/decompose-snapshots';

// ─── Validators ───
import {
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSurfaceGraph,
  validatePatternDocument,
  validateRouteKnowledgeManifest,
} from '../lib/domain/validation';

import type { PhaseOutputSource } from '../lib/domain/pipeline/source';
import type { Atom } from '../lib/domain/pipeline/atom';
import type { Composition } from '../lib/domain/pipeline/composition';
import type { AtomClass } from '../lib/domain/pipeline/atom-address';
import type { CompositionSubType } from '../lib/domain/pipeline/composition-address';

// ─── CLI args ───

const args = process.argv.slice(2);
const suiteRootArg = args.indexOf('--suite-root') >= 0 ? args[args.indexOf('--suite-root') + 1] : undefined;
const suiteRoot = path.resolve(suiteRootArg ?? 'dogfood');
const rootDir = path.resolve('.');
const paths = createProjectPaths(rootDir, suiteRoot);

// ─── Producer context ───

// Fixed epoch for deterministic output — the decomposition is a
// pure derivation from the source files, so the timestamp must
// not vary between runs. Using epoch-zero signals "this artifact
// was derived, not observed at a specific time."
const DETERMINISTIC_PRODUCED_AT = '1970-01-01T00:00:00.000Z';
const source: PhaseOutputSource = 'agentic-override';

function makeProducerInput(producedBy: string) {
  return { source, producedBy, producedAt: DETERMINISTIC_PRODUCED_AT };
}

// ─── Helpers ───

function readYaml<T>(filePath: string, validate: (v: unknown) => T): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return validate(YAML.parse(raw));
}

// Track addresses we've already written in this run, so hints
// (processed second) can overwrite elements (processed first)
// within a single run, but re-runs don't re-cycle.
const writtenPaths = new Set<string>();

function writeAtom(atom: Atom<AtomClass, unknown, PhaseOutputSource>): void {
  const relPath = `atoms/agentic/${atom.class}/${atomAddressToPath(atom.address)}.json`;
  const absPath = path.join(paths.pipeline.atomsAgenticDir, '..', '..', relPath);
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = stableStringify(atom);
  // Within a single run: later decomposer (hints) overwrites earlier
  // (elements) at the same address. Across runs: skip if content
  // matches what's on disk.
  const existingOnDisk = !writtenPaths.has(absPath) && fs.existsSync(absPath)
    ? fs.readFileSync(absPath, 'utf-8')
    : null;
  if (existingOnDisk === content) return; // already correct on disk
  fs.writeFileSync(absPath, content);
  writtenPaths.add(absPath);
  console.log(`  wrote atom: ${relPath}`);
}

function writeComposition(comp: Composition<CompositionSubType, unknown, PhaseOutputSource>): void {
  const relPath = `compositions/agentic/${comp.subType}/${compositionAddressToPath(comp.address)}.json`;
  const absPath = path.join(paths.pipeline.compositionsAgenticDir, '..', '..', relPath);
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = stableStringify(comp);
  const existingOnDisk = !writtenPaths.has(absPath) && fs.existsSync(absPath)
    ? fs.readFileSync(absPath, 'utf-8')
    : null;
  if (existingOnDisk === content) return;
  fs.writeFileSync(absPath, content);
  writtenPaths.add(absPath);
  console.log(`  wrote composition: ${relPath}`);
}

// ─── Two-pass approach: collect all, deduplicate, then write ───
//
// Some atom addresses appear in multiple hybrid files (e.g., an
// element appears in both `.elements.yaml` and `.hints.yaml`).
// The hint is the enriched form that supersedes the raw element.
// Rather than depending on processing order, we collect ALL atoms
// into a Map keyed by address path. Later entries for the same
// address overwrite earlier ones ("last writer wins"). The write
// pass runs once at the end.

const atomsByPath = new Map<string, Atom<AtomClass, unknown, PhaseOutputSource>>();
const compositionsByPath = new Map<string, Composition<CompositionSubType, unknown, PhaseOutputSource>>();

function collectAtom(atom: Atom<AtomClass, unknown, PhaseOutputSource>): void {
  const relPath = `atoms/agentic/${atom.class}/${atomAddressToPath(atom.address)}.json`;
  atomsByPath.set(relPath, atom);
}

function collectComposition(comp: Composition<CompositionSubType, unknown, PhaseOutputSource>): void {
  const relPath = `compositions/agentic/${comp.subType}/${compositionAddressToPath(comp.address)}.json`;
  compositionsByPath.set(relPath, comp);
}

let totalAtoms = 0;
let totalCompositions = 0;

function decomposeScreenFiles(): void {
  const screensDir = path.join(paths.knowledgeDir, 'screens');
  if (!fs.existsSync(screensDir)) return;

  const files = fs.readdirSync(screensDir);

  // Elements
  for (const file of files.filter(f => f.endsWith('.elements.yaml'))) {
    const content = readYaml(path.join(screensDir, file), validateScreenElements);
    const atoms = decomposeScreenElements({ content, ...makeProducerInput('decompose-canon:elements:v1') });
    atoms.forEach(collectAtom);
    totalAtoms += atoms.length;
    console.log(`  ${file}: ${atoms.length} element atoms`);
  }

  // Hints
  for (const file of files.filter(f => f.endsWith('.hints.yaml'))) {
    const content = readYaml(path.join(screensDir, file), validateScreenHints);
    const atoms = decomposeScreenHints({ content, ...makeProducerInput('decompose-canon:hints:v1') });
    atoms.forEach(collectAtom);
    totalAtoms += atoms.length;
    console.log(`  ${file}: ${atoms.length} hint atoms`);
  }

  // Postures
  for (const file of files.filter(f => f.endsWith('.postures.yaml'))) {
    const content = readYaml(path.join(screensDir, file), validateScreenPostures);
    const atoms = decomposeScreenPostures({ content, ...makeProducerInput('decompose-canon:postures:v1') });
    atoms.forEach(collectAtom);
    totalAtoms += atoms.length;
    console.log(`  ${file}: ${atoms.length} posture atoms`);
  }
}

function decomposeSurfaceFiles(): void {
  const surfacesDir = paths.surfacesDir;
  if (!fs.existsSync(surfacesDir)) return;

  const files = fs.readdirSync(surfacesDir).filter(f => f.endsWith('.surface.yaml'));
  for (const file of files) {
    const content = readYaml(path.join(surfacesDir, file), validateSurfaceGraph);
    const result = decomposeScreenSurfaces({ content, ...makeProducerInput('decompose-canon:surfaces:v1') });
    result.surfaceAtoms.forEach(collectAtom);
    result.surfaceCompositions.forEach(collectComposition);
    totalAtoms += result.surfaceAtoms.length;
    totalCompositions += result.surfaceCompositions.length;
    console.log(`  ${file}: ${result.surfaceAtoms.length} surface atoms, ${result.surfaceCompositions.length} compositions`);
  }
}

function decomposePatternFiles(): void {
  const patternsDir = paths.patternsDir;
  if (!fs.existsSync(patternsDir)) return;

  const files = fs.readdirSync(patternsDir).filter(f => f.endsWith('.yaml') && !f.endsWith('.behavior.yaml'));
  for (const file of files) {
    const content = readYaml(path.join(patternsDir, file), validatePatternDocument);
    const atoms = decomposePatterns({ content, ...makeProducerInput('decompose-canon:patterns:v1') });
    atoms.forEach(collectAtom);
    totalAtoms += atoms.length;
    console.log(`  ${file}: ${atoms.length} pattern atoms`);
  }
}

function decomposeRouteFiles(): void {
  const routesDir = paths.routesDir;
  if (!fs.existsSync(routesDir)) return;

  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.routes.yaml'));
  for (const file of files) {
    const content = readYaml(path.join(routesDir, file), validateRouteKnowledgeManifest);
    const result = decomposeRouteKnowledge({ content, ...makeProducerInput('decompose-canon:routes:v1') });
    result.routeAtoms.forEach(collectAtom);
    result.variantAtoms.forEach(collectAtom);
    result.routeGraphs.forEach(collectComposition);
    totalAtoms += result.routeAtoms.length + result.variantAtoms.length;
    totalCompositions += result.routeGraphs.length;
    console.log(`  ${file}: ${result.routeAtoms.length} route atoms, ${result.variantAtoms.length} variant atoms, ${result.routeGraphs.length} graphs`);
  }
}

// ─── Main ───

console.log(`\nDecomposing canon from suite root: ${suiteRoot}\n`);

console.log('Screen files:');
decomposeScreenFiles();

console.log('\nSurface files:');
decomposeSurfaceFiles();

console.log('\nPattern files:');
decomposePatternFiles();

console.log('\nRoute files:');
decomposeRouteFiles();

// ─── Write pass: deduplicated atoms and compositions ───

let writtenCount = 0;

for (const [relPath, atom] of atomsByPath) {
  const absPath = path.join(suiteRoot, '.canonical-artifacts', relPath);
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = stableStringify(atom);
  const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : null;
  if (existing !== content) {
    fs.writeFileSync(absPath, content);
    console.log(`  wrote: ${relPath}`);
    writtenCount++;
  }
}

for (const [relPath, comp] of compositionsByPath) {
  const absPath = path.join(suiteRoot, '.canonical-artifacts', relPath);
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const content = stableStringify(comp);
  const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf-8') : null;
  if (existing !== content) {
    fs.writeFileSync(absPath, content);
    console.log(`  wrote: ${relPath}`);
    writtenCount++;
  }
}

console.log(`\nDone. ${atomsByPath.size} atoms, ${compositionsByPath.size} compositions (${writtenCount} files written, ${atomsByPath.size + compositionsByPath.size - writtenCount} unchanged).\n`);
