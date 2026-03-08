import type { Page } from '@playwright/test';
import { normalizeIntentText } from '../domain/inference';
import { createPostureId, createSnapshotTemplateId } from '../domain/identity';
import { knowledgePaths } from '../domain/ids';
import type {
  ResolutionExhaustionEntry,
  ResolutionObservation,
  ResolutionProposalDraft,
  ResolutionReceipt,
  ResolutionTarget,
  StepAction,
  StepTask,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
} from '../domain/types';
import { resolveLocator } from './locate';

export interface RuntimeStepAgentContext {
  page?: Page | undefined;
  previousResolution?: ResolutionTarget | null | undefined;
  provider: string;
  mode: string;
  runAt: string;
}

export interface RuntimeStepAgent {
  resolve(task: StepTask, context: RuntimeStepAgentContext): Promise<ResolutionReceipt>;
}

interface AliasMatch {
  alias: string;
  score: number;
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)) as T[];
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function bestAliasMatch(normalizedText: string, aliases: string[]): AliasMatch | null {
  let best: AliasMatch | null = null;
  for (const alias of uniqueSorted(aliases.map((entry) => normalizeIntentText(entry)))) {
    if (!alias || !normalizedText.includes(alias)) {
      continue;
    }
    const candidate: AliasMatch = { alias, score: alias.length };
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }
  return best;
}

function recordExhaustion(
  entries: ResolutionExhaustionEntry[],
  stage: ResolutionExhaustionEntry['stage'],
  outcome: ResolutionExhaustionEntry['outcome'],
  reason: string,
): void {
  entries.push({ stage, outcome, reason });
}

function normalizedCombined(task: StepTask): string {
  return `${normalizeIntentText(task.actionText)} ${normalizeIntentText(task.expectedText)}`.trim();
}

function allowedActionFallback(task: StepTask): StepAction | null {
  const normalized = normalizeIntentText(task.actionText);
  if (normalized.startsWith('navigate')) {
    return 'navigate';
  }
  if (normalized.startsWith('enter')) {
    return 'input';
  }
  if (normalized.startsWith('click')) {
    return 'click';
  }
  if (normalized.startsWith('verify') || normalized.startsWith('assert')) {
    return 'assert-snapshot';
  }
  return task.allowedActions.length === 1 ? task.allowedActions[0] ?? null : null;
}

function resolveAction(task: StepTask): { action: StepAction | null; supplementRefs: string[] } {
  if (task.explicitResolution?.action) {
    return { action: task.explicitResolution.action, supplementRefs: [] };
  }

  const normalized = normalizeIntentText(task.actionText);
  for (const action of task.allowedActions) {
    if (action === 'custom') {
      continue;
    }
    const aliases = task.runtimeKnowledge.sharedPatterns.actions[action]?.aliases ?? [];
    if (bestAliasMatch(normalized, aliases)) {
      return {
        action,
        supplementRefs: [knowledgePaths.patterns()],
      };
    }
  }

  return { action: allowedActionFallback(task), supplementRefs: [] };
}

function resolveScreen(task: StepTask, action: StepAction | null, previousResolution: ResolutionTarget | null | undefined): { screen: StepTaskScreenCandidate | null; supplementRefs: string[] } {
  if (task.explicitResolution?.screen) {
    const explicit = task.runtimeKnowledge.screens.find((screen) => screen.screen === task.explicitResolution?.screen) ?? null;
    return { screen: explicit, supplementRefs: [] };
  }

  const normalized = normalizedCombined(task);
  let best: { screen: StepTaskScreenCandidate; score: number } | null = null;
  for (const screen of task.runtimeKnowledge.screens) {
    const aliases = uniqueSorted([screen.screen, humanizeIdentifier(screen.screen), ...screen.screenAliases]);
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      continue;
    }
    if (!best || match.score > best.score) {
      best = { screen, score: match.score };
    }
  }
  if (best) {
    return {
      screen: best.screen,
      supplementRefs: best.screen.supplementRefs,
    };
  }

  if (action !== 'navigate' && previousResolution?.screen) {
    const carried = task.runtimeKnowledge.screens.find((screen) => screen.screen === previousResolution.screen) ?? null;
    return { screen: carried, supplementRefs: carried?.supplementRefs ?? [] };
  }

  return { screen: null, supplementRefs: [] };
}

