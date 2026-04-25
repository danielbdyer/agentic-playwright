/**
 * Manifest declarations — the centralized registry of verb entries
 * the manifest emitter reads at build time.
 *
 * Convention: each verb is declared here as a named `declareVerb(...)`
 * call. Declarations reference their implementation modules via
 * `declaredIn`; the fluency harness uses this to verify dispatch.
 *
 * As the construction order progresses, new verb declarations land
 * in this file (or, at Step 3+, move to co-located declaration
 * modules under their home folders). Step 2's seed set is the four
 * verbs the agent's core authoring loop already exercises in v1:
 * `intent-fetch`, `observe`, `interact`, `test-compose`. Additional
 * verbs — `navigate`, facet operations, reasoning operations, drift
 * — land at the step that introduces their shape.
 *
 * See `docs/v2-direction.md §6 Step 2` for the seed-set rationale.
 */

import { declareVerb } from '../domain/manifest/declare-verb';

export const intentFetchVerb = declareVerb({
  name: 'intent-fetch',
  category: 'intent',
  summary: 'Fetch a single work item from the configured intent source (ADO REST, testbed, or a file) and return its raw payload plus revision metadata.',
  inputs: {
    typeName: 'IntentFetchRequest',
    declaredIn: 'product/instruments/intent/live-ado-source.ts',
    summary: 'The work-item address (`{ source: "ado" | "testbed" | "probe"; id: string }`).',
  },
  outputs: {
    typeName: 'WorkItemEnvelope',
    declaredIn: 'product/instruments/intent/live-ado-source.ts',
    summary: 'The fetched work item wrapped with source-text provenance and revision.',
  },
  errorFamilies: ['rate-limited', 'unavailable', 'malformed-response', 'unclassified'],
  sinceVersion: '2.1.0',
  declaredIn: 'product/instruments/intent/live-ado-source.ts',
});

export const observeVerb = declareVerb({
  name: 'observe',
  category: 'observe',
  summary: 'Capture an accessibility-tree snapshot of the current page and return it as a structured ARIA node.',
  inputs: {
    typeName: 'ObserveRequest',
    declaredIn: 'product/instruments/observation/aria.ts',
    summary: 'The page handle plus an optional observation scope (element / region).',
  },
  outputs: {
    typeName: 'AriaSnapshot',
    declaredIn: 'product/instruments/observation/aria.ts',
    summary: 'The ARIA snapshot with timestamp and source fingerprint.',
  },
  errorFamilies: ['timeout', 'not-visible', 'unclassified'],
  sinceVersion: '2.1.0',
  declaredIn: 'product/instruments/observation/aria.ts',
});

export const interactVerb = declareVerb({
  name: 'interact',
  category: 'mutation',
  summary: 'Dispatch a single action (click, input, select, wait) at a facet-referenced locator and return the outcome envelope.',
  inputs: {
    typeName: 'InteractRequest',
    declaredIn: 'product/runtime/widgets/interact.ts',
    summary: 'The action kind + affordance + locator descriptor.',
  },
  outputs: {
    typeName: 'InteractOutcome',
    declaredIn: 'product/runtime/widgets/interact.ts',
    summary: 'The outcome envelope carrying success/failure classification and observed post-state.',
  },
  errorFamilies: ['not-visible', 'not-enabled', 'timeout', 'assertion-like', 'unclassified'],
  sinceVersion: '2.1.0',
  declaredIn: 'product/runtime/widgets/interact.ts',
});

export const testComposeVerb = declareVerb({
  name: 'test-compose',
  category: 'compose',
  summary: 'Emit a QA-legible Playwright test from a grounded flow spec, referencing facets by name (not selectors).',
  inputs: {
    typeName: 'GroundedSpecFlow',
    declaredIn: 'product/domain/intent/types.ts',
    summary: 'The grounded flow whose steps have resolved to facet references and programs.',
  },
  outputs: {
    typeName: 'ComposedTestFile',
    declaredIn: 'product/instruments/codegen/spec-codegen.ts',
    summary: 'The emitted spec file path, the AST digest, and the referenced-facet index.',
  },
  // Gap 4 resolution (probe-spike-verdict-02): the handler's input-
  // shape validator rejects malformed inputs by throwing, and the
  // closest semantic family for a shape-validation error is
  // `assertion-like` — the handler's guard is an assertion. The
  // workshop's test-compose classifier routes shape failures here
  // once this family is declared.
  errorFamilies: ['assertion-like', 'malformed-response', 'unclassified'],
  sinceVersion: '2.1.0',
  declaredIn: 'product/instruments/codegen/spec-codegen.ts',
});

