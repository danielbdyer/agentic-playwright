/**
 * Fixture-spec loader — reads per-verb fixture YAMLs declared
 * under `<verb>.probe.yaml` and parses them into the `ProbeIR`
 * shape.
 *
 * Per `docs/v2-readiness.md §4.3`, fixtures live next to their
 * verb declaration. The manifest entry's `declaredIn` field points
 * at the declaration module; the loader looks for a sibling file
 * named `<base>.probe.yaml` where `<base>` is the declaration
 * file's basename without extension.
 *
 * Adapter-layer: uses `node:fs` directly. The pure parser is
 * `parseFixtureDocument`.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ProbeFixtureDocument } from './probe-ir';

/** Parse a YAML text blob into a `ProbeFixtureDocument`. Pure.
 *  Validates the shape and throws on grammar violations. */
export function parseFixtureDocument(
  yamlText: string,
  declaredIn: string,
): ProbeFixtureDocument {
  const raw = YAML.parse(yamlText) as unknown;
  if (!isRecord(raw)) {
    throw new Error(`${declaredIn}: fixture document must be a YAML mapping at the root.`);
  }
  const verb = requireString(raw, 'verb', declaredIn);
  const schemaVersion = requireNumber(raw, 'schemaVersion', declaredIn);
  const syntheticInput = optionalBoolean(raw, 'syntheticInput', declaredIn);

  const fixturesRaw = raw['fixtures'];
  if (!Array.isArray(fixturesRaw) || fixturesRaw.length === 0) {
    if (syntheticInput === true) {
      return { verb, schemaVersion, fixtures: [], syntheticInput, declaredIn };
    }
    throw new Error(`${declaredIn}: fixtures[] must be a non-empty array (or declare syntheticInput: true).`);
  }

  const fixtures = fixturesRaw.map((f, i) => parseFixture(f, `${declaredIn} fixtures[${i}]`));
  return {
    verb,
    schemaVersion,
    fixtures,
    ...(syntheticInput === undefined ? {} : { syntheticInput }),
    declaredIn,
  };
}

function parseFixture(raw: unknown, where: string): ProbeFixtureDocument['fixtures'][number] {
  if (!isRecord(raw)) {
    throw new Error(`${where}: fixture must be a mapping.`);
  }
  const name = requireString(raw, 'name', where);
  const description = requireString(raw, 'description', where);
  const input = raw['input'];
  if (input === undefined) {
    throw new Error(`${where}: input is required.`);
  }
  const worldSetup = readWorldSection(raw);
  const expectedRaw = raw['expected'];
  if (!isRecord(expectedRaw)) {
    throw new Error(`${where}: expected must be a mapping.`);
  }
  const classification = requireString(expectedRaw, 'classification', `${where}.expected`);
  if (classification !== 'matched' && classification !== 'failed' && classification !== 'ambiguous') {
    throw new Error(`${where}.expected.classification: must be matched|failed|ambiguous, got "${classification}".`);
  }
  const errorFamilyRaw = expectedRaw['error-family'];
  const errorFamily =
    errorFamilyRaw === null || errorFamilyRaw === undefined
      ? null
      : typeof errorFamilyRaw === 'string'
        ? errorFamilyRaw
        : (() => {
            throw new Error(`${where}.expected.error-family: must be string or null.`);
          })();

  const exercisesRaw = raw['exercises'];
  const exercises = Array.isArray(exercisesRaw)
    ? exercisesRaw.map((e, i) => parseExercise(e, `${where}.exercises[${i}]`))
    : undefined;

  return {
    name,
    description,
    input,
    ...(worldSetup === undefined ? {} : { worldSetup }),
    expected: { classification, errorFamily },
    ...(exercises === undefined ? {} : { exercises }),
  };
}

function parseExercise(raw: unknown, where: string): { readonly locatorRung?: string; readonly errorFamily?: string | null } {
  if (!isRecord(raw)) {
    throw new Error(`${where}: exercise must be a mapping.`);
  }
  // Accept both `locator-rung` (canonical) and `rung` (legacy
  // alias for backward-compat with existing fixtures). The
  // domain field is `locatorRung`; YAML-side stays kebab-case.
  const locatorRungRaw =
    raw['locator-rung'] ?? raw['rung'];
  const locatorRung =
    typeof locatorRungRaw === 'string' ? locatorRungRaw : undefined;
  const errorFamilyRaw = raw['error-family'];
  const errorFamily =
    errorFamilyRaw === null
      ? null
      : typeof errorFamilyRaw === 'string'
        ? errorFamilyRaw
        : undefined;
  return {
    ...(locatorRung === undefined ? {} : { locatorRung }),
    ...(errorFamily === undefined ? {} : { errorFamily }),
  };
}

// ─── Helpers ───

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract the world section from a fixture entry.
 *
 *  Three recognized shapes (first-principles revision):
 *
 *    { world: { ... } }           — first-principles form (preferred).
 *                                   Top-level; carries surfaces /
 *                                   catalog / upstream sub-objects
 *                                   depending on the verb's substrate.
 *    { world-setup: { ... } }     — legacy hook-dictionary form.
 *                                   Still read for backwards-compat
 *                                   during migration.
 *    { input: { world-setup: {} }}  — legacy nested form.
 *
 *  The loader returns whichever is present; `world` wins over both
 *  legacy forms when multiple are declared. */
function readWorldSection(raw: Record<string, unknown>): unknown {
  if (raw['world'] !== undefined) return raw['world'];
  if (raw['world-setup'] !== undefined) return raw['world-setup'];
  const input = raw['input'];
  if (isRecord(input) && isRecord(input['world-setup'])) return input['world-setup'];
  return undefined;
}

function requireString(obj: Record<string, unknown>, key: string, where: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`${where}: "${key}" is required and must be a non-empty string.`);
  }
  return v;
}

function requireNumber(obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key];
  if (typeof v !== 'number') {
    throw new Error(`${where}: "${key}" is required and must be a number.`);
  }
  return v;
}

function optionalBoolean(obj: Record<string, unknown>, key: string, where: string): boolean | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') {
    throw new Error(`${where}: "${key}" must be a boolean when present.`);
  }
  return v;
}

/** Look up and parse the fixture file sibling to a verb's declaration.
 *  The fixture filename is `<verb-name>.probe.yaml` per
 *  `docs/v2-readiness.md §4.3`; it lives in the same directory as
 *  the verb's `declaredIn` module. Returns `null` when no sibling
 *  file exists. */
export function loadFixtureDocumentForVerb(
  repoRoot: string,
  verbName: string,
  declaredInPath: string,
): ProbeFixtureDocument | null {
  const abs = path.resolve(repoRoot, declaredInPath);
  const dir = path.dirname(abs);
  const yamlPath = path.join(dir, `${verbName}.probe.yaml`);
  if (!existsSync(yamlPath)) return null;
  const yamlText = readFileSync(yamlPath, 'utf-8');
  return parseFixtureDocument(yamlText, path.relative(repoRoot, yamlPath).replace(/\\/g, '/'));
}
