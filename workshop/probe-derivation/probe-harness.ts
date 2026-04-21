/**
 * ProbeHarness — the Effect service that executes a probe and emits
 * a ProbeReceipt.
 *
 * Per `docs/v2-direction.md §5.1` and `docs/v2-substrate.md §6a`, a
 * probe runs through `product/`'s normal authoring flow; the only
 * distinguishing field on the synthesized work item is its `source`
 * tag (`probe:<verb>:<fixture>`). The harness is the boundary: it
 * takes a pure `Probe`, arranges for the verb to run, observes the
 * outcome, and produces a ProbeReceipt.
 *
 * ## Why a port (Effect Context.Tag) instead of a function
 *
 * The harness has four plausible implementations over the life of
 * Step 5 and Step 6+:
 *
 *   - **dry-harness** — stubs execution by pattern-matching on the
 *     fixture's declared expectation. Produces a trivially-
 *     confirming receipt. Used to prove the seam shape end-to-end
 *     before any real world is wired.
 *   - **fixture-replay** — runs the probe against a captured DOM
 *     snapshot / deterministic fixture world. Produces a real
 *     observation but not a real world. Used when probes need to
 *     exercise real product code without real browser flakiness.
 *   - **playwright-live** — runs the probe through product's
 *     normal authoring flow with a Playwright bridge. Produces a
 *     real RunRecord alongside the ProbeReceipt.
 *   - **production** — runs against a customer tenant under
 *     workshop supervision. Same code path as playwright-live;
 *     the substrate is different.
 *
 * Injecting via a Context.Tag lets workshop orchestrators compose
 * whichever adapter the run needs without branching logic in the
 * spike harness. The test suite uses dry-harness; later CLI
 * invocations pick fixture-replay; Step 6+ wires playwright-live.
 *
 * ## Shape
 *
 * The port's single method accepts a Probe and returns an Effect
 * that yields a ProbeReceipt. Failures classify as defects that
 * escape to the caller — the harness does NOT swallow probe
 * failures; the whole point is to observe them.
 *
 * Per the coding-notes.md discipline, no Effect.runPromise /
 * runSync calls happen inside this module. Composition happens at
 * the CLI entry point / test harness boundary.
 */

import { Context, Effect } from 'effect';
import type { Probe } from './probe-ir';
import type { ProbeReceipt, ProbeOutcome, ProbeHarnessAdapter } from './probe-receipt';
import { probeReceipt } from './probe-receipt';
import type { ProbeSurfaceCohort, ProbeFacetKind, ProbeErrorFamily } from '../metrics/probe-surface-cohort';
import { fingerprintFor } from '../../product/domain/kernel/hash';

/** The port's service interface. */
export interface ProbeHarnessService {
  /** Execute one probe, returning its receipt. Never fails — a
   *  probe whose expectation is not met produces a receipt with
   *  `completedAsExpected: false`, not an error. True harness
   *  failures (catalog missing, browser crashed, etc.) DO surface
   *  as Effect errors; those represent harness infrastructure
   *  problems, not probe outcomes. */
  readonly execute: (probe: Probe) => Effect.Effect<ProbeReceipt, Error, never>;
}

/** Context.Tag for the ProbeHarness port. Composed via Layer at
 *  the spike entry points. */
export class ProbeHarness extends Context.Tag('workshop/probe-derivation/ProbeHarness')<
  ProbeHarness,
  ProbeHarnessService
>() {}

// ─── Dry-harness adapter ───────────────────────────────────────
//
// Proves the seam exists without wiring a real world. Every probe
// confirms its declared expectation because the adapter's observed
// outcome is a literal copy of the fixture's expected outcome.
//
// Value: the test suite can run an end-to-end spike — manifest →
// probe derivation → harness execution → receipt log → coverage
// report → verdict — without ever touching product's runtime. When
// the real adapters come online at Step 6+, the spike infrastructure
// stays stable; only the Layer composition swaps.

/** Infer the probe-surface cohort from a Probe's identity and its
 *  expected outcome. Pure. */
function inferCohort(probe: Probe): ProbeSurfaceCohort {
  // The cohort's facet-kind is drawn from the fixture's input.
  // Fixtures put it under either `input.surface.facet-kind` (observe-
  // style) or top-level `input.facet-kind`. When neither is present,
  // we default to 'element' — the most common kind.
  const input = probe.input as Record<string, unknown> | null;
  const surface = (input && typeof input === 'object' && 'surface' in input)
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

/** Compose the dry-harness adapter. The `now` + `fingerprintOf`
 *  hooks are injectable so tests can pin deterministic timestamps
 *  and fingerprint values. */
export function createDryProbeHarness(opts?: {
  readonly now?: () => Date;
  readonly adapter?: ProbeHarnessAdapter;
}): ProbeHarnessService {
  const now = opts?.now ?? (() => new Date());
  const adapter = opts?.adapter ?? 'dry-harness';
  return {
    execute: (probe: Probe) =>
      Effect.sync(() => {
        const startedAt = now();
        // The dry adapter "observes" exactly what the fixture
        // expects — the receipt always confirms. Real adapters
        // observe the actual verb outcome and may produce a
        // mismatching receipt.
        const observed: ProbeOutcome['observed'] = {
          classification: probe.expected.classification,
          errorFamily: probe.expected.errorFamily,
        };
        const completedAt = now();
        const elapsedMs = completedAt.getTime() - startedAt.getTime();
        const cohort = inferCohort(probe);
        const artifactFingerprint = fingerprintFor('artifact', {
          probeId: probe.id,
          startedAt: startedAt.toISOString(),
        });
        const contentFingerprint = fingerprintFor('content', {
          probeId: probe.id,
          expected: probe.expected,
          observed,
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