// ─── Step 3 facet verbs ───
//
// Declared with FROZEN signatures; implementations land at Step 7
// (L1 memory substrate). Declaration precedes implementation so
// downstream steps can reason against the shape.

export const facetMintVerb = declareVerb({
  name: 'facet-mint',
  category: 'memory',
  summary: 'Mint a new FacetRecord with atomic-at-mint provenance and a stable ID. Fails when an existing facet at the same stable ID is already present.',
  inputs: {
    typeName: 'FacetMintRequest',
    declaredIn: 'product/domain/memory/facet-record.ts',
    summary: 'The facet payload plus a MintingInstrument tag and run context.',
  },
  outputs: {
    typeName: 'FacetRecord',
    declaredIn: 'product/domain/memory/facet-record.ts',
    summary: 'The newly minted record with provenance header.',
  },
  // A pure in-memory mint has no visibility surface — `not-visible`
  // was a stale holdover from an earlier draft. Gap 1 in
  // workshop/observations/probe-spike-verdict-01.md.
  errorFamilies: ['assertion-like', 'unclassified'],
  sinceVersion: '2.1.0',
  declaredIn: 'product/domain/memory/facet-record.ts',
});

export const facetQueryVerb = declareVerb({
  name: 'facet-query',
  category: 'memory',
  summary: 'Resolve one or more FacetRecords by stable ID, by intent phrase, or by kind-scoped predicate.',
  inputs: {
    typeName: 'FacetQueryRequest',
    declaredIn: 'product/domain/memory/facet-record.ts',
    summary: 'A lookup discriminator: { by: "id" | "intent-phrase" | "kind" }.',
  },
  outputs: {
    typeName: 'FacetQueryResult',
    declaredIn: 'product/domain/memory/facet-record.ts',
    summary: 'Zero or more matching FacetRecords with per-match evidence counts.',
  },
  errorFamilies: ['unclassified'],
  sinceVersion: '2.1.0',
  declaredIn: 'product/domain/memory/facet-record.ts',
});

export const facetEnrichVerb = declareVerb({
  name: 'facet-enrich',
  category: 'memory',
  summary: 'Extend an existing FacetRecord with additional evidence (new aliases, locator-strategy observations, refined predicates). Does not rewrite the stable ID.',
  inputs: {
    typeName: 'FacetEnrichmentProposal',
    declaredIn: 'product/domain/memory/facet-record.ts',
    summary: 'A proposal envelope carrying the facet ID and the evidence to append.',
  },
  outputs: {
    typeName: 'FacetRecord',
    declaredIn: 'product/domain/memory/facet-record.ts',
    summary: 'The record reflecting the applied enrichment (on-read derivation; evidence log is source of truth).',
  },
  errorFamilies: ['assertion-like', 'unclassified'],
  sinceVersion: '2.1.0',
  declaredIn: 'product/domain/memory/facet-record.ts',
});

export const locatorHealthTrackVerb = declareVerb({
  name: 'locator-health-track',
  category: 'memory',
  summary: 'Record a locator-strategy attempt against an element facet, updating the co-located per-strategy health aggregate.',
  inputs: {
    typeName: 'LocatorHealthAttempt',
    declaredIn: 'product/domain/memory/locator-health.ts',
    summary: 'The facet ID, the strategy kind, and the attempt outcome.',
  },
  outputs: {
    typeName: 'LocatorStrategyHealth',
    declaredIn: 'product/domain/memory/locator-health.ts',
    summary: 'The updated health aggregate for the named strategy.',
  },
  errorFamilies: ['unclassified'],
  sinceVersion: '2.1.0',
  declaredIn: 'product/domain/memory/locator-health.ts',
});

export const navigateVerb = declareVerb({
  name: 'navigate',
  category: 'mutation',
  summary: 'Navigate the active page to a new URL. The substrate reads the destination URL and renders the new world at that address.',
  inputs: {
    typeName: 'NavigateRequest',
    declaredIn: 'product/runtime/navigation/navigate.ts',
    summary: 'The destination URL plus an optional wait strategy.',
  },
  outputs: {
    typeName: 'NavigateOutcome',
    declaredIn: 'product/runtime/navigation/navigate.ts',
    summary: 'The reached URL, status code, and elapsed navigation time.',
  },
  errorFamilies: ['unavailable', 'timeout', 'unclassified'],
  sinceVersion: '2.2.0',
  declaredIn: 'product/runtime/navigation/navigate.ts',
});
