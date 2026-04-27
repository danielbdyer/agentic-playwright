/**
 * Playwright-live scenario harness — rung-3 substrate.
 *
 * Per docs/v2-scenario-corpus-plan.md §7.S7, this harness drives
 * scenarios against a real Chromium page mounted on the synthetic
 * substrate server. The substrate's React renderers (FormRenderer
 * et al.) realize state evolution natively — submit clicks fire
 * real submit handlers, success alerts mount in the live DOM,
 * subsequent observe steps see the new world.
 *
 * The page persists across steps within one session — this is the
 * realistic case (cookies, in-memory state, navigation history all
 * carry through). `clearStateBetweenSteps: true` causes the
 * harness to reload the page between every step, isolating them.
 *
 * Like the rung-3 probe harness, this is scope-bound: the
 * `runPlaywrightLiveScenarioSpike` runner acquires server +
 * browser via Effect.scoped and releases them on completion.
 */

import { Effect } from 'effect';
import type { Page } from '@playwright/test';
import {
  lookupClassifier,
  type VerbClassifierRegistry,
} from '../../probe-derivation/verb-classifier';
import { createDefaultVerbClassifierRegistry } from '../../probe-derivation/classifiers/default-registry';
import {
  lookupRung3Classifier,
  type Rung3ClassifierRegistry,
} from '../../probe-derivation/classifiers/rung-3/port';
import { createDefaultRung3ClassifierRegistry } from '../../probe-derivation/classifiers/rung-3/registry';
import {
  lookupTopology,
  type TestTopologyRegistry,
} from '../../substrate/test-topology';
import { createDefaultTopologyRegistry } from '../../substrate/test-topology-catalog';
import {
  serializeWorldShapeToUrl,
  type WorldShape,
} from '../../substrate/world-shape';
import type { SurfaceRole } from '../../substrate/surface-spec';
import type { HeadedHarness } from '../../../product/instruments/tooling/headed-harness';
import {
  ASSERTION_HELD,
  assertionViolated,
  foldSubstrateAssertion,
  type AssertionOutcome,
  type SubstrateAssertion,
} from '../domain/assertion';
import {
  type Invariant,
  type InvariantOutcome,
} from '../domain/invariant';
import { evaluateInvariantPure } from '../application/evaluate-invariants';
import {
  sessionOpenFailed,
  stepExecutionFailed,
  type ScenarioError,
} from '../domain/scenario-error';
import type { Scenario } from '../domain/scenario';
import type { StepOutcome, AssertionRun } from '../domain/scenario-trace';
import type {
  ScenarioHarnessService,
  SessionHandle,
} from '../application/scenario-harness-port';

interface PlaywrightLiveSession {
  readonly kind: 'playwright-live-session';
  readonly scenarioId: string;
  readonly page: Page;
  readonly baseUrl: string;
  readonly worldShape: WorldShape;
}

export interface PlaywrightLiveScenarioHarnessOptions {
  readonly appUrl: string;
  readonly harness: HeadedHarness;
  readonly verbClassifiers?: VerbClassifierRegistry;
  readonly rung3Classifiers?: Rung3ClassifierRegistry;
  readonly topologyRegistry?: TestTopologyRegistry;
  readonly now?: () => Date;
}

