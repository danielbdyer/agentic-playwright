/**
 * VerbClassifier — the per-verb port fixture-replay (and higher-
 * fidelity substrate harnesses) uses to turn a verb execution into
 * a `ProbeOutcome['observed']` shape.
 *
 * Per `docs/v2-probe-ir-spike.md §6.4`, what's shared across the
 * substrate-backed adapters is the Layer composition pattern plus a
 * way to ask "what does this verb do with this probe's input?" The
 * VerbClassifier port names that question.
 *
 * ## Port shape
 *
 * A classifier is a pure function from a probe to an observed
 * outcome, wrapped in an Effect so it can compose with any Layer
 * dependencies the verb needs (PlaywrightBridge, FacetCatalog,
 * Clock, etc.). The registry keys classifiers by verb name —
 * exactly the manifest key.
 *
 * ## Why not reuse the manifest verb handler
 *
 * `product/application/manifest/default-handlers.ts` registers raw
 * request/response handlers for the MCP wire. Those handlers return
 * the verb's output, not a classification. A classifier is a
 * workshop-side projection: it takes the verb's output (or thrown
 * error) and maps it onto the closed (classification, errorFamily)
 * tuple the probe receipt expects. One handler feeds multiple
 * classifiers in principle (a classifier variant could interpret
 * rung-attribution differently, for example); coupling them at the
 * port level would collapse that future freedom.
 *
 * ## Coverage semantics
 *
 * A verb without a registered classifier cannot be exercised under
 * fixture-replay. The fixture-replay harness stratifies such verbs
 * explicitly in its receipts (adapter tag stays 'fixture-replay',
 * but the classifier-missing status is carried through the
 * harness's per-probe code path). Scope 3c lands the harness; this
 * file is the port only.
 *
 * Pure port — no Effect.runPromise, no IO. Writers live in scope 3c
 * (the harness) and scope 3d (the first classifier).
 */

import type { Effect } from 'effect';
import type { Probe } from './probe-ir';
import type { ProbeOutcome } from './probe-receipt';

/** A verb classifier. Given a probe, produces the observed outcome
 *  under the fixture-replay substrate. Effect return type allows
 *  classifiers to depend on injected Layers (snapshot, catalog,
 *  clock). Errors surface as Effect failures — a thrown classifier
 *  is a harness infrastructure problem, not a probe outcome.
 *
 *  The ProbeOutcome['observed'] output is the (classification,
 *  errorFamily) tuple the receipt folds into `completedAsExpected`
 *  at construction time. */
export interface VerbClassifier {
  /** Manifest verb name this classifier is keyed by. */
  readonly verb: string;
  /** The classification function. Pure over the probe + injected
   *  Layers; no hidden IO beyond what the Layer provides. */
  readonly classify: (probe: Probe) => Effect.Effect<ProbeOutcome['observed'], Error, never>;
}

/** A registry mapping verb name → classifier. Pure — lookups are
 *  O(1) over a readonly record. Callers extend the registry by
 *  merging additional entries at composition time (test-compose
 *  plus future per-verb classifiers). */
export interface VerbClassifierRegistry {
  readonly classifiers: ReadonlyMap<string, VerbClassifier>;
}

/** Build a registry from an array of classifiers. Later entries
 *  win on duplicate verb names — callers merging host-specific
 *  extensions on top of defaults can rely on that order. */
export function verbClassifierRegistry(
  classifiers: readonly VerbClassifier[],
): VerbClassifierRegistry {
  const map = new Map<string, VerbClassifier>();
  for (const c of classifiers) map.set(c.verb, c);
  return { classifiers: map };
}

/** Look up a classifier by verb name. Returns null when unregistered
 *  — the harness decides how to handle missing classifiers (today
 *  it stratifies them into a "no-classifier" receipt variant). */
export function lookupClassifier(
  registry: VerbClassifierRegistry,
  verb: string,
): VerbClassifier | null {
  return registry.classifiers.get(verb) ?? null;
}

/** Empty registry — the baseline for tests and composition roots
 *  that extend with their own classifiers. */
export const EMPTY_CLASSIFIER_REGISTRY: VerbClassifierRegistry = {
  classifiers: new Map(),
};
