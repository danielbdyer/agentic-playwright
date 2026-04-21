/**
 * FixtureReplayProbeHarness — the second rung of the substrate
 * ladder per docs/v2-probe-ir-spike.md §6.1.
 *
 * Where the dry-harness echoes each probe's fixture expectation as
 * the observed outcome (seam-proof), fixture-replay asks an actual
 * per-verb classifier what the verb would do with the probe's
 * input. The classifier runs under injected Layers (snapshot,
 * catalog, clock) so its execution is deterministic and
 * reproducible. One probe, one classifier invocation, one receipt;
 * byte-identical across runs at the same commit.
 *
 * ## Shape
 *
 * The harness is a ProbeHarnessService whose `execute` method:
 *   1. Looks up the classifier for the probe's verb.
 *   2a. Found: invokes classifier.classify(probe), sets the
 *       observed outcome, stamps the receipt with adapter
 *       'fixture-replay'.
 *   2b. Missing: the probe cannot be truthfully exercised at
 *       this substrate rung. The harness emits a receipt with
 *       observed.classification = 'ambiguous' and a clear
 *       provenance note. `completedAsExpected` will resolve to
 *       false for any matched/failed fixture — that drop is the
 *       structural signal to register the missing classifier.
 *
 * The stratification-on-missing path is deliberate: rather than
 * throwing (which would halt the whole spike on the first
 * unclassified verb), the harness emits a receipt that honestly
 * says "substrate did not classify this." The spike verdict then
 * names which verbs need classifiers via the same receiptsConfirmed/
 * receiptsTotal ratio the dry-harness uses.
 *
 * ## Reproducibility
 *
 * Per memo §7 graduation metric 3, fixture-replay must produce
 * byte-identical receipts across consecutive runs on the same
 * commit. The harness accepts an injectable `now` clock so callers
 * can pin time; classifier determinism is the classifier's own
 * obligation (captured in its Layer composition).
 *
 * ## Relationship to playwright-live
 *
 * Playwright-live (Step 6) swaps the snapshot Layer for a real
 * browser Layer; everything else is the same. The classifier port
 * stays unchanged. That's the Layer-swap discipline the memo's
 * substrate ladder turns on.
 */

import { Effect } from 'effect';
import type { Probe } from './probe-ir';
import type { ProbeHarnessService } from './probe-harness';
import type { ProbeOutcome, ProbeHarnessAdapter } from './probe-receipt';
import { probeReceipt } from './probe-receipt';
import type { ProbeSurfaceCohort, ProbeFacetKind, ProbeErrorFamily } from '../metrics/probe-surface-cohort';
import {
  lookupClassifier,
  type VerbClassifierRegistry,
} from './verb-classifier';
import { fingerprintFor } from '../../product/domain/kernel/hash';

/** Observed outcome for a probe whose verb has no classifier
 *  registered. 'ambiguous' honestly reports "substrate did not
 *  decide"; errorFamily stays null because there's no error either.
 *  The receipt's completedAsExpected will be false for any probe
 *  whose fixture expected 'matched' or 'failed' — exactly the
 *  signal. */
const UNCLASSIFIED_OBSERVATION: ProbeOutcome['observed'] = {
  classification: 'ambiguous',
  errorFamily: null,
};

function inferCohort(probe: Probe): ProbeSurfaceCohort {
  const input = probe.input as Record<string, unknown> | null;
  const surface = input && typeof input === 'object' && 'surface' in input
    ? (input['surface'] as Record<string, unknown> | null)
    : null;
  const kindRaw = surface?.['facet-kind'] ?? input?.['facet-kind'];
  const facetKind = isProbeFacetKind(kindRaw) ? kindRaw : 'element';
  const errorFamily = isProbeErrorFamily(probe.expected.errorFamily)
    ? probe.expected.errorFamily
    : null;
  return { verb: probe.verb, facetKind, errorFamily };
}

function isProbeFacetKind(value: unknown): value is ProbeFacetKind {
  return value === 'element' || value === 'state' || value === 'vocabulary' || value === 'route';
}

function isProbeErrorFamily(value: unknown): value is ProbeErrorFamily {
  return (
    value === 'not-visible' ||
    value === 'not-enabled' ||
    value === 'timeout' ||
    value === 'assertion-like' ||
    value === 'unclassified'
  );
}

/** Compose the fixture-replay harness. The registry is injected at
 *  construction; add classifiers to it to grow fixture-replay's
 *  coverage. */
export function createFixtureReplayProbeHarness(opts: {
  readonly registry: VerbClassifierRegistry;
  readonly now?: () => Date;
  readonly adapter?: ProbeHarnessAdapter;
}): ProbeHarnessService {
  const now = opts.now ?? (() => new Date());
  const adapter = opts.adapter ?? 'fixture-replay';
  return {
    execute: (probe: Probe) =>
      Effect.gen(function* () {
        const startedAt = now();
        const classifier = lookupClassifier(opts.registry, probe.verb);
        const observed: ProbeOutcome['observed'] = classifier === null
          ? UNCLASSIFIED_OBSERVATION
          : yield* classifier.classify(probe);
        const completedAt = now();
        const elapsedMs = completedAt.getTime() - startedAt.getTime();
        const cohort = inferCohort(probe);
        const artifactFingerprint = fingerprintFor('artifact', {
          probeId: probe.id,
          startedAt: startedAt.toISOString(),
          adapter,
        });
        const contentFingerprint = fingerprintFor('content', {
          probeId: probe.id,
          expected: probe.expected,
          observed,
          adapter,
        });
        const fixtureFingerprint = fingerprintFor('content', {
          declaredIn: probe.declaredIn,
          fixtureName: probe.fixtureName,
          input: probe.input,
          worldSetup: probe.worldSetup,
        });
        return probeReceipt({
          probeId: probe.id,
          verb: probe.verb,
          fixtureName: probe.fixtureName,
          cohort,
          expected: probe.expected,
          observed,
          provenance: {
            adapter,
            manifestVersion: 1,
            fixtureFingerprint,
            startedAt: startedAt.toISOString(),
            completedAt: completedAt.toISOString(),
            elapsedMs,
          },
          runRecordRef: null,
          hypothesisId: null,
          artifactFingerprint,
          contentFingerprint,
        });
      }),
  };
}
