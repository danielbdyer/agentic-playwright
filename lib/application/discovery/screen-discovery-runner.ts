/**
 * Screen discovery runner — adapter that wraps the existing
 * `discoverScreenScaffold` infrastructure tooling and presents it
 * as a typed `DiscoveryRunner` per the canon-and-derivation
 * doctrine § 9.1.
 *
 * The runner is currently a STUB at the invocation level: it does
 * not actually call `discoverScreenScaffold` because that function
 * requires a Playwright browser session and is currently CLI-only.
 * Phase 3 wires the actual invocation when the iterate loop is
 * ready to run discovery as part of cold mode. For Phase 0d the
 * runner exists so the lookup chain can be passed a registry that
 * knows about it, and the decomposer can be unit-tested with
 * synthesized DiscoveryRun fixtures.
 *
 * The runner declares which atom classes it produces:
 *   - 'screen' (one per run)
 *   - 'surface' (one per DiscoveryObservedSurface)
 *   - 'element' (one per DiscoveryObservedElement)
 *   - 'selector' (one per probe with a non-null element)
 *   - 'snapshot' (one per snapshotHash)
 *   - 'transition' (one per TransitionObservation)
 *   - 'observation-predicate' (one per stateObservation)
 *
 * NOT produced by this runner:
 *   - route, route-variant: come from harvest-routes runner
 *   - posture, posture-sample: come from substrate growth in iterate
 *   - affordance: future, derived from element behavior signals
 *   - pattern: from pattern promotion (cross-screen recurrence)
 *   - drift-mode: from drift detection (future)
 *   - resolution-override: from operator/agent decisions, not
 *     discovery
 */

import { Effect } from 'effect';
import type { DiscoveryRun } from '../../domain/target/interface-graph';
import type { AtomClass } from '../../domain/pipeline/atom-address';
import type {
  DiscoveryRunner,
  DiscoveryRunInput,
  DiscoveryRunOutput,
} from './discovery-runner';

/** Atom classes the screen-scaffold runner is statically declared
 *  to produce. The actual `producedClasses` returned by a run may
 *  be a subset (e.g. if no transitions were observed). */
export const SCREEN_DISCOVERY_PRODUCED_CLASSES: readonly AtomClass[] = [
  'screen',
  'surface',
  'element',
  'selector',
  'snapshot',
  'transition',
  'observation-predicate',
];

/** Stable runner identifier — used in atom provenance and the
 *  registry. */
export const SCREEN_DISCOVERY_RUNNER_ID = 'discovery.screen-scaffold';

/** Construct a screen discovery runner.
 *
 *  The factory takes an optional `runImpl` parameter so callers
 *  can inject the actual `discoverScreenScaffold` implementation
 *  at composition root time. When `runImpl` is omitted, the runner
 *  fails with a structured "not yet wired" error if invoked. The
 *  doctrine: the runner exists in the typed surface from day one;
 *  the actual implementation is wired lazily as the discovery
 *  infrastructure matures. */
export function createScreenDiscoveryRunner(
  options: {
    /** Inject the existing `discoverScreenScaffold` here when
     *  ready. The signature accepts a subset of its options
     *  matching what `DiscoveryRunInput.context` provides. */
    readonly runImpl?: (
      input: DiscoveryRunInput,
    ) => Effect.Effect<DiscoveryRun, Error, never>;
  } = {},
): DiscoveryRunner<never, Error> {
  return {
    id: SCREEN_DISCOVERY_RUNNER_ID,
    surface: 'screen-scaffold',
    run: (input) =>
      Effect.gen(function* () {
        if (options.runImpl === undefined) {
          return yield* Effect.fail(
            new Error(
              `${SCREEN_DISCOVERY_RUNNER_ID} not wired yet (Phase 0d stub). ` +
                `Pass runImpl when constructing the runner to enable cold derivation.`,
            ),
          );
        }
        const run = yield* options.runImpl(input);
        const output: DiscoveryRunOutput = {
          run,
          producedClasses: SCREEN_DISCOVERY_PRODUCED_CLASSES,
        };
        return output;
      }),
  };
}
