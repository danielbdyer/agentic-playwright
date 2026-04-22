/**
 * Canonical agent tasks — one per declared verb, each encoding the
 * smallest agent-facing task the verb should successfully dispatch
 * against.
 *
 * The dispatch harness (`dispatch-harness.laws.spec.ts`) asserts:
 *
 *   - Every verb in `product/manifest/manifest.json` has a
 *     canonical task here.
 *   - Every canonical task names a verb that exists in the manifest.
 *   - The naive task-intent → verb-name dispatcher routes each
 *     task to its declared verb.
 *
 * This is a structural fluency test, not a behavioral one — it
 * verifies the declaration-and-routing contract, not that the verb
 * implementation produces the expected output. Behavioral fluency
 * is exercised through the downstream instrument tests and the
 * manifest-derived probe IR + fixture-replay harness
 * (Step 5 / Step 5.5).
 */

/** A canonical agent-facing task bound to a single verb. The task
 *  prompt is the kind of sentence a new agent session might receive
 *  that should dispatch to the named verb. */
export interface CanonicalTask {
  /** Manifest verb name this task is canonical for. */
  readonly verb: string;
  /** Short prompt the agent would receive. */
  readonly prompt: string;
  /** Human-legible description of why this is the canonical case
   *  for the verb. */
  readonly rationale: string;
}

export const CANONICAL_TASKS: readonly CanonicalTask[] = [
  {
    verb: 'intent-fetch',
    prompt: 'Fetch ADO work item #10001 and return the raw payload.',
    rationale: 'Smallest case for the intent-source verb — one work item, ADO source, no parsing.',
  },
  {
    verb: 'observe',
    prompt: 'Capture an ARIA snapshot of the current page.',
    rationale: 'Smallest case for the observe verb — snapshot the whole page with default options.',
  },
  {
    verb: 'interact',
    prompt: 'Click the "Search" button on the policy-search screen.',
    rationale: 'Smallest case for the interact verb — one action, one affordance, deterministic locator.',
  },
  {
    verb: 'test-compose',
    prompt: 'Compose a Playwright test from a three-step grounded flow.',
    rationale: 'Smallest case for the test-compose verb — one flow, three facet-referenced steps, pre-generated facade.',
  },
  {
    verb: 'facet-mint',
    prompt: 'Mint a new element facet for the policy-search "Clear" button observed once.',
    rationale: 'Smallest case for facet-mint — one element facet, one observation, deterministic stable ID.',
  },
  {
    verb: 'facet-query',
    prompt: 'Find the facet whose displayName or alias matches "Policy Number field".',
    rationale: 'Smallest case for facet-query — intent-phrase lookup returning exactly one match.',
  },
  {
    verb: 'facet-enrich',
    prompt: 'Add the observed alias "Claim Ref" to the existing `claims-search:claimIdInput` facet.',
    rationale: 'Smallest case for facet-enrich — append one alias without rewriting the facet ID.',
  },
  {
    verb: 'locator-health-track',
    prompt: 'Record a successful role-based locator resolution for the policy-search "Search" button.',
    rationale: 'Smallest case for locator-health-track — one success on the role rung updates the co-located health aggregate.',
  },
  {
    verb: 'navigate',
    prompt: 'Navigate the active page to `/about-blank` with the default wait strategy.',
    rationale: 'Smallest case for navigate — single URL transition with no upstream failure; the substrate serves the React shell at any path.',
  },
];
