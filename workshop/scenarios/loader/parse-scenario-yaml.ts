/**
 * Scenario YAML loader — parses `*.scenario.yaml` files into
 * Scenario domain values.
 *
 * Per docs/v2-scenario-corpus-plan.md §8, the grammar is narrow and
 * documented; malformed inputs return a Result with collected
 * Issues rather than throwing.
 *
 * Adapter-layer: uses node:fs directly. The pure parser is
 * `parseScenarioFromYamlText`.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Probe } from '../../probe-derivation/probe-ir';
import type { ProbeOutcome } from '../../probe-derivation/probe-receipt';
import type { SurfaceRole } from '../../substrate/surface-spec';
import type {
  Scenario,
  ScenarioStep,
  TopologyRef,
  WorldInheritance,
} from '../domain/scenario';
import { scenarioId, stepName } from '../domain/scenario';
import type { SubstrateAssertion } from '../domain/assertion';
import type { Invariant } from '../domain/invariant';

/** Result of a load attempt — Scenario + collected issues, or null
 *  + issues. Issues split into errors (block load) and warnings
 *  (don't block but surface for review). */
export interface LoadResult {
  readonly scenario: Scenario | null;
  readonly issues: readonly LoadIssue[];
}

export interface LoadIssue {
  readonly severity: 'error' | 'warning';
  readonly path: string;
  readonly message: string;
}

const VALID_VERBS = new Set([
  'observe',
  'interact',
  'test-compose',
  'facet-mint',
  'facet-query',
  'facet-enrich',
  'locator-health-track',
  'intent-fetch',
  'navigate',
]);

const VALID_WORLD_INHERITANCE = new Set<WorldInheritance>(['keep', 'reset', 'override']);

const VALID_ASSERTION_KINDS = new Set([
  'surface-present',
  'surface-absent',
  'surface-has-value',
  'surface-is-focused',
  'surface-count',
]);

const VALID_INVARIANT_KINDS = new Set([
  'aria-alert-announces-exactly-once',
  'focus-stays-within-landmark',
  'form-state-preserved-on-navigation',
  'validation-errors-clear-on-correction',
  'cross-verb-strategy-preference',
]);