export function createPlaywrightLiveScenarioHarness(
  opts: PlaywrightLiveScenarioHarnessOptions,
): ScenarioHarnessService {
  const verbClassifiers = opts.verbClassifiers ?? createDefaultVerbClassifierRegistry();
  const rung3Classifiers = opts.rung3Classifiers ?? createDefaultRung3ClassifierRegistry();
  const topologyRegistry = opts.topologyRegistry ?? createDefaultTopologyRegistry();
  const now = opts.now ?? (() => new Date());
  const page = opts.harness.page as unknown as Page;

  return {
    tag: 'scenario-playwright-live',

    openSession: (scenario: Scenario) =>
      Effect.gen(function* () {
        const topology = lookupTopology(topologyRegistry, scenario.topology.preset);
        if (topology === null) {
          return yield* Effect.fail<ScenarioError>(
            sessionOpenFailed(scenario.id, `unknown topology preset "${scenario.topology.preset}"`),
          );
        }
        const worldShape: WorldShape = scenario.entropy === undefined
          ? { surfaces: topology.surfaces }
          : { surfaces: topology.surfaces, entropy: scenario.entropy };
        const url = serializeWorldShapeToUrl(opts.appUrl, worldShape);
        yield* Effect.promise(() => page.goto(url, { timeout: 5_000 }));
        // Settle: give React a moment to mount.
        yield* Effect.promise(() => page.waitForTimeout(50));
        const session: PlaywrightLiveSession = {
          kind: 'playwright-live-session',
          scenarioId: scenario.id,
          page,
          baseUrl: opts.appUrl,
          worldShape,
        };
        return session as SessionHandle;
      }),

    closeSession: (_session: SessionHandle) => Effect.void,

    executeStep: (sessionHandle, step, _previous) =>
      Effect.gen(function* () {
        const session = sessionHandle as PlaywrightLiveSession;
        const startedAt = now();

        if (step.worldInheritance === 'reset') {
          // Re-render the world to reset session-level state.
          const url = serializeWorldShapeToUrl(session.baseUrl, session.worldShape);
          yield* Effect.promise(() => session.page.goto(url, { timeout: 5_000 }));
          yield* Effect.promise(() => session.page.waitForTimeout(50));
        }

        const preconditionOutcomes: AssertionRun[] = [];
        for (const a of step.preconditions) {
          const outcome = yield* evaluateAssertionEffect(session, a);
          preconditionOutcomes.push({ assertion: a, outcome });
        }

        // Delegate to a rung-3 classifier when registered for this
        // verb (observe/interact today); otherwise fall back to the
        // rung-2 classifier with a synthesized worldSetup.
        const rung3 = lookupRung3Classifier(rung3Classifiers, step.probe.verb);
        const rung2 = lookupClassifier(verbClassifiers, step.probe.verb);
        const observed = rung3 !== null
          ? yield* rung3.classify(step.probe, session.page).pipe(
              Effect.catchAll(() => Effect.succeed({ classification: 'failed' as const, errorFamily: 'unclassified' as const })),
            )
          : rung2 !== null
            ? yield* rung2
                .classify({ ...step.probe, worldSetup: { surfaces: session.worldShape.surfaces } })
                .pipe(
                  Effect.catchAll(() => Effect.succeed({ classification: 'failed' as const, errorFamily: 'unclassified' as const })),
                )
            : { classification: 'ambiguous' as const, errorFamily: null };

        const postconditionOutcomes: AssertionRun[] = [];
        for (const a of step.postconditions) {
          const outcome = yield* evaluateAssertionEffect(session, a);
          postconditionOutcomes.push({ assertion: a, outcome });
        }

        const completedAt = now();
        const completedAsExpected =
          observed.classification === step.expected.classification &&
          observed.errorFamily === step.expected.errorFamily;

        const outcome: StepOutcome = {
          stepName: step.name,
          probeReceiptRef: { probeId: step.probe.id },
          observed,
          preconditionOutcomes,
          postconditionOutcomes,
          elapsedMs: completedAt.getTime() - startedAt.getTime(),
          completedAsExpected,
        };
        return outcome;
      }).pipe(
        Effect.catchAll((cause) =>
          Effect.fail<ScenarioError>(
            stepExecutionFailed(step.name, cause instanceof Error ? cause.message : String(cause)),
          ),
        ),
      ),

    evaluateAssertion: (sessionHandle, assertion) =>
      evaluateAssertionEffect(sessionHandle as PlaywrightLiveSession, assertion),

    evaluateInvariant: (_session, invariant: Invariant, trace) =>
      Effect.sync<InvariantOutcome>(() => evaluateInvariantPure(invariant, trace)),
  };
}

