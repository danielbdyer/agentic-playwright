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
import {
  type Fingerprint,
} from '../../../product/domain/kernel/hash';
import type { ScenarioReceipt } from '../domain/scenario-receipt';
import type { RunOutput } from './run-scenario';
import {
  scenarioFingerprint,
  scenarioReceiptFingerprint,
} from './fingerprint';

export function buildScenarioReceipt(
  output: RunOutput,
  options: { readonly hypothesisId?: string | null } = {},
): ScenarioReceipt {
  const sf = scenarioFingerprint(output.scenario);
  const draft: Omit<ScenarioReceipt, 'fingerprints'> & {
    readonly fingerprints: { readonly artifact: Fingerprint<'artifact'>; readonly content: Fingerprint<'content'> };
  } = {
    version: 1,
    stage: 'evidence',
    scope: 'scenario',
    kind: 'scenario-receipt',
    ids: {},
    fingerprints: {
      artifact: '' as Fingerprint<'artifact'>,
      content: '' as Fingerprint<'content'>,
    },
    lineage: {
      sources: [`scenario:${output.scenario.id}`],
      parents: output.trace.steps.map((s) => s.probeReceiptRef.probeId),
      handshakes: ['evidence'],
    },
    governance: 'approved',
    payload: {
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
    },
  };

  // Stamp the receipt fingerprint after the payload is set.
  const receiptFp = scenarioReceiptFingerprint(draft as ScenarioReceipt);
  // The artifact fingerprint covers the receipt's identity (id +
  // scenario fingerprint + harness); the content fingerprint
  // covers the full receipt payload.
  return {
    ...draft,
    fingerprints: {
      artifact: receiptFp as unknown as Fingerprint<'artifact'>,
      content: receiptFp as unknown as Fingerprint<'content'>,
    },
  };
}
