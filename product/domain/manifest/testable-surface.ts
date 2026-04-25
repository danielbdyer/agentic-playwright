/**
 * TestableSurface — the tuple `(verb × input shape × output shape ×
 * error families × composition path)` that the workshop probes.
 *
 * Per `docs/v2-direction.md §5.1` and `docs/v2-substrate.md §6a`, a
 * probe is a synthetic work item whose shape derives from one
 * TestableSurface. This module is the **pure domain projection** of
 * a manifest verb into the tuple the workshop's probe-derivation pass
 * reads. It is intentionally thin — the manifest is the source of
 * truth; TestableSurface just lifts the verb's declarative shape
 * into a named record workshop code pattern-matches against.
 *
 * ## Why a projection module and not just re-using VerbEntry?
 *
 * VerbEntry carries `inputs`, `outputs`, `errorFamilies`, etc. as
 * independent fields. The probe-derivation discipline cares about
 * a specific grouping: *the five-tuple* that names a testable
 * surface. Each field's role in that tuple is different:
 *
 *   - `verb`            — the identity of the probe's target.
 *   - `inputType`       — what the fixture YAML must shape-match.
 *   - `outputType`      — what the run record's payload must
 *                         shape-match after the verb runs.
 *   - `errorFamilies`   — the expected failure surface; probes
 *                         exercise each family at least once.
 *   - `compositionPath` — where the verb sits in the authoring
 *                         flow (atomic vs composed vs memory-read
 *                         vs world-observation). This dictates
 *                         what layer of the harness has to be
 *                         wired for the probe to exercise it.
 *
 * Flattening VerbEntry into this tuple is pure rearrangement; we
 * do it here so downstream workshop code can reason in terms of
 * "surfaces" rather than a bag of loose fields. It also gives us
 * a single place to name `CompositionPath`, which is documented
 * as a TestableSurface member in the direction doc but did not
 * have a type-level home before.
 *
 * ## Composition path — what it means at Step 5
 *
 * The composition-path classifier is the workshop's judgement call
 * about *how* a verb needs to be exercised. It is not the verb's
 * intrinsic property — it is a property of the harness that can run
 * it. Step 5's spike covers three composition paths:
 *
 *   - `atomic`           — verb runs standalone, pure over its
 *                          inputs. (`test-compose` is atomic:
 *                          flow + imports → spec module.)
 *   - `memory-read`      — verb reads the facet catalog. Needs a
 *                          catalog fixture. (`facet-query`.)
 *   - `world-observation`— verb reads a live DOM. Needs a
 *                          Playwright page or fixture-replay
 *                          snapshot. (`observe`, `interact`.)
 *
 * Four more paths are reserved for verbs we're not spiking at
 * Step 5 but know the shape of:
 *
 *   - `memory-write`     — verb mints or enriches facets in the
 *                          catalog. (`facet-mint`, `facet-enrich`.)
 *   - `external-source`  — verb pulls from an outside system.
 *                          (`intent-fetch` reads ADO.)
 *   - `ledger-append`    — verb appends to an append-only log
 *                          without computing new knowledge.
 *                          (`locator-health-track`.)
 *   - `unfixturable`     — verb is hard to probe mechanically.
 *                          (Open-ended `Reasoning.synthesize`.)
 *
 * The composition-path classifier is itself data — a Verb's path
 * is declared either from the verb's fixture spec (when authored)
 * or defaulted via `defaultCompositionPathForCategory`. Explicit
 * declaration in the fixture wins.
 *
 * ## What this module is NOT
 *
 * - NOT a runtime executor; probes execute via the `ProbeHarness`
 *   port in workshop/probe-derivation/probe-harness.ts.
 * - NOT a schema validator; input-shape validation happens in the
 *   fixture-loader + the handler-specific input guards.
 * - NOT a saga description. When verbs chain (e.g., facet-query →
 *   test-compose) the chain lives in workshop's probe authoring
 *   flow, not here.
 *
 * Pure domain. No Effect. No IO.
 */

import type { VerbCategory, VerbEntry } from './verb-entry';
import type { Manifest } from './manifest';

/** Where a verb sits in the authoring flow — dictates what layer
 *  of the harness has to be wired to exercise it. See module
 *  docstring §"Composition path" for semantics. */
export type CompositionPathKind =
  | 'atomic'
  | 'memory-read'
  | 'memory-write'
  | 'world-observation'
  | 'external-source'
  | 'ledger-append'
  | 'unfixturable';

/** Composition-path ADT. The `kind` carries the path classifier;
 *  adjunct fields carry minimal structure the harness needs to
 *  prepare a fixture world. For Step 5 the adjuncts are prose —
 *  they become structured when the corresponding harness layer
 *  lands. */
export type CompositionPath =
  | { readonly kind: 'atomic' }
  | { readonly kind: 'memory-read'; readonly catalogScope: 'screen-scoped' | 'global' }
  | { readonly kind: 'memory-write'; readonly catalogScope: 'screen-scoped' | 'global' }
  | { readonly kind: 'world-observation'; readonly substrate: 'synthetic' | 'fixture-replay' | 'production' }
  | { readonly kind: 'external-source'; readonly sourceTag: string }
  | { readonly kind: 'ledger-append'; readonly ledgerName: string }
  | { readonly kind: 'unfixturable'; readonly reason: string };

