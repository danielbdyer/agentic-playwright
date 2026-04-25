/**
 * Spike harness — the Step 5 orchestrator that runs the Probe IR
 * spike end-to-end.
 *
 * Per `docs/v2-substrate.md §6a`, the spike:
 *   1. Projects the manifest into TestableSurfaces (one per verb).
 *   2. Loads per-verb fixture documents.
 *   3. Derives probes from (TestableSurface × fixture).
 *   4. Executes each probe via the injected ProbeHarness.
 *   5. Collects receipts and computes the spike coverage verdict.
 *
 * The output is a `SpikeReport` — the one-page go/no-go the spike
 * protocol calls for. Pass condition: ≥80% of verbs covered.
 *
 * ## Shape
 *
 * The whole program is `Effect.gen(function* () { … })` with one
 * service dependency (`ProbeHarness`) and no built-in IO other
 * than what the harness needs. Composition:
 *
 *    runSpike(input) :: Effect<SpikeReport, never, ProbeHarness>
 *
 * Callers (CLI, tests) provide the harness via Layer.succeed and
 * runPromise at the boundary.
 *
 * ## Separation of concerns
 *
 * Pure derivation + coverage math live in probe-ir.ts + derive-
 * probes.ts. The spike harness's job is sequencing: walk the
 * probes, execute each, accumulate receipts, summarize. The
 * summarization is a pure fold over the receipts; the execution
 * is the only effectful bit.
 */

import { Effect } from 'effect';
import type { Manifest } from '../../product/domain/manifest/manifest';
import type { Probe, ProbeDerivation, SpikeCoverageReport } from './probe-ir';
import { summarizeCoverage } from './probe-ir';
import type { ProbeReceipt } from './probe-receipt';
import { confirmsExpectation } from './probe-receipt';
import { ProbeHarness } from './probe-harness';

/** The spike verdict — the one-page go/no-go. */
export interface SpikeReport {
  readonly manifestVersion: number;
  readonly generatedAt: string;
  readonly coverage: SpikeCoverageReport;
  readonly receipts: readonly ProbeReceipt[];
  readonly passesGate: boolean;
  /** Per-verb breakdown: how many fixtures, how many probes
   *  derived, how many receipts confirmed. */
  readonly perVerb: readonly {
    readonly verb: string;
    readonly fixtureCount: number;
    readonly probeCount: number;
    readonly receiptsConfirmed: number;
    readonly receiptsTotal: number;
  }[];
  /** Prose summary — what the reviewer reads first. */
  readonly summary: string;
}

/** Build the spike verdict from executed receipts. Pure. */
export function summarizeSpike(input: {
  readonly manifest: Manifest;
  readonly derivation: ProbeDerivation;
  readonly receipts: readonly ProbeReceipt[];
  readonly generatedAt: string;
}): SpikeReport {
  const { manifest, derivation, receipts, generatedAt } = input;
  const receiptsByVerb = new Map<string, ProbeReceipt[]>();
  for (const receipt of receipts) {
    const list = receiptsByVerb.get(receipt.payload.verb) ?? [];
    list.push(receipt);
    receiptsByVerb.set(receipt.payload.verb, list);
  }
  const probesByVerb = new Map<string, Probe[]>();
  for (const probe of derivation.probes) {
    const list = probesByVerb.get(probe.verb) ?? [];
    list.push(probe);
    probesByVerb.set(probe.verb, list);
  }
  const perVerb = manifest.verbs.map((verb) => {
    const verbReceipts = receiptsByVerb.get(verb.name) ?? [];
    const verbProbes = probesByVerb.get(verb.name) ?? [];
    const confirmed = verbReceipts.filter(confirmsExpectation).length;
    return {
      verb: verb.name,
      fixtureCount: new Set(verbProbes.map((p) => p.fixtureName)).size,
      probeCount: verbProbes.length,
      receiptsConfirmed: confirmed,
      receiptsTotal: verbReceipts.length,
    };
  });
  const confirmedTotal = receipts.filter(confirmsExpectation).length;
  const coverage = summarizeCoverage({
    derivation,
    totalDeclaredVerbs: manifest.verbs.length,
    probesCompletingAsExpected: confirmedTotal,
  });
  const summary = renderSummary({ manifest, derivation, coverage, confirmedTotal, receiptsTotal: receipts.length });
  return {
    manifestVersion: manifest.version,
    generatedAt,
    coverage,
    receipts,
    passesGate: coverage.passesGate,
    perVerb,
    summary,
  };
}

function renderSummary(input: {
  readonly manifest: Manifest;
  readonly derivation: ProbeDerivation;
  readonly coverage: SpikeCoverageReport;
  readonly confirmedTotal: number;
  readonly receiptsTotal: number;
}): string {
  const { manifest, derivation, coverage, confirmedTotal, receiptsTotal } = input;
  const pct = (coverage.coveragePercentage * 100).toFixed(1);
  const gate = coverage.passesGate ? 'PASS' : 'FAIL';
  const lines: string[] = [
    `Probe IR Spike — manifest v${manifest.version}, ${manifest.verbs.length} declared verbs`,
    `  Coverage: ${coverage.coveredVerbs}/${coverage.totalDeclaredVerbs} verbs (${pct}%) — gate ${gate} @ 80%`,
    `  Probes synthesized: ${derivation.probes.length}`,
    `  Receipts confirming expectation: ${confirmedTotal}/${receiptsTotal}`,
  ];
  if (derivation.uncoveredVerbs.length > 0) {
    lines.push(`  Uncovered verbs (no fixture): ${derivation.uncoveredVerbs.join(', ')}`);
  }
  if (derivation.unfixturableVerbs.length > 0) {
    lines.push(`  Unfixturable verbs (syntheticInput): ${derivation.unfixturableVerbs.join(', ')}`);
  }
  return lines.join('\n');
}

/** The full spike program: execute every derived probe via the
 *  injected ProbeHarness, collect receipts, summarize. Returns an
 *  Effect that yields the verdict; requires a ProbeHarness in the
 *  environment. */
export function runSpike(input: {
  readonly manifest: Manifest;
  readonly derivation: ProbeDerivation;
  readonly now?: () => Date;
}): Effect.Effect<SpikeReport, Error, ProbeHarness> {
  const now = input.now ?? (() => new Date());
  return Effect.gen(function* () {
    const harness = yield* ProbeHarness;
    const receipts: ProbeReceipt[] = [];
    for (const probe of input.derivation.probes) {
      const receipt = yield* harness.execute(probe);
      receipts.push(receipt);
    }
    return summarizeSpike({
      manifest: input.manifest,
      derivation: input.derivation,
      receipts,
      generatedAt: now().toISOString(),
    });
  });
}
