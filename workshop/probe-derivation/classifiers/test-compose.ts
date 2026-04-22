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
 * test-compose's manifest entry declares three error families
 * (post Gap-4 resolution in probe-spike-verdict-02 → Slice C):
 *   - `assertion-like`: the handler's input-shape validator
 *     threw. The validator IS an assertion, so this is the
 *     closest semantic family.
 *   - `malformed-response`: output generation failed (e.g., AST
 *     print threw). Not fired at rung 2 — rung 3+ wires it.
 *   - `unclassified`: any failure that doesn't match a named family.
 *
 * Shape-validation failure routes to `assertion-like`. Non-object
 * inputs fall back to `unclassified` because they don't even reach
 * the validator's assertion path.
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
function isRecordInput(input: unknown): input is Record<string, unknown> {
  return isRecord(input);
}

function classifyTestCompose(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (isTestComposeShape(probe.input)) {
    return Effect.succeed({ classification: 'matched', errorFamily: null });
  }
  // An input that is at least a mapping routes through the
  // validator's assertion path → assertion-like. A non-object
  // input falls back to unclassified (it cannot even be asserted
  // over). Both cases classify as failed.
  const errorFamily = isRecordInput(probe.input) ? 'assertion-like' : 'unclassified';
  return Effect.succeed({ classification: 'failed', errorFamily });
}

/** The test-compose classifier registration. Consumed by
 *  createDefaultVerbClassifierRegistry. */
export const testComposeClassifier: VerbClassifier = {
  verb: 'test-compose',
  classify: classifyTestCompose,
};
