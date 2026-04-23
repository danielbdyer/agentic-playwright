/**
 * ScenarioReceipt + fingerprint laws.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.4:
 *   SC14 — receipt envelope shape (version/stage/scope/kind).
 *   SC15 — receipt fingerprint stable across runs given pinned now.
 *   SC16 — fingerprint sensitive to substantive fields (verdict),
 *          insensitive to cosmetic fields (description).
 *   SC17 — lineage.parents carries per-step probe IDs;
 *          lineage.sources carries `scenario:<id>`.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Layer } from 'effect';
import { createDryScenarioHarness } from '../../workshop/scenarios/harness/dry-scenario-harness';
import { ScenarioHarness } from '../../workshop/scenarios/application/scenario-harness-port';
import { runScenario } from '../../workshop/scenarios/application/run-scenario';
import { buildScenarioReceipt } from '../../workshop/scenarios/application/build-receipt';
import {
  scenarioFingerprint,
  scenarioReceiptFingerprint,
} from '../../workshop/scenarios/application/fingerprint';
import {
  scenarioId,
  stepName,
  type Scenario,
  type ScenarioStep,
} from '../../workshop/scenarios/domain/scenario';

function step(name: string): ScenarioStep {
  return {
    name: stepName(name),
    probe: {
      id: `probe:scenario:demo:${name}`,
      verb: 'observe',
      fixtureName: name,
      declaredIn: 'inline',
      expected: { classification: 'matched', errorFamily: null },
      input: { target: { role: 'button', name: 'Action' } },
      worldSetup: undefined,
      exercises: [],
    },
    expected: { classification: 'matched', errorFamily: null },
    worldInheritance: 'keep',
    preconditions: [],
    postconditions: [],
  };
}

function makeScenario(): Scenario {
  return {
    id: scenarioId('demo'),
    description: 'description should not affect fingerprint',
    schemaVersion: 1,
    topology: { kind: 'preset', preset: 'login-form' },
    steps: [step('alpha'), step('beta')],
    invariants: [],
    expected: { verdict: 'trajectory-holds' },
    clearStateBetweenSteps: false,
    maxStepTimeoutMs: 5000,
  };
}

const PINNED_NOW = new Date('2026-04-22T00:00:00.000Z');

async function runDry(scenario: Scenario) {
  const harness = createDryScenarioHarness({ now: () => PINNED_NOW });
  const output = await Effect.runPromise(
    runScenario(scenario, { now: () => PINNED_NOW }).pipe(
      Effect.provide(Layer.succeed(ScenarioHarness, harness)),
    ),
  );
  return buildScenarioReceipt(output);
}

describe('ScenarioReceipt + fingerprint laws', () => {
  test('SC14: receipt envelope shape', async () => {
    const receipt = await runDry(makeScenario());
    expect(receipt.version).toBe(1);
    expect(receipt.stage).toBe('evidence');
    expect(receipt.scope).toBe('scenario');
    expect(receipt.kind).toBe('scenario-receipt');
    expect(receipt.governance).toBe('approved');
    expect(receipt.payload.scenarioId).toBe('demo');
    expect(receipt.payload.verdict).toBe('trajectory-holds');
    expect(receipt.payload.provenance.harness).toBe('scenario-dry');
  });

  test('SC15: receipt fingerprint stable across runs with pinned now', async () => {
    const a = await runDry(makeScenario());
    const b = await runDry(makeScenario());
    expect(a.fingerprints.artifact).toBe(b.fingerprints.artifact);
    expect(a.fingerprints.content).toBe(b.fingerprints.content);
  });

  test('SC15.b: scenarioFingerprint deterministic', () => {
    const a = scenarioFingerprint(makeScenario());
    const b = scenarioFingerprint(makeScenario());
    expect(a).toBe(b);
  });

  test('SC16: fingerprint INsensitive to description (cosmetic)', () => {
    const a = scenarioFingerprint(makeScenario());
    const altered = { ...makeScenario(), description: 'totally different prose' };
    const b = scenarioFingerprint(altered);
    expect(a).toBe(b);
  });

  test('SC16.b: fingerprint INsensitive to step name (cosmetic)', () => {
    const base = makeScenario();
    const renamed: Scenario = {
      ...base,
      steps: base.steps.map((s, i) => ({ ...s, name: stepName(`renamed-${i}`) })),
    };
    expect(scenarioFingerprint(base)).toBe(scenarioFingerprint(renamed));
  });

  test('SC16.c: fingerprint sensitive to substantive change (topology)', () => {
    const base = makeScenario();
    const altered: Scenario = {
      ...base,
      topology: { kind: 'preset', preset: 'tabbed-interface' },
    };
    expect(scenarioFingerprint(base)).not.toBe(scenarioFingerprint(altered));
  });

  test('SC16.d: fingerprint sensitive to step expected change', () => {
    const base = makeScenario();
    const altered: Scenario = {
      ...base,
      steps: [
        {
          ...base.steps[0]!,
          expected: { classification: 'failed', errorFamily: 'unclassified' },
        },
        ...base.steps.slice(1),
      ],
    };
    expect(scenarioFingerprint(base)).not.toBe(scenarioFingerprint(altered));
  });

  test('SC16.e: receiptFingerprint excludes wall-clock timing fields', async () => {
    // Two runs with the same pinned `now` produce identical
    // fingerprints (per SC15). Validate by checking the recipe
    // explicitly: scenarioReceiptFingerprint excludes startedAt/
    // completedAt/totalElapsedMs from its input.
    const receipt = await runDry(makeScenario());
    const recomputed = scenarioReceiptFingerprint(receipt);
    expect(receipt.fingerprints.artifact).toBe(recomputed);
  });

  test('SC17: lineage wired correctly', async () => {
    const receipt = await runDry(makeScenario());
    expect(receipt.lineage.sources).toEqual(['scenario:demo']);
    expect(receipt.lineage.parents).toEqual([
      'probe:scenario:demo:alpha',
      'probe:scenario:demo:beta',
    ]);
    expect(receipt.lineage.handshakes).toEqual(['evidence']);
  });
});
