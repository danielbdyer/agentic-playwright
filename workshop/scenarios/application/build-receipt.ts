/**
 * Build a ScenarioReceipt envelope from a runner's RunOutput.
 *
 * Per docs/v2-scenario-corpus-plan.md §3.4 + §9.4, the receipt:
 *   - Extends WorkflowMetadata<'evidence'>.
 *   - kind: 'scenario-receipt' / scope: 'scenario'.
 *   - lineage.sources: `scenario:<id>` for traceability.
 *   - lineage.parents: per-step probe-receipt artifact fingerprints
 *     when those receipts were emitted (today the dry harness
 *     emits the per-step probe-id only; future fixture-replay /
 *     playwright-live harnesses emit real ProbeReceipts and we'd
 *     stamp their fingerprints here).
 *   - fingerprints.artifact + fingerprints.content stamped via
 *     scenarioReceiptFingerprint.
 */

import { SUBSTRATE_VERSION } from '../../substrate/version';
import { mintEvidenceEnvelopeWithFingerprint } from '../../../product/domain/governance/mint-envelope';
import type { ScenarioReceipt } from '../domain/scenario-receipt';
import type { RunOutput } from './run-scenario';
import {
  scenarioFingerprint,
  scenarioReceiptFingerprintSource,
} from './fingerprint';

export function buildScenarioReceipt(
  output: RunOutput,
  options: { readonly hypothesisId?: string | null } = {},
): ScenarioReceipt {
  const sf = scenarioFingerprint(output.scenario);
  const payload: ScenarioReceipt['payload'] = {
    scenarioId: output.scenario.id,
    scenarioFingerprint: sf,
    trace: output.trace,
    invariantOutcomes: output.invariantOutcomes,
    verdict: output.verdict,
    provenance: {
      harness: output.harnessTag,
      substrateVersion: SUBSTRATE_VERSION,
      manifestVersion: 1,
      startedAt: output.startedAt.toISOString(),
      completedAt: output.completedAt.toISOString(),
      totalElapsedMs: output.completedAt.getTime() - output.startedAt.getTime(),
    },
    hypothesisId: options.hypothesisId ?? null,
  };

  return mintEvidenceEnvelopeWithFingerprint({
    stage: 'evidence',
    scope: 'scenario',
    kind: 'scenario-receipt',
    payload,
    lineage: {
      sources: [`scenario:${output.scenario.id}`],
      parents: output.trace.steps.map((s) => s.probeReceiptRef.probeId),
    },
    fingerprintSource: scenarioReceiptFingerprintSource(payload),
  }) as ScenarioReceipt;
}
