/**
 * test-compose classifier — the first VerbClassifier registered
 * with the fixture-replay harness (scope 3d of Step 5.5).
 *
 * Per docs/v2-probe-ir-spike.md §6.4, a classifier answers the
 * question "what does the verb do with this probe's input?" at the
 * substrate rung it's bound to. This classifier runs at the
 * fixture-replay rung (rung 2 of the four-rung substrate ladder).
 *
 * ## What this classifier actually checks
 *
 * It probes the SHAPE of the input against the test-compose
 * handler's validator in
 * `product/application/manifest/default-handlers.ts`. The handler
 * refuses input that doesn't look like `{ flow: object; imports:
 * { fixtures: string; scenarioContext: string } }` by throwing a
 * message starting with "test-compose expects". That shape check
 * is this classifier's primary surface.
 *
 * ## What this classifier does NOT do
 *
 * It does NOT invoke `renderReadableSpecModule` against the flow.
 * A GroundedSpecFlow has a strict metadata block (adoId, revision,
 * contentHash, title, suite, tags, lifecycle, confidence,
 * governance, fixtures) and strict step shapes that fixture YAMLs
 * cannot reasonably encode. Running the full handler would require
 * fixtures to carry full GroundedSpecFlow payloads inline, which
 * defeats the fixture economy discipline (≤30 lines per fixture).
 *
 * This is the substrate-ladder honesty per memo §8.3: rung 2
 * (fixture-replay) proves the verb's INPUT VALIDATOR classifies
 * shape correctly. Rung 3 (playwright-live) and rung 4 (production)
 * prove full end-to-end semantics against real substrates — but
 * those rungs are Step 6+ work.
 *
 * A probe whose fixture expected outcome depends on post-validator
 * behavior (e.g., "compose succeeds but the emitted module has
 * certain property X") cannot be confirmed at rung 2. The classifier
 * is explicit about the scope: shape-level only.
 *
 * ## Error family classification
 *
 * test-compose's manifest entry declares two error families:
 *   - `malformed-response`: output generation failed (e.g., AST
 *     print threw). At rung 2 this does not fire because we don't
 *     run the AST emitter; always `unclassified` is the fallback.
 *   - `unclassified`: any failure that doesn't match a named family.
 *
 * Shape-validation failure maps to `assertion-like`... except that's
 * NOT in test-compose's manifest error-families list. So we route
 * shape-validation failures to `unclassified`, the closest named
 * family. The fixture's `unknown-facet-fails-assertion` is therefore
 * a known parity mismatch under fixture-replay — documented in
 * probe-spike-verdict-02.md (scope 3f) as a honest signal that
 * either (a) test-compose should add `assertion-like` to its
 * error families, or (b) the fixture should retarget its expectation.
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Pure shape check matching the handler's `isTestComposeInput`
 *  guard in product/application/manifest/default-handlers.ts. */
function isTestComposeShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  if (!isRecord(input['flow'])) return false;
  if (!isRecord(input['imports'])) return false;
  const imports = input['imports'] as Record<string, unknown>;
  return typeof imports['fixtures'] === 'string'
    && typeof imports['scenarioContext'] === 'string';
}

/** Classify a test-compose probe. Pure — no Effect dependencies
 *  beyond the trivial `Effect.succeed` wrapper, because this
 *  classifier runs at rung 2 (fixture-replay) where the substrate
 *  is inert. Higher-rung classifiers will compose with Layers. */
function classifyTestCompose(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  const observed: ProbeOutcome['observed'] = isTestComposeShape(probe.input)
    ? { classification: 'matched', errorFamily: null }
    : { classification: 'failed', errorFamily: 'unclassified' };
  return Effect.succeed(observed);
}

/** The test-compose classifier registration. Consumed by
 *  createDefaultVerbClassifierRegistry. */
export const testComposeClassifier: VerbClassifier = {
  verb: 'test-compose',
  classify: classifyTestCompose,
};
