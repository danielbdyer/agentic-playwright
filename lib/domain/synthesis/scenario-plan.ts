import { hashSeed, createSeededRng, type SeededRng } from '../kernel/random';
import { sha256, stableStringify } from '../kernel/hash';
import type { AdoSnapshot } from '../intent/types';
import { createAdoId } from '../kernel/identity';

export type { AdoSnapshot } from '../intent/types';
import {
  selectArchetype,
  composeWorkflowSteps,
  type ArchetypeSelectionPreference,
} from './workflow-archetype';

// ─── Public types ───

export interface PostureValue {
  readonly posture: string;
  readonly values: readonly string[];
}

export interface ScreenElementPlanInput {
  readonly elementId: string;
  readonly widget: string;
  readonly aliases: readonly string[];
  readonly required: boolean;
  /** Posture-driven values for data variation (e.g. valid, invalid, empty). */
  readonly postureValues?: readonly PostureValue[];
}

export interface ScreenPlanInput {
  readonly screenId: string;
  readonly screenAliases: readonly string[];
  readonly elements: readonly ScreenElementPlanInput[];
}

export interface SyntheticCatalogPlanInput {
  readonly screens: readonly ScreenPlanInput[];
}

// ─── Perturbation config ───
//
// Controls the calibrated gap between generated step text and the knowledge model's
// alias pools. Higher values produce text that is harder for the translation pipeline
// to resolve, which tests genuine generalization rather than echo-chamber matching.

export interface PerturbationConfig {
  /**
   * Lexical gap distance [0, 1].
   * - 0: Use known aliases verbatim (echo chamber — should always resolve)
   * - 1: Use fully held-out domain vocabulary (maximum gap — tests generalization)
   * - 0.3–0.7: The interesting range where pipeline quality is differentiated
   */
  readonly lexicalGap: number;
  /** Probability of using posture-driven data values instead of generic placeholders [0, 1]. */
  readonly dataVariation: number;
  /** Probability of omitting optional steps [0, 1]. */
  readonly coverageGap: number;
  /** Controls cross-screen journey probability [0, 1]. */
  readonly crossScreen: number;
}

export const ZERO_PERTURBATION: PerturbationConfig = {
  lexicalGap: 0, dataVariation: 0, coverageGap: 0, crossScreen: 0,
};

const clampUnitInterval = (value: number): number => Math.max(0, Math.min(1, value));

export function resolvePerturbation(rate?: number, config?: Partial<PerturbationConfig>): PerturbationConfig {
  const resolved = config
    ? { ...ZERO_PERTURBATION, ...config }
    : rate !== undefined && rate > 0
      ? { ...ZERO_PERTURBATION, lexicalGap: rate }
      : ZERO_PERTURBATION;

  return {
    lexicalGap: clampUnitInterval(resolved.lexicalGap),
    dataVariation: clampUnitInterval(resolved.dataVariation),
    coverageGap: clampUnitInterval(resolved.coverageGap),
    crossScreen: clampUnitInterval(resolved.crossScreen),
  };
}

// ─── Internal types ───

interface SyntheticStep {
  readonly index: number;
  readonly intent: string;
  readonly action_text: string;
  readonly expected_text: string;
}

interface ScenarioPlanInternal {
  readonly adoId: string;
  readonly screenId: string;
  readonly title: string;
  readonly suite: string;
  readonly tags: readonly string[];
  readonly steps: readonly SyntheticStep[];
}

interface CoverageAwareStep {
  readonly required: boolean;
  readonly role: 'navigation' | 'interaction' | 'verification';
}

export interface ScenarioPlan {
  readonly adoId: string;
  readonly screenId: string;
  readonly title: string;
  readonly suite: string;
  readonly fileName: string;
  readonly yaml: string;
  readonly fingerprint: string;
  /** Structured ADO source the scenario YAML was derived from. The
   *  scenario generators write this to `fixtures/ado/{adoId}.json`
   *  alongside the YAML so iterate's compile phase can resolve it. */
  readonly adoSnapshot: AdoSnapshot;
}