function resolveElement(task: StepTask, screen: StepTaskScreenCandidate | null): { element: StepTaskElementCandidate | null; supplementRefs: string[] } {
  if (!screen) {
    return { element: null, supplementRefs: [] };
  }

  if (task.explicitResolution?.element) {
    const explicit = screen.elements.find((element) => element.element === task.explicitResolution?.element) ?? null;
    return { element: explicit, supplementRefs: explicit ? screen.supplementRefs : [] };
  }

  const normalized = normalizedCombined(task);
  let best: { element: StepTaskElementCandidate; score: number } | null = null;
  for (const element of screen.elements) {
    const aliases = uniqueSorted([element.element, humanizeIdentifier(element.element), element.name ?? '', ...element.aliases]);
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      continue;
    }
    if (!best || match.score > best.score) {
      best = { element, score: match.score };
    }
  }

  return {
    element: best?.element ?? null,
    supplementRefs: best ? screen.supplementRefs : [],
  };
}

function resolvePosture(task: StepTask, element: StepTaskElementCandidate | null): { posture: ReturnType<typeof createPostureId> | null; supplementRefs: string[] } {
  if (task.explicitResolution?.posture) {
    return { posture: task.explicitResolution.posture, supplementRefs: [] };
  }
  const normalized = normalizedCombined(task);
  for (const [postureId, descriptor] of Object.entries(task.runtimeKnowledge.sharedPatterns.postures)) {
    if (bestAliasMatch(normalized, descriptor.aliases)) {
      return { posture: createPostureId(postureId), supplementRefs: [knowledgePaths.patterns()] };
    }
  }
  if (element?.postures.some((posture) => posture === createPostureId('valid'))) {
    return { posture: createPostureId('valid'), supplementRefs: [] };
  }
  return { posture: null, supplementRefs: [] };
}

function resolveOverride(task: StepTask, element: StepTaskElementCandidate | null): string | null {
  if (task.explicitResolution?.override !== undefined) {
    return task.explicitResolution.override ?? null;
  }
  if (!element) {
    return null;
  }
  if (task.explicitResolution?.posture === 'empty') {
    return '';
  }
  return element.defaultValueRef ?? null;
}

function resolveSnapshot(task: StepTask, screen: StepTaskScreenCandidate | null, element: StepTaskElementCandidate | null): { snapshotTemplate: ReturnType<typeof createSnapshotTemplateId> | null; supplementRefs: string[] } {
  if (task.explicitResolution?.snapshot_template) {
    return { snapshotTemplate: task.explicitResolution.snapshot_template, supplementRefs: [] };
  }
  const normalized = normalizedCombined(task);
  for (const [snapshotTemplate, aliases] of Object.entries(element?.snapshotAliases ?? {})) {
    if (bestAliasMatch(normalized, aliases)) {
      return { snapshotTemplate: createSnapshotTemplateId(snapshotTemplate), supplementRefs: screen?.supplementRefs ?? [] };
    }
  }
  if ((screen?.sectionSnapshots.length ?? 0) === 1) {
    return { snapshotTemplate: screen?.sectionSnapshots[0] ?? null, supplementRefs: [] };
  }
  return { snapshotTemplate: null, supplementRefs: [] };
}

function isElementCompatible(action: StepAction | null, element: StepTaskElementCandidate): boolean {
  switch (action) {
    case 'input':
      return element.widget.includes('input');
    case 'click':
      return element.widget.includes('button') || element.role === 'button';
    case 'assert-snapshot':
      return true;
    default:
      return true;
  }
}

async function resolveFromDom(
  page: Page | undefined,
  task: StepTask,
  screen: StepTaskScreenCandidate | null,
  action: StepAction | null,
): Promise<{ element: StepTaskElementCandidate | null; observation?: ResolutionObservation | undefined }> {
  if (!page || !screen || !action) {
    return { element: null };
  }

  const visible: StepTaskElementCandidate[] = [];
  for (const candidate of screen.elements.filter((element) => isElementCompatible(action, element))) {
    const resolved = await resolveLocator(page, {
      role: candidate.role,
      name: candidate.name ?? null,
      testId: null,
      cssFallback: null,
      locator: candidate.locator,
      surface: candidate.surface,
      widget: candidate.widget,
      affordance: candidate.affordance ?? null,
    });
    const count = await resolved.locator.count().catch(() => 0);
    if (count > 0) {
      visible.push(candidate);
    }
  }

  if (visible.length === 1) {
    return {
      element: visible[0] ?? null,
      observation: {
        source: 'dom',
        summary: 'Resolved uniquely visible candidate from live DOM',
        detail: {
          element: visible[0]?.element ?? '',
        },
      },
    };
  }

  return { element: null };
}

