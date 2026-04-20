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
 * transitional probe set.
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
];