export interface ScenarioPlanningInput {
  readonly catalog: SyntheticCatalogPlanInput;
  readonly seed: string;
  readonly count: number;
  readonly baseId?: number;
  readonly perturbationRate?: number;
  readonly perturbation?: Partial<PerturbationConfig>;
  readonly validationSplit?: number;
  /** Optional cohort-specific archetype selection bias. When set, the
   *  planner uses these weights instead of the default
   *  classification-driven candidate pool. */
  readonly archetypePreference?: ArchetypeSelectionPreference;
  /** Optional cohort label. When set, the rendered scenario `suite`
   *  metadata field becomes `reference/{cohortLabel}` instead of the
   *  default `synthetic/{screen}`. The orchestrator uses this to keep
   *  the YAML metadata aligned with the on-disk cohort organization. */
  readonly cohortLabel?: string;
}

export interface ScenarioPlanningResult {
  readonly plans: readonly ScenarioPlan[];
  readonly screens: readonly string[];
  readonly screenDistribution: ReadonlyArray<{ readonly screen: string; readonly count: number }>;
}

// ─── YAML rendering ───

const deterministicSyncedAt = (seed: string): string => {
  const days = hashSeed(seed) % 3650;
  const base = Date.parse('2020-01-01T00:00:00.000Z');
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
};

const renderYaml = (plan: ScenarioPlanInternal, syncedAt: string): string => {
  const q = (value: string): string => (value.includes(':') ? `"${value.replace(/"/g, '\\"')}"` : value);
  return [
    'source:',
    `  ado_id: "${plan.adoId}"`,
    '  revision: 1',
    `  content_hash: sha256:synthetic-${plan.adoId}`,
    `  synced_at: ${syncedAt}`,
    '  origin: synthetic',
    'metadata:',
    `  title: "${plan.title.replace(/"/g, '\\"')}"`,
    `  suite: ${plan.suite}`,
    '  tags:',
    ...['synthetic', 'dogfood', ...plan.tags].map((tag) => `    - ${tag}`),
    '  priority: 2',
    '  status: active',
    '  status_detail: null',
    'preconditions:',
    '  - fixture: demoSession',
    'steps:',
    ...plan.steps.flatMap((step) => [
      `  - index: ${step.index}`,
      `    intent: ${q(step.intent)}`,
      `    action_text: ${q(step.action_text)}`,
      `    expected_text: ${q(step.expected_text)}`,
      '    action: custom',
      '    screen: null',
      '    element: null',
      '    posture: null',
      '    override: null',
      '    snapshot_template: null',
      '    resolution: null',
      '    confidence: intent-only',
    ]),
    'postconditions: []',
  ].join('\n') + '\n';
};

const retainedStepsWithNonNavigationGuarantee = <T extends CoverageAwareStep>(
  archetypeSteps: readonly T[],
  retainedSteps: readonly T[],
): ReadonlySet<T> => {
  const fallbackStep = archetypeSteps.find((step) => step.role !== 'navigation');
  const hasNonNavigationStep = retainedSteps.some((step) => step.role !== 'navigation');
  return new Set(
    !hasNonNavigationStep && fallbackStep !== undefined
      ? [...retainedSteps, fallbackStep]
      : retainedSteps,
  );
};

// ─── Scenario composition via workflow archetypes ───
//
// Instead of randomly picking elements and applying templates from the alias pool
// (echo chamber), scenarios are composed as coherent QA workflows. Each workflow
// archetype represents a real testing pattern (search-verify, detail-inspect, etc.)
// and generates step text at a calibrated lexical gap distance from known aliases.
//
// At lexicalGap=0 the text uses known aliases (baseline, should always resolve).
// At lexicalGap=1 the text uses held-out domain vocabulary (maximum gap, tests generalization).
// The translation pipeline's quality is measured by how well it bridges this gap.