/** Type reference carried through a TestableSurface. Mirrors the
 *  manifest's `inputs` / `outputs` field shape but narrowed to the
 *  two fields the surface cares about. */
export interface TestableSurfaceType {
  readonly name: string;
  readonly declaredIn: string;
}

/** The five-tuple the workshop probes. */
export interface TestableSurface {
  readonly verb: string;
  readonly category: VerbCategory;
  readonly inputType: TestableSurfaceType;
  readonly outputType: TestableSurfaceType;
  readonly errorFamilies: readonly string[];
  readonly compositionPath: CompositionPath;
}

/** Default composition-path classifier. Used when a fixture does
 *  not override. The mapping is category-driven: nine categories,
 *  each mapping to the path kind that best reflects the substrate
 *  dependency the verb's harness needs. Fixtures may still override
 *  per-verb (e.g. declaring `compositionPath: world-observation` on
 *  a `memory` category verb that genuinely reaches for live DOM). */
export function defaultCompositionPathForCategory(category: VerbCategory): CompositionPath {
  switch (category) {
    case 'intent':
      return { kind: 'external-source', sourceTag: 'ado' };
    case 'observe':
      return { kind: 'world-observation', substrate: 'synthetic' };
    case 'mutation':
      return { kind: 'world-observation', substrate: 'synthetic' };
    case 'compose':
      return { kind: 'atomic' };
    case 'memory':
      // Memory verbs split into reads (facet-query) and writes
      // (facet-mint, facet-enrich, locator-health-track). The
      // default lands read; writes override via fixture spec or
      // the classifier consults the verb's name prefix.
      return { kind: 'memory-read', catalogScope: 'global' };
    case 'reason':
      // Reasoning.select/interpret are typically unfixturable
      // because the prompt space is open-ended; fixture specs
      // that provide concrete prompts can override with `atomic`.
      return { kind: 'unfixturable', reason: 'open-prompt reasoning surface' };
    case 'execute':
      // test-execute runs a compiled spec against a browser;
      // same substrate dependency as world-observation.
      return { kind: 'world-observation', substrate: 'synthetic' };
    case 'governance':
      // Proposal emission, trust-policy gate — append to the
      // proposal ledger. No live world, no catalog read.
      return { kind: 'ledger-append', ledgerName: 'proposals' };
    case 'diagnostic':
      // Inspection / debug verbs are atomic by default; the
      // diagnostic surface is itself product-internal state.
      return { kind: 'atomic' };
    default: {
      const exhaust: never = category;
      return exhaust;
    }
  }
}

/** Project one VerbEntry into its TestableSurface. Pure. */
export function projectVerbToTestableSurface(verb: VerbEntry): TestableSurface {
  return {
    verb: verb.name,
    category: verb.category,
    inputType: { name: verb.inputs.typeName, declaredIn: verb.inputs.declaredIn },
    outputType: { name: verb.outputs.typeName, declaredIn: verb.outputs.declaredIn },
    errorFamilies: verb.errorFamilies,
    compositionPath: defaultCompositionPathForCategory(verb.category),
  };
}

/** Project a whole Manifest into the set of TestableSurfaces it
 *  declares. One surface per verb. Pure. */
export function projectManifestToTestableSurfaces(
  manifest: Manifest,
): readonly TestableSurface[] {
  return manifest.verbs.map(projectVerbToTestableSurface);
}

/** Exhaustive fold over the composition-path kinds. Enforces
 *  compile-time handling of every path — callers that add a new
 *  path get a typecheck error until they add a case. This is the
 *  pattern the rest of product/domain/ uses for discriminated
 *  unions (see foldGovernance, foldReasoningError, foldProposalKind). */
export function foldCompositionPath<R>(
  path: CompositionPath,
  cases: {
    readonly atomic: (p: Extract<CompositionPath, { kind: 'atomic' }>) => R;
    readonly memoryRead: (p: Extract<CompositionPath, { kind: 'memory-read' }>) => R;
    readonly memoryWrite: (p: Extract<CompositionPath, { kind: 'memory-write' }>) => R;
    readonly worldObservation: (p: Extract<CompositionPath, { kind: 'world-observation' }>) => R;
    readonly externalSource: (p: Extract<CompositionPath, { kind: 'external-source' }>) => R;
    readonly ledgerAppend: (p: Extract<CompositionPath, { kind: 'ledger-append' }>) => R;
    readonly unfixturable: (p: Extract<CompositionPath, { kind: 'unfixturable' }>) => R;
  },
): R {
  switch (path.kind) {
    case 'atomic':
      return cases.atomic(path);
    case 'memory-read':
      return cases.memoryRead(path);
    case 'memory-write':
      return cases.memoryWrite(path);
    case 'world-observation':
      return cases.worldObservation(path);
    case 'external-source':
      return cases.externalSource(path);
    case 'ledger-append':
      return cases.ledgerAppend(path);
    case 'unfixturable':
      return cases.unfixturable(path);
  }
}