// ─── Live assertion evaluation (queries the real DOM) ───

function evaluateAssertionEffect(
  session: PlaywrightLiveSession,
  assertion: SubstrateAssertion,
): Effect.Effect<AssertionOutcome, ScenarioError, never> {
  return Effect.tryPromise({
    try: async () =>
      foldSubstrateAssertion(assertion, {
        surfacePresent: async (a) => await checkSurfacePresent(session, a.target.role, a.target.name),
        surfaceAbsent: async (a) => await checkSurfaceAbsent(session, a.target.role, a.target.name),
        surfaceHasValue: async (a) => await checkSurfaceHasValue(session, a.target.role, a.target.name, a.expectedValue),
        surfaceIsFocused: async (a) => await checkSurfaceIsFocused(session, a.target.role, a.target.name),
        surfaceCount: async (a) => await checkSurfaceCount(session, a.role, a.count),
      }) as unknown as AssertionOutcome | Promise<AssertionOutcome>,
    catch: (cause) =>
      stepExecutionFailed(
        'assertion-eval',
        cause instanceof Error ? cause.message : String(cause),
      ),
  }).pipe(Effect.flatMap((value) => Effect.promise(async () => await Promise.resolve(value))));
}

function domSelector(role: string, name?: string): string {
  return name !== undefined
    ? `[data-surface-role="${role}"][data-surface-name="${cssEscape(name)}"]`
    : `[data-surface-role="${role}"]`;
}

function cssEscape(value: string): string {
  return value.replace(/"/g, '\\"');
}

async function checkSurfacePresent(
  session: PlaywrightLiveSession,
  role: SurfaceRole,
  name?: string,
): Promise<AssertionOutcome> {
  const locator = session.page.locator(domSelector(role, name));
  const count = await locator.count();
  if (count === 0) {
    return assertionViolated('not in DOM', `${role}/${name ?? '*'} present`);
  }
  const visible = await locator.first().isVisible();
  return visible ? ASSERTION_HELD : assertionViolated('hidden', `${role}/${name ?? '*'} visible`);
}

async function checkSurfaceAbsent(
  session: PlaywrightLiveSession,
  role: SurfaceRole,
  name?: string,
): Promise<AssertionOutcome> {
  const locator = session.page.locator(domSelector(role, name));
  const count = await locator.count();
  return count === 0
    ? ASSERTION_HELD
    : assertionViolated(`count=${count}`, `${role}/${name ?? '*'} absent`);
}

async function checkSurfaceHasValue(
  session: PlaywrightLiveSession,
  role: SurfaceRole,
  name: string,
  expectedValue: string,
): Promise<AssertionOutcome> {
  const locator = session.page.locator(domSelector(role, name));
  const count = await locator.count();
  if (count === 0) {
    return assertionViolated('not present', `${role}/${name}=${expectedValue}`);
  }
  const value = await locator.first().inputValue().catch(() => '');
  return value === expectedValue
    ? ASSERTION_HELD
    : assertionViolated(value, expectedValue);
}

async function checkSurfaceIsFocused(
  session: PlaywrightLiveSession,
  role: SurfaceRole,
  name?: string,
): Promise<AssertionOutcome> {
  const locator = session.page.locator(domSelector(role, name));
  const count = await locator.count();
  if (count === 0) {
    return assertionViolated('not present', `${role}/${name ?? '*'} focused`);
  }
  const focused = await locator.first().evaluate((el) => el === document.activeElement);
  return focused
    ? ASSERTION_HELD
    : assertionViolated('not focused', `${role}/${name ?? '*'} focused`);
}

async function checkSurfaceCount(
  session: PlaywrightLiveSession,
  role: SurfaceRole,
  expectedCount: number,
): Promise<AssertionOutcome> {
  const count = await session.page.locator(`[data-surface-role="${role}"]`).count();
  return count === expectedCount
    ? ASSERTION_HELD
    : assertionViolated(`count=${count}`, `count=${expectedCount}`);
}