const generateScenario = (
  screen: ScreenPlanInput,
  scenarioIndex: number,
  screens: readonly ScreenPlanInput[],
  perturbation: PerturbationConfig,
  rng: SeededRng,
  archetypePreference?: ArchetypeSelectionPreference,
  cohortLabel?: string,
): ScenarioPlanInternal => {
  const archetypeId = selectArchetype(screen, screens, rng, perturbation.crossScreen, archetypePreference);
  const isCrossScreen = archetypeId === 'cross-screen-journey';

  const archetypeSteps = composeWorkflowSteps(archetypeId, {
    screens,
    primaryScreen: screen,
    lexicalGap: perturbation.lexicalGap,
    dataVariation: perturbation.dataVariation,
    rng,
  });

  const retainedSteps = archetypeSteps
    .filter((step) => step.required || rng() >= perturbation.coverageGap);
  const retainedSet = retainedStepsWithNonNavigationGuarantee(archetypeSteps, retainedSteps);

  const steps = archetypeSteps
    .filter((step) => retainedSet.has(step))
    .map((step, idx) => ({
      index: idx + 1,
      intent: step.intent,
      action_text: step.actionText,
      expected_text: step.expectedText,
    }));

  const primary = screen.screenId;
  const suite = cohortLabel !== undefined
    ? `reference/${cohortLabel}`
    : `synthetic/${isCrossScreen ? 'cross-screen' : primary}`;
  return {
    adoId: String(20000 + scenarioIndex),
    screenId: isCrossScreen ? 'cross-screen' : primary,
    title: `Synthetic ${archetypeId} ${scenarioIndex}: ${primary}`,
    suite,
    tags: [],
    steps,
  };
};

// ─── Main entry point ───

export function planSyntheticScenarios(input: ScenarioPlanningInput): ScenarioPlanningResult {
  const rng = createSeededRng(input.seed);
  const perturbation = resolvePerturbation(input.perturbationRate, input.perturbation);
  const screens = input.catalog.screens;
  const syncedAt = deterministicSyncedAt(input.seed);
  const baseId = input.baseId ?? 20000;

  const plans = Array.from({ length: input.count }, (_, index) => {
    const screen = screens[index % Math.max(screens.length, 1)]
      ?? { screenId: 'empty', screenAliases: ['empty'], elements: [] };

    const scenario = generateScenario(
      screen,
      index,
      screens,
      perturbation,
      rng,
      input.archetypePreference,
      input.cohortLabel,
    );
    const adoId = String(baseId + index);
    const materialized = { ...scenario, adoId };
    const split = input.validationSplit && input.validationSplit > 0 && rng() < input.validationSplit
      ? ['validation-heldout']
      : ['training'];
    const yaml = renderYaml({ ...materialized, tags: split }, syncedAt);
    // Build the structured ADO snapshot in parallel with the YAML so
    // iterate's compile phase can resolve fixtures/ado/{adoId}.json.
    // Action and expected text are wrapped in <p> to match the
    // hand-curated demo fixture format. Synthetic snapshots fill all
    // canonical AdoSnapshot fields with deterministic values.
    const suitePath = materialized.suite;
    const areaPath = suitePath.split('/')[0] ?? 'synthetic';
    const adoSnapshotContentHash = `sha256:${sha256(stableStringify({
      adoId,
      title: materialized.title,
      suitePath,
      stepCount: materialized.steps.length,
    }))}`;
    const adoSnapshot: AdoSnapshot = {
      id: createAdoId(adoId),
      revision: 1,
      title: materialized.title,
      suitePath,
      areaPath,
      iterationPath: 'synthetic',
      tags: ['synthetic', ...split],
      priority: 2,
      steps: materialized.steps.map((step) => ({
        index: step.index,
        action: `<p>${step.action_text}</p>`,
        expected: `<p>${step.expected_text}</p>`,
      })),
      parameters: [],
      dataRows: [],
      contentHash: adoSnapshotContentHash,
      syncedAt: syncedAt,
    };
    return {
      adoId,
      screenId: materialized.screenId,
      title: materialized.title,
      suite: materialized.suite,
      fileName: `${adoId}.scenario.yaml`,
      yaml,
      fingerprint: `sha256:${sha256(stableStringify({ adoId, yaml }))}`,
      adoSnapshot,
    } satisfies ScenarioPlan;
  });

  // Phase 2.4 / T7 Big-O fix: single-pass O(N) counter.
  const screenDistributionMap = ((): ReadonlyMap<string, number> => {
    const acc = new Map<string, number>();
    for (const plan of plans) {
      acc.set(plan.screenId, (acc.get(plan.screenId) ?? 0) + 1);
    }
    return acc;
  })();

  return {
    plans,
    screens: screens.map((screen) => screen.screenId),
    screenDistribution: [...screenDistributionMap.entries()]
      .map(([screen, count]) => ({ screen, count }))
      .sort((left, right) => right.count - left.count),
  };
}
