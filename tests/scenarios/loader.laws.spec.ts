/**
 * Scenario YAML loader — laws.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.2:
 *   SC7  — round-trip: a known-good YAML loads cleanly + key fields match.
 *   SC8  — malformed inputs return null + collected issues; no throws.
 *   SC9  — missing required fields → error issues + null scenario.
 *   SC10 — unknown grammar fields are tolerated (forward compat).
 */

import { describe, test, expect } from 'vitest';
import { parseScenarioFromYamlText } from '../../workshop/scenarios/loader/parse-scenario-yaml';

const HAPPY_YAML = `
scenario: form-success-recovery
schemaVersion: 1
description: |
  Test trajectory with substrate state evolution.
topology:
  preset: login-form
entropy:
  seed: form-success-recovery-v1
  wrapperDepth: [1, 2]
clearStateBetweenSteps: false
maxStepTimeoutMs: 5000
steps:
  - name: initial-observe-submit
    probe:
      verb: observe
      input:
        target: { role: button, name: "Submit" }
    expected:
      classification: matched
      error-family: null
  - name: submit-empty-reveals-error
    probe:
      verb: interact
      input:
        action: click
        target: { role: button, name: "Submit" }
    expected:
      classification: matched
      error-family: null
    postconditions:
      - kind: surface-present
        target: { role: alert, name: "Please complete required fields" }
invariants:
  - kind: aria-alert-announces-exactly-once
    target: { role: alert, name: "Please complete required fields" }
expected:
  verdict: trajectory-holds
`;

describe('Scenario loader — laws', () => {
  test('SC7: happy-path scenario parses with no errors', () => {
    const { scenario, issues } = parseScenarioFromYamlText(HAPPY_YAML, 'happy.yaml');
    expect(scenario).not.toBeNull();
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(scenario!.id).toBe('form-success-recovery');
    expect(scenario!.schemaVersion).toBe(1);
    expect(scenario!.topology).toEqual({ kind: 'preset', preset: 'login-form' });
    expect(scenario!.steps).toHaveLength(2);
    expect(scenario!.invariants).toHaveLength(1);
    expect(scenario!.expected.verdict).toBe('trajectory-holds');
  });

  test('SC7.b: step shape preserved through parse', () => {
    const { scenario } = parseScenarioFromYamlText(HAPPY_YAML, 'happy.yaml');
    const step = scenario!.steps[1]!;
    expect(step.name).toBe('submit-empty-reveals-error');
    expect(step.probe.verb).toBe('interact');
    expect(step.expected.classification).toBe('matched');
    expect(step.postconditions).toHaveLength(1);
    expect(step.postconditions[0]!.kind).toBe('surface-present');
  });

  test('SC8: malformed YAML → null + error issue', () => {
    const broken = `scenario: oops\n  : invalid: yaml`;
    const { scenario, issues } = parseScenarioFromYamlText(broken, 'broken.yaml');
    expect(scenario).toBeNull();
    expect(issues.some((i) => i.severity === 'error' && /YAML parse failed/.test(i.message))).toBe(true);
  });

  test('SC9: missing scenario id → null', () => {
    const noId = `schemaVersion: 1\ntopology: { preset: login-form }\nsteps: []`;
    const { scenario, issues } = parseScenarioFromYamlText(noId, 'noid.yaml');
    expect(scenario).toBeNull();
    expect(issues.some((i) => i.path.includes('.scenario'))).toBe(true);
  });

  test('SC9.b: missing topology → null', () => {
    const noTopo = `scenario: x\nschemaVersion: 1\nsteps:\n  - name: s\n    probe: { verb: observe }\n    expected: { classification: matched }`;
    const { scenario, issues } = parseScenarioFromYamlText(noTopo, 'notopo.yaml');
    expect(scenario).toBeNull();
    expect(issues.some((i) => i.path.includes('topology'))).toBe(true);
  });

  test('SC9.c: empty steps array → null', () => {
    const noSteps = `scenario: x\nschemaVersion: 1\ntopology: { preset: login-form }\nsteps: []`;
    const { scenario, issues } = parseScenarioFromYamlText(noSteps, 'nosteps.yaml');
    expect(scenario).toBeNull();
    expect(issues.some((i) => i.path.includes('steps'))).toBe(true);
  });

  test('SC9.d: unknown verb in step probe → error', () => {
    const badVerb = `
scenario: x
schemaVersion: 1
topology: { preset: login-form }
steps:
  - name: s
    probe: { verb: not-a-verb }
    expected: { classification: matched }
`;
    const { scenario, issues } = parseScenarioFromYamlText(badVerb, 'badverb.yaml');
    expect(scenario).toBeNull();
    expect(issues.some((i) => /unknown verb/.test(i.message))).toBe(true);
  });

  test('SC9.e: unknown assertion kind → error + null assertion', () => {
    const badAssertion = `
scenario: x
schemaVersion: 1
topology: { preset: login-form }
steps:
  - name: s
    probe: { verb: observe }
    expected: { classification: matched }
    postconditions:
      - kind: not-a-real-assertion
        target: { role: button }
`;
    const { issues } = parseScenarioFromYamlText(badAssertion, 'badassert.yaml');
    expect(issues.some((i) => /unknown assertion kind/.test(i.message))).toBe(true);
  });

  test('SC9.f: unknown invariant kind → error', () => {
    const badInv = `
scenario: x
schemaVersion: 1
topology: { preset: login-form }
steps:
  - name: s
    probe: { verb: observe }
    expected: { classification: matched }
invariants:
  - kind: not-a-real-invariant
`;
    const { issues } = parseScenarioFromYamlText(badInv, 'badinv.yaml');
    expect(issues.some((i) => /unknown invariant kind/.test(i.message))).toBe(true);
  });

  test('SC10: unknown top-level field is tolerated (parse succeeds)', () => {
    const withExtra = HAPPY_YAML + `\nfutureField: whatever\n`;
    const { scenario, issues } = parseScenarioFromYamlText(withExtra, 'extra.yaml');
    expect(scenario).not.toBeNull();
    // No error issues from the unknown field; parser ignores it.
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  test('SC10.b: defaults applied for omitted optional fields', () => {
    const minimal = `
scenario: minimal
schemaVersion: 1
topology: { preset: login-form }
steps:
  - name: s
    probe: { verb: observe }
    expected: { classification: matched }
`;
    const { scenario } = parseScenarioFromYamlText(minimal, 'minimal.yaml');
    expect(scenario).not.toBeNull();
    expect(scenario!.clearStateBetweenSteps).toBe(false);
    expect(scenario!.maxStepTimeoutMs).toBe(5000);
    expect(scenario!.expected.verdict).toBe('trajectory-holds');
    expect(scenario!.invariants).toEqual([]);
  });
});