function requiresElement(action: StepAction | null): boolean {
  return action === 'input' || action === 'click' || action === 'assert-snapshot';
}

function proposalForSupplementGap(task: StepTask, screen: StepTaskScreenCandidate, element: StepTaskElementCandidate): ResolutionProposalDraft[] {
  return [{
    artifactType: 'hints',
    targetPath: knowledgePaths.hints(screen.screen),
    title: `Capture phrasing for step ${task.index}`,
    patch: {
      screen: screen.screen,
      element: element.element,
      alias: task.actionText,
    },
    rationale: 'Runtime resolved the step through live DOM after approved knowledge exhausted its deterministic priors.',
  }];
}

export const deterministicRuntimeStepAgent: RuntimeStepAgent = {
  async resolve(task: StepTask, context: RuntimeStepAgentContext): Promise<ResolutionReceipt> {
    const exhaustion: ResolutionExhaustionEntry[] = [];
    const observations: ResolutionObservation[] = [];
    const supplementRefs: string[] = [];
    const knowledgeRefs: string[] = [];

    const explicit = task.explicitResolution;
    if (explicit?.action && explicit.screen && (!requiresElement(explicit.action) || explicit.element)) {
      recordExhaustion(exhaustion, 'explicit', 'resolved', 'Explicit structured resolution satisfied executable requirements');
      return {
        kind: 'resolved',
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        provider: context.provider,
        mode: context.mode,
        runAt: context.runAt,
        stepIndex: task.index,
        knowledgeRefs: explicit.screen ? [knowledgePaths.surface(explicit.screen), knowledgePaths.elements(explicit.screen)] : [],
        supplementRefs: [],
        observations,
        exhaustion,
        confidence: 'compiler-derived',
        provenanceKind: 'explicit',
        target: {
          action: explicit.action,
          screen: explicit.screen,
          element: explicit.element ?? null,
          posture: explicit.posture ?? null,
          override: explicit.override ?? null,
          snapshot_template: explicit.snapshot_template ?? null,
        },
        evidenceDrafts: [],
        proposalDrafts: [],
      };
    }
    recordExhaustion(exhaustion, 'explicit', explicit ? 'attempted' : 'skipped', explicit ? 'Explicit constraints were partial and used as priors' : 'No explicit constraints present');

    const actionResult = resolveAction(task);
    const action = actionResult.action;
    supplementRefs.push(...actionResult.supplementRefs);
    if (!action) {
      recordExhaustion(exhaustion, 'approved-screen-bundle', 'failed', 'Unable to infer action from approved knowledge');
    }

    const screenResult = resolveScreen(task, action, context.previousResolution);
    if (screenResult.screen) {
      knowledgeRefs.push(...screenResult.screen.knowledgeRefs);
      supplementRefs.push(...screenResult.supplementRefs);
      recordExhaustion(exhaustion, 'approved-screen-bundle', 'attempted', `Selected screen ${screenResult.screen.screen}`);
    } else {
      recordExhaustion(exhaustion, 'approved-screen-bundle', 'failed', 'No screen candidate matched approved knowledge priors');
    }

    const elementResult = resolveElement(task, screenResult.screen);
    if (elementResult.element) {
      supplementRefs.push(...elementResult.supplementRefs);
      recordExhaustion(exhaustion, 'local-hints', 'attempted', `Matched element ${elementResult.element.element}`);
    } else {
      recordExhaustion(exhaustion, 'local-hints', 'failed', 'No element candidate matched local hints');
    }

    const postureResult = resolvePosture(task, elementResult.element);
    supplementRefs.push(...postureResult.supplementRefs);
    recordExhaustion(exhaustion, 'shared-patterns', postureResult.posture ? 'attempted' : 'skipped', postureResult.posture ? `Matched posture ${postureResult.posture}` : 'No shared posture pattern required');

    recordExhaustion(
      exhaustion,
      'prior-evidence',
      task.runtimeKnowledge.evidenceRefs.length > 0 ? 'attempted' : 'skipped',
      task.runtimeKnowledge.evidenceRefs.length > 0 ? 'Prior evidence refs were available to the agent task' : 'No prior evidence refs available',
    );

    const override = resolveOverride(task, elementResult.element);
    const snapshotResult = resolveSnapshot(task, screenResult.screen, elementResult.element);
    supplementRefs.push(...snapshotResult.supplementRefs);

    if (action && screenResult.screen && (!requiresElement(action) || elementResult.element) && (action !== 'assert-snapshot' || snapshotResult.snapshotTemplate)) {
      return {
        kind: 'resolved',
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        provider: context.provider,
        mode: context.mode,
        runAt: context.runAt,
        stepIndex: task.index,
        knowledgeRefs: uniqueSorted(knowledgeRefs),
        supplementRefs: uniqueSorted(supplementRefs),
        observations,
        exhaustion,
        confidence: 'agent-verified',
        provenanceKind: 'approved-knowledge',
        target: {
          action,
          screen: screenResult.screen.screen,
          element: elementResult.element?.element ?? null,
          posture: postureResult.posture,
          override,
          snapshot_template: snapshotResult.snapshotTemplate,
        },
        evidenceDrafts: [],
        proposalDrafts: [],
      };
    }

    const domResolved = await resolveFromDom(context.page, task, screenResult.screen, action);
    if (domResolved.observation) {
      observations.push(domResolved.observation);
    }
    if (domResolved.element && action && screenResult.screen && (action !== 'assert-snapshot' || snapshotResult.snapshotTemplate)) {
      const liveScreen = screenResult.screen;
      const liveElement = domResolved.element;
      recordExhaustion(exhaustion, 'live-dom', 'attempted', `Live DOM resolved ${domResolved.element.element}`);
      recordExhaustion(exhaustion, 'safe-degraded-resolution', 'resolved', 'A single live-DOM candidate remained after deterministic priors exhausted');
      const proposalDrafts = proposalForSupplementGap(task, liveScreen, liveElement);
      return {
        kind: 'resolved-with-proposals',
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        provider: context.provider,
        mode: context.mode,
        runAt: context.runAt,
        stepIndex: task.index,
        knowledgeRefs: uniqueSorted(knowledgeRefs),
        supplementRefs: uniqueSorted(supplementRefs),
        observations,
        exhaustion,
        confidence: 'agent-proposed',
        provenanceKind: 'live-exploration',
        target: {
          action,
          screen: liveScreen.screen,
          element: liveElement.element,
          posture: postureResult.posture,
          override: resolveOverride(task, liveElement),
          snapshot_template: snapshotResult.snapshotTemplate,
        },
        evidenceDrafts: proposalDrafts.map((proposal) => ({
          type: 'runtime-resolution-gap',
          trigger: 'live-dom-resolution',
          observation: {
            step: String(task.index),
            screen: liveScreen.screen,
            element: liveElement.element,
          },
          proposal: {
            file: proposal.targetPath,
            field: 'elements',
            old_value: null,
            new_value: task.actionText,
          },
          confidence: 0.9,
          risk: 'low',
          scope: proposal.artifactType,
        })),
        proposalDrafts,
      };
    }

    recordExhaustion(exhaustion, 'live-dom', context.page ? 'failed' : 'skipped', context.page ? 'Live DOM did not produce a unique safe resolution' : 'No live runtime page was available');
    recordExhaustion(exhaustion, 'safe-degraded-resolution', 'failed', 'No safe degraded resolution remained after all machine paths were exhausted');

    return {
      kind: 'needs-human',
      taskFingerprint: task.taskFingerprint,
      knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
      provider: context.provider,
      mode: context.mode,
      runAt: context.runAt,
      stepIndex: task.index,
      knowledgeRefs: uniqueSorted(knowledgeRefs),
      supplementRefs: uniqueSorted(supplementRefs),
      observations,
      exhaustion,
      confidence: 'unbound',
      provenanceKind: 'unresolved',
      reason: 'No safe executable interpretation remained after exhausting explicit constraints, approved knowledge, prior evidence, live DOM exploration, and degraded resolution.',
      evidenceDrafts: [],
      proposalDrafts: [],
    };
  },
};
