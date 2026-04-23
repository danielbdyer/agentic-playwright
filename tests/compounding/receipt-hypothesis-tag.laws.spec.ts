/**
 * Z3 receipt-tag laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.3 (ZC11):
 *   ZC11 — a ProbeReceipt / ScenarioReceipt built with a non-null
 *          hypothesisId serializes and deserializes with the field
 *          preserved; absence round-trips as null (not as "absence").
 *
 * ProbeReceipt already carries `hypothesisId: string | null` (Step 1
 * / workshop/probe-derivation/probe-receipt.ts); Z3 only adds the
 * field to ScenarioReceipt + its builder. The law below pins the
 * round-trip for both receipt types.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Layer } from 'effect';
import { createDryScenarioHarness } from '../../workshop/scenarios/harness/dry-scenario-harness';
import { ScenarioHarness } from '../../workshop/scenarios/application/scenario-harness-port';
import { runScenario } from '../../workshop/scenarios/application/run-scenario';
import { buildScenarioReceipt } from '../../workshop/scenarios/application/build-receipt';
import {
  scenarioId,
  stepName,
  type Scenario,
  type ScenarioStep,
} from '../../workshop/scenarios/domain/scenario';
import { probeReceipt } from '../../workshop/probe-derivation/probe-receipt';
import { asFingerprint } from '../../product/domain/kernel/hash';

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
    description: 'demo',
    schemaVersion: 1,
    topology: { kind: 'preset', preset: 'login-form' },
    steps: [step('alpha')],
    invariants: [],
    expected: { verdict: 'trajectory-holds' },
    clearStateBetweenSteps: false,
    maxStepTimeoutMs: 5000,
  };
}

const PINNED_NOW = new Date('2026-04-23T00:00:00.000Z');

async function runDry(scenario: Scenario) {
  const harness = createDryScenarioHarness({ now: () => PINNED_NOW });
  const output = await Effect.runPromise(
    runScenario(scenario, { now: () => PINNED_NOW }).pipe(
      Effect.provide(Layer.succeed(ScenarioHarness, harness)),
    ),
  );
  return output;
}

describe('Z3 — receipt hypothesisId round-trip (ZC11)', () => {
  test('ZC11.a: ScenarioReceipt preserves non-null hypothesisId through JSON round-trip', async () => {
    const output = await runDry(makeScenario());
    const hid = 'h:00000000-0000-4000-8000-000000000001';
    const receipt = buildScenarioReceipt(output, { hypothesisId: hid });
    expect(receipt.payload.hypothesisId).toBe(hid);

    const roundTripped = JSON.parse(JSON.stringify(receipt));
    expect(roundTripped.payload.hypothesisId).toBe(hid);
  });

  test('ZC11.b: ScenarioReceipt default hypothesisId is null', async () => {
    const output = await runDry(makeScenario());
    const receipt = buildScenarioReceipt(output);
    expect(receipt.payload.hypothesisId).toBeNull();

    const roundTripped = JSON.parse(JSON.stringify(receipt));
    expect(roundTripped.payload.hypothesisId).toBeNull();
  });

  test('ZC11.c: ScenarioReceipt explicit-null hypothesisId round-trips as null', async () => {
    const output = await runDry(makeScenario());
    const receipt = buildScenarioReceipt(output, { hypothesisId: null });
    expect(receipt.payload.hypothesisId).toBeNull();

    const roundTripped = JSON.parse(JSON.stringify(receipt));
    expect(roundTripped.payload.hypothesisId).toBeNull();
  });

  test('ZC11.d: ProbeReceipt preserves non-null hypothesisId through JSON round-trip', () => {
    const hid = 'h:00000000-0000-4000-8000-000000000002';
    const receipt = probeReceipt({
      probeId: 'probe:observe:demo',
      verb: 'observe',
      fixtureName: 'demo',
      cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
      expected: { classification: 'matched', errorFamily: null },
      observed: { classification: 'matched', errorFamily: null },
      provenance: {
        adapter: 'dry-harness',
        manifestVersion: 1,
        substrateVersion: '1.0.0',
        fixtureFingerprint: asFingerprint('content', 'fp:c:demo'),
        startedAt: PINNED_NOW.toISOString(),
        completedAt: PINNED_NOW.toISOString(),
        elapsedMs: 0,
      },
      runRecordRef: null,
      hypothesisId: hid,
      artifactFingerprint: asFingerprint('artifact', 'fp:a:demo'),
      contentFingerprint: asFingerprint('content', 'fp:c:demo'),
    });
    expect(receipt.payload.hypothesisId).toBe(hid);

    const roundTripped = JSON.parse(JSON.stringify(receipt));
    expect(roundTripped.payload.hypothesisId).toBe(hid);
  });

  test('ZC11.e: ScenarioReceipt fingerprint stays stable under hypothesisId change', async () => {
    // Attribution (hypothesisId) should not perturb the scenario's
    // receipt fingerprint — the fingerprint covers the evidence of
    // what happened, not which hypothesis is tracking it.
    const output = await runDry(makeScenario());
    const withHid = buildScenarioReceipt(output, { hypothesisId: 'h:aaa' });
    const withoutHid = buildScenarioReceipt(output);
    expect(withHid.fingerprints.artifact).toBe(withoutHid.fingerprints.artifact);
  });
});