const VALID_VERDICTS = new Set([
  'trajectory-holds',
  'step-diverged',
  'invariant-violated',
  'harness-failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse YAML text → LoadResult. Pure. */
export function parseScenarioFromYamlText(yamlText: string, declaredIn: string): LoadResult {
  const issues: LoadIssue[] = [];
  let raw: unknown;
  try {
    raw = YAML.parse(yamlText);
  } catch (err) {
    issues.push({
      severity: 'error',
      path: declaredIn,
      message: `YAML parse failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { scenario: null, issues };
  }
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', path: declaredIn, message: 'root must be a mapping' });
    return { scenario: null, issues };
  }

  const id = requireString(raw, 'scenario', declaredIn, issues);
  const schemaVersion = requireNumber(raw, 'schemaVersion', declaredIn, issues);
  const description = optionalString(raw, 'description') ?? '';

  const topology = parseTopology(raw['topology'], `${declaredIn}.topology`, issues);
  const stepsRaw = raw['steps'];
  const steps = Array.isArray(stepsRaw) && stepsRaw.length > 0
    ? stepsRaw.map((s, i) => parseStep(s, `${declaredIn}.steps[${i}]`, id ?? 'unknown', issues))
    : (() => {
        issues.push({ severity: 'error', path: `${declaredIn}.steps`, message: 'steps must be a non-empty array' });
        return [] as ScenarioStep[];
      })();

  const invariantsRaw = raw['invariants'];
  const invariants = Array.isArray(invariantsRaw)
    ? invariantsRaw.flatMap((inv, i) => {
        const parsed = parseInvariant(inv, `${declaredIn}.invariants[${i}]`, issues);
        return parsed === null ? [] : [parsed];
      })
    : [];

  const expected = parseExpectation(raw['expected'], `${declaredIn}.expected`, issues);
  const clearStateBetweenSteps = optionalBoolean(raw, 'clearStateBetweenSteps') ?? false;
  const maxStepTimeoutMs = optionalNumber(raw, 'maxStepTimeoutMs') ?? 5000;

  const entropyRaw = raw['entropy'];
  const entropy = isRecord(entropyRaw) ? (entropyRaw as Scenario['entropy']) : undefined;

  // Bail if any required field is missing.
  if (id === null || schemaVersion === null || topology === null || steps.length === 0) {
    return { scenario: null, issues };
  }
  if (issues.some((i) => i.severity === 'error')) {
    return { scenario: null, issues };
  }

  const scenario: Scenario = {
    id: scenarioId(id),
    description,
    schemaVersion,
    topology,
    ...(entropy !== undefined ? { entropy } : {}),
    steps,
    invariants,
    expected,
    clearStateBetweenSteps,
    maxStepTimeoutMs,
  };
  return { scenario, issues };
}

function parseTopology(
  raw: unknown,
  loc: string,
  issues: LoadIssue[],
): TopologyRef | null {
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', path: loc, message: 'topology must be a mapping' });
    return null;
  }
  if (typeof raw['preset'] === 'string') {
    return { kind: 'preset', preset: raw['preset'] };
  }
  issues.push({ severity: 'error', path: loc, message: 'topology must declare `preset: <id>`' });
  return null;
}

function parseStep(
  raw: unknown,
  loc: string,
  scenarioIdForProbe: string,
  issues: LoadIssue[],
): ScenarioStep {
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', path: loc, message: 'step must be a mapping' });
    return placeholderStep();
  }
  const name = requireString(raw, 'name', loc, issues) ?? 'invalid';
  const probeRaw = raw['probe'];
  const probe = parseProbe(probeRaw, `${loc}.probe`, scenarioIdForProbe, name, issues);
  const expectedRaw = raw['expected'];
  const expected = parseStepExpected(expectedRaw, `${loc}.expected`, issues);
  const inheritanceRaw = optionalString(raw, 'worldInheritance') ?? 'keep';
  const worldInheritance = VALID_WORLD_INHERITANCE.has(inheritanceRaw as WorldInheritance)
    ? (inheritanceRaw as WorldInheritance)
    : (() => {
        issues.push({
          severity: 'error',
          path: `${loc}.worldInheritance`,
          message: `unknown value "${inheritanceRaw}"; must be one of keep|reset|override`,
        });
        return 'keep' as WorldInheritance;
      })();

  const preconditions = parseAssertions(raw['preconditions'], `${loc}.preconditions`, issues);
  const postconditions = parseAssertions(raw['postconditions'], `${loc}.postconditions`, issues);

  return {
    name: stepName(name),
    probe,
    expected,
    worldInheritance,
    preconditions,
    postconditions,
  };
}

function parseProbe(
  raw: unknown,
  loc: string,
  scenarioIdForProbe: string,
  stepNameValue: string,
  issues: LoadIssue[],
): Probe {
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', path: loc, message: 'probe must be a mapping' });
    return placeholderProbe(scenarioIdForProbe, stepNameValue);
  }
  const verb = requireString(raw, 'verb', loc, issues) ?? 'observe';
  if (!VALID_VERBS.has(verb)) {
    issues.push({
      severity: 'error',
      path: `${loc}.verb`,
      message: `unknown verb "${verb}"`,
    });
  }
  const input = raw['input'] ?? {};
  // The world goes through worldSetup so the existing probe-ir
  // classifier path can read it. world is optional at the step
  // level since most steps inherit from the prior step.
  const world = raw['world'];
  return {
    id: `probe:scenario:${scenarioIdForProbe}:${stepNameValue}`,
    verb,
    fixtureName: stepNameValue,
    declaredIn: loc,
    expected: { classification: 'matched', errorFamily: null }, // placeholder; step.expected is authoritative
    input,
    worldSetup: world,
    exercises: [],
  };
}

function parseStepExpected(
  raw: unknown,
  loc: string,
  issues: LoadIssue[],
): ProbeOutcome['expected'] {
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', path: loc, message: 'expected must be a mapping' });
    return { classification: 'matched', errorFamily: null };
  }
  const classification = optionalString(raw, 'classification') ?? 'matched';
  if (classification !== 'matched' && classification !== 'failed' && classification !== 'ambiguous') {
    issues.push({
      severity: 'error',
      path: `${loc}.classification`,
      message: `must be matched|failed|ambiguous, got "${classification}"`,
    });
  }
  const errorFamilyRaw = raw['error-family'];
  const errorFamily =
    errorFamilyRaw === null || errorFamilyRaw === undefined
      ? null
      : typeof errorFamilyRaw === 'string'
        ? errorFamilyRaw
        : null;
  return { classification: classification as 'matched' | 'failed' | 'ambiguous', errorFamily };
}

function parseAssertions(
  raw: unknown,
  loc: string,
  issues: LoadIssue[],
): readonly SubstrateAssertion[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    issues.push({ severity: 'error', path: loc, message: 'must be an array' });
    return [];
  }
  return raw.flatMap((a, i) => {
    const parsed = parseAssertion(a, `${loc}[${i}]`, issues);
    return parsed === null ? [] : [parsed];
  });
}

function parseAssertion(
  raw: unknown,
  loc: string,
  issues: LoadIssue[],
): SubstrateAssertion | null {
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', path: loc, message: 'assertion must be a mapping' });
    return null;
  }
  const kind = optionalString(raw, 'kind');
  if (kind === undefined || !VALID_ASSERTION_KINDS.has(kind)) {
    issues.push({
      severity: 'error',
      path: `${loc}.kind`,
      message: `unknown assertion kind "${kind}"`,
    });
    return null;
  }
  switch (kind) {
    case 'surface-present':
    case 'surface-absent':
    case 'surface-is-focused': {
      const target = parseTarget(raw['target'], `${loc}.target`, issues);
      if (target === null) return null;
      return { kind: kind as 'surface-present', target };
    }
    case 'surface-has-value': {
      const target = parseTarget(raw['target'], `${loc}.target`, issues);
      if (target === null || target.name === undefined) {
        issues.push({
          severity: 'error',
          path: `${loc}.target`,
          message: 'surface-has-value requires target.name',
        });
        return null;
      }
      const expectedValue = optionalString(raw, 'expectedValue');
      if (expectedValue === undefined) {
        issues.push({ severity: 'error', path: `${loc}.expectedValue`, message: 'required' });
        return null;
      }
      return {
        kind: 'surface-has-value',
        target: { role: target.role, name: target.name },
        expectedValue,
      };
    }
    case 'surface-count': {
      const role = optionalString(raw, 'role');
      const count = optionalNumber(raw, 'count');
      if (role === undefined || count === undefined) {
        issues.push({
          severity: 'error',
          path: loc,
          message: 'surface-count requires role + count',
        });
        return null;
      }
      return { kind: 'surface-count', role: role as SurfaceRole, count };
    }
  }
  return null;
}

function parseTarget(
  raw: unknown,
  loc: string,
  issues: LoadIssue[],
): { role: SurfaceRole; name?: string } | null {
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', path: loc, message: 'target must be a mapping' });
    return null;
  }
  const role = optionalString(raw, 'role');
  if (role === undefined) {
    issues.push({ severity: 'error', path: `${loc}.role`, message: 'required' });
    return null;
  }
  const name = optionalString(raw, 'name');
  return name === undefined ? { role: role as SurfaceRole } : { role: role as SurfaceRole, name };
}

function parseInvariant(
  raw: unknown,
  loc: string,
  issues: LoadIssue[],
): Invariant | null {
  if (!isRecord(raw)) {
    issues.push({ severity: 'error', path: loc, message: 'invariant must be a mapping' });
    return null;
  }
  const kind = optionalString(raw, 'kind');
  if (kind === undefined || !VALID_INVARIANT_KINDS.has(kind)) {
    issues.push({
      severity: 'error',
      path: `${loc}.kind`,
      message: `unknown invariant kind "${kind}"`,
    });
    return null;
  }
  // Each kind has its own required fields. The loader passes
  // through the raw fields and trusts the type. Future hardening
  // can validate each kind's shape.
  return raw as unknown as Invariant;
}

function parseExpectation(
  raw: unknown,
  loc: string,
  issues: LoadIssue[],
): Scenario['expected'] {
  if (!isRecord(raw)) {
    return { verdict: 'trajectory-holds' };
  }
  const verdict = optionalString(raw, 'verdict') ?? 'trajectory-holds';
  if (!VALID_VERDICTS.has(verdict)) {
    issues.push({
      severity: 'error',
      path: `${loc}.verdict`,
      message: `unknown verdict "${verdict}"`,
    });
    return { verdict: 'trajectory-holds' };
  }
  return { verdict: verdict as Scenario['expected']['verdict'] };
}

// ─── Helpers ───

function requireString(
  obj: Record<string, unknown>,
  key: string,
  loc: string,
  issues: LoadIssue[],
): string | null {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    issues.push({ severity: 'error', path: `${loc}.${key}`, message: 'required string' });
    return null;
  }
  return v;
}

function requireNumber(
  obj: Record<string, unknown>,
  key: string,
  loc: string,
  issues: LoadIssue[],
): number | null {
  const v = obj[key];
  if (typeof v !== 'number') {
    issues.push({ severity: 'error', path: `${loc}.${key}`, message: 'required number' });
    return null;
  }
  return v;
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function optionalNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === 'number' ? v : undefined;
}

function optionalBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const v = obj[key];
  return typeof v === 'boolean' ? v : undefined;
}

function placeholderStep(): ScenarioStep {
  return {
    name: stepName('invalid'),
    probe: placeholderProbe('invalid', 'invalid'),
    expected: { classification: 'matched', errorFamily: null },
    worldInheritance: 'keep',
    preconditions: [],
    postconditions: [],
  };
}

function placeholderProbe(scenarioIdForProbe: string, stepNameValue: string): Probe {
  return {
    id: `probe:scenario:${scenarioIdForProbe}:${stepNameValue}`,
    verb: 'observe',
    fixtureName: stepNameValue,
    declaredIn: 'invalid',
    expected: { classification: 'matched', errorFamily: null },
    input: {},
    worldSetup: undefined,
    exercises: [],
  };
}

/** Load a scenario YAML from disk by file path. Returns the parse
 *  result; on any IO error returns a single error-issue result. */
export function loadScenarioFile(filePath: string): LoadResult {
  if (!existsSync(filePath)) {
    return {
      scenario: null,
      issues: [{ severity: 'error', path: filePath, message: 'file not found' }],
    };
  }
  const text = readFileSync(filePath, 'utf-8');
  return parseScenarioFromYamlText(text, path.basename(filePath));
}
