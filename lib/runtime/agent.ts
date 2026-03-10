import type { Page } from '@playwright/test';
import { normalizeIntentText } from '../domain/inference';
import { createPostureId, createSnapshotTemplateId } from '../domain/identity';
import { knowledgePaths } from '../domain/ids';
import { widgetCapabilityContracts } from '../domain/widgets/contracts';
import type {
  ResolutionExhaustionEntry,
  ResolutionObservation,
  ResolutionProposalDraft,
  ResolutionReceipt,
  ResolutionTarget,
  TranslationRequest,
  TranslationReceipt,
  StepResolution,
  StepAction,
  StepTask,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
  StepWinningSource,
} from '../domain/types';
import { resolveLocator } from './locate';

export interface RuntimeStepAgentContext {
  page?: Page | undefined;
  previousResolution?: ResolutionTarget | null | undefined;
  provider: string;
  mode: string;
  runAt: string;
  translate?: ((request: TranslationRequest) => TranslationReceipt) | undefined;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
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

function selectedRunbook(task: StepTask, context: RuntimeStepAgentContext) {
  if (context.controlSelection?.runbook) {
    return task.runtimeKnowledge.controls.runbooks.find((entry) => entry.name === context.controlSelection?.runbook) ?? null;
  }
  return task.runtimeKnowledge.controls.runbooks.find((entry) => entry.isDefault) ?? task.runtimeKnowledge.controls.runbooks[0] ?? null;
}

function selectedControlResolution(task: StepTask, context: RuntimeStepAgentContext): StepResolution | null {
  const runbook = selectedRunbook(task, context);
  const selectedName = context.controlSelection?.resolutionControl ?? runbook?.resolutionControl ?? null;
  const scoped = task.runtimeKnowledge.controls.resolutionControls.filter((entry) => entry.stepIndex === task.index);
  const selected = selectedName
    ? scoped.find((entry) => entry.name === selectedName) ?? null
    : null;
  return selected?.resolution ?? task.controlResolution ?? scoped[0]?.resolution ?? null;
}

function selectedDataset(task: StepTask, context: RuntimeStepAgentContext) {
  if (context.controlSelection?.dataset) {
    return task.runtimeKnowledge.controls.datasets.find((entry) => entry.name === context.controlSelection?.dataset) ?? null;
  }
  const runbook = selectedRunbook(task, context);
  if (runbook?.dataset) {
    return task.runtimeKnowledge.controls.datasets.find((entry) => entry.name === runbook.dataset) ?? null;
  }
  return task.runtimeKnowledge.controls.datasets.find((entry) => entry.isDefault) ?? task.runtimeKnowledge.controls.datasets[0] ?? null;
}

function selectedControlRefs(task: StepTask, context: RuntimeStepAgentContext): string[] {
  const refs: string[] = [];
  const runbook = selectedRunbook(task, context);
  const dataset = selectedDataset(task, context);
  const resolutionControlName = context.controlSelection?.resolutionControl ?? runbook?.resolutionControl ?? null;
  const resolutionControl = resolutionControlName
    ? task.runtimeKnowledge.controls.resolutionControls.find((entry) => entry.name === resolutionControlName)
    : null;

  if (runbook) {
    refs.push(runbook.artifactPath);
  }
  if (dataset) {
    refs.push(dataset.artifactPath);
  }
  if (resolutionControl) {
    refs.push(resolutionControl.artifactPath);
  }

  return uniqueSorted(refs);
}

function datasetElementKey(screen: string, element: string): string {
  return `${screen}.${element}`;
}

function generatedTokenKey(screen: string, element: string): string {
  return `${screen}.${element}`;
}

function resolveAction(task: StepTask, controlResolution: StepResolution | null): { action: StepAction | null; supplementRefs: string[] } {
  if (task.explicitResolution?.action) {
    return { action: task.explicitResolution.action, supplementRefs: [] };
  }
  if (controlResolution?.action) {
    return { action: controlResolution.action, supplementRefs: [] };
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

function resolveScreen(task: StepTask, action: StepAction | null, controlResolution: StepResolution | null, previousResolution: ResolutionTarget | null | undefined): { screen: StepTaskScreenCandidate | null; supplementRefs: string[] } {
  if (task.explicitResolution?.screen) {
    const explicit = task.runtimeKnowledge.screens.find((screen) => screen.screen === task.explicitResolution?.screen) ?? null;
    return { screen: explicit, supplementRefs: [] };
  }
  if (controlResolution?.screen) {
    const controlled = task.runtimeKnowledge.screens.find((screen) => screen.screen === controlResolution.screen) ?? null;
    return { screen: controlled, supplementRefs: [] };
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

function resolveElement(task: StepTask, screen: StepTaskScreenCandidate | null, controlResolution: StepResolution | null): { element: StepTaskElementCandidate | null; supplementRefs: string[] } {
  if (!screen) {
    return { element: null, supplementRefs: [] };
  }

  if (task.explicitResolution?.element) {
    const explicit = screen.elements.find((element) => element.element === task.explicitResolution?.element) ?? null;
    return { element: explicit, supplementRefs: explicit ? screen.supplementRefs : [] };
  }
  if (controlResolution?.element) {
    const controlled = screen.elements.find((element) => element.element === controlResolution.element) ?? null;
    return { element: controlled, supplementRefs: controlled ? screen.supplementRefs : [] };
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

function resolvePosture(task: StepTask, element: StepTaskElementCandidate | null, controlResolution: StepResolution | null): { posture: ReturnType<typeof createPostureId> | null; supplementRefs: string[] } {
  if (task.explicitResolution?.posture) {
    return { posture: task.explicitResolution.posture, supplementRefs: [] };
  }
  if (controlResolution?.posture) {
    return { posture: controlResolution.posture, supplementRefs: [] };
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

function resolveOverride(
  task: StepTask,
  screen: StepTaskScreenCandidate | null,
  element: StepTaskElementCandidate | null,
  posture: ReturnType<typeof createPostureId> | null,
  controlResolution: StepResolution | null,
  context: RuntimeStepAgentContext,
): { override: string | null; source: StepWinningSource } {
  if (task.explicitResolution?.override !== undefined) {
    return { override: task.explicitResolution.override ?? null, source: 'scenario-explicit' };
  }
  if (controlResolution?.override !== undefined) {
    return { override: controlResolution.override ?? null, source: 'resolution-control' };
  }
  if (!element) {
    return { override: null, source: 'none' };
  }
  if (task.explicitResolution?.posture === 'empty') {
    return { override: '', source: 'scenario-explicit' };
  }
  if (controlResolution?.posture === 'empty') {
    return { override: '', source: 'resolution-control' };
  }

  const dataset = selectedDataset(task, context);
  if (screen && dataset) {
    const datasetValue = dataset.elementDefaults[datasetElementKey(screen.screen, element.element)];
    if (datasetValue !== undefined) {
      return {
        override: datasetValue,
        source: context.controlSelection?.dataset || selectedRunbook(task, context)?.dataset ? 'runbook-dataset' : 'default-dataset',
      };
    }
  }

  if (element.defaultValueRef) {
    return { override: element.defaultValueRef, source: 'knowledge-hint' };
  }

  if (posture) {
    return { override: null, source: 'posture-sample' };
  }

  if (screen) {
    return {
      override: `<<generated:${generatedTokenKey(screen.screen, element.element)}>>`,
      source: 'generated-token',
    };
  }

  return { override: null, source: 'none' };
}

function resolveSnapshot(task: StepTask, screen: StepTaskScreenCandidate | null, element: StepTaskElementCandidate | null, controlResolution: StepResolution | null): { snapshotTemplate: ReturnType<typeof createSnapshotTemplateId> | null; supplementRefs: string[] } {
  if (task.explicitResolution?.snapshot_template) {
    return { snapshotTemplate: task.explicitResolution.snapshot_template, supplementRefs: [] };
  }
  if (controlResolution?.snapshot_template) {
    return { snapshotTemplate: controlResolution.snapshot_template, supplementRefs: [] };
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

function widgetActionForStepAction(action: StepAction | null): 'fill' | 'click' | 'get-value' | null {
  switch (action) {
    case 'input':
      return 'fill';
    case 'click':
      return 'click';
    case 'assert-snapshot':
      return 'get-value';
    default:
      return null;
  }
}

function isElementCompatible(action: StepAction | null, element: StepTaskElementCandidate): boolean {
  const widgetAction = widgetActionForStepAction(action);
  if (!widgetAction) {
    return true;
  }
  const contract = widgetCapabilityContracts[element.widget];
  if (!contract) {
    return action === 'click' ? element.role === 'button' : action === 'assert-snapshot';
  }
  return contract.supportedActions.includes(widgetAction);
}

function overlayAliases(record: StepTask['runtimeKnowledge']['confidenceOverlays'][number]): string[] {
  return uniqueSorted([
    ...record.learnedAliases,
    record.element ?? '',
    record.screen ?? '',
    record.snapshotTemplate ?? '',
  ]);
}

function resolveWithConfidenceOverlay(
  task: StepTask,
  action: StepAction | null,
  approvedScreen: StepTaskScreenCandidate | null,
  approvedElement: StepTaskElementCandidate | null,
  snapshotTemplate: ReturnType<typeof createSnapshotTemplateId> | null,
): {
  screen: StepTaskScreenCandidate | null;
  element: StepTaskElementCandidate | null;
  posture: ReturnType<typeof createPostureId> | null;
  snapshotTemplate: ReturnType<typeof createSnapshotTemplateId> | null;
  overlayRefs: string[];
  observation?: ResolutionObservation | undefined;
} {
  const normalized = normalizedCombined(task);
  const overlays = task.runtimeKnowledge.confidenceOverlays;
  const overlayRefIds = new Set<string>();

  let screen = approvedScreen;
  if (!screen) {
    const matchedScreen = overlays
      .filter((record) => record.screen)
      .map((record) => ({ record, match: bestAliasMatch(normalized, overlayAliases(record)) }))
      .filter((entry): entry is { record: StepTask['runtimeKnowledge']['confidenceOverlays'][number]; match: AliasMatch } => entry.match !== null)
      .sort((left, right) => right.match.score - left.match.score)[0];
    if (matchedScreen?.record.screen) {
      screen = task.runtimeKnowledge.screens.find((candidate) => candidate.screen === matchedScreen.record.screen) ?? null;
      overlayRefIds.add(matchedScreen.record.id);
    }
  }

  let element = approvedElement;
  if (screen && !element && requiresElement(action)) {
    const matchedElement = overlays
      .filter((record) => record.screen === screen?.screen && record.element)
      .map((record) => ({ record, match: bestAliasMatch(normalized, overlayAliases(record)) }))
      .filter((entry): entry is { record: StepTask['runtimeKnowledge']['confidenceOverlays'][number]; match: AliasMatch } => entry.match !== null)
      .sort((left, right) => right.match.score - left.match.score)[0];
    if (matchedElement?.record.element) {
      element = screen.elements.find((candidate) => candidate.element === matchedElement.record.element) ?? null;
      overlayRefIds.add(matchedElement.record.id);
    }
  }

  const postureRecord = screen && element
    ? overlays.find((record) => record.screen === screen.screen && record.element === element.element && record.posture)
    : null;
  if (postureRecord?.posture) {
    overlayRefIds.add(postureRecord.id);
  }

  const snapshotRecord = screen
    ? overlays.find((record) => record.screen === screen.screen && record.snapshotTemplate)
    : null;
  if (snapshotRecord?.snapshotTemplate) {
    overlayRefIds.add(snapshotRecord.id);
  }

  const overlayRefs = uniqueSorted([...overlayRefIds]);
  return {
    screen,
    element,
    posture: postureRecord?.posture ?? null,
    snapshotTemplate: snapshotTemplate ?? snapshotRecord?.snapshotTemplate ?? null,
    overlayRefs,
    observation: overlayRefs.length > 0
      ? {
          source: 'overlay',
          summary: 'Approved-equivalent confidence overlays supplied a deterministic target.',
          detail: {
            overlayRefs: overlayRefs.join(','),
          },
        }
      : undefined,
  };
}

function resolveWithTranslation(
  task: StepTask,
  translator: RuntimeStepAgentContext['translate'],
): {
  translation: TranslationReceipt | null;
  screen: StepTaskScreenCandidate | null;
  element: StepTaskElementCandidate | null;
  overlayRefs: string[];
  observation?: ResolutionObservation | undefined;
} {
  if (!translator) {
    return { translation: null, screen: null, element: null, overlayRefs: [] };
  }

  const translation = translator({
    version: 1,
    normalizedIntent: task.normalizedIntent,
    actionText: task.actionText,
    expectedText: task.expectedText,
    allowedActions: task.allowedActions,
    screens: task.runtimeKnowledge.screens.map((screen) => ({
      screen: screen.screen,
      aliases: uniqueSorted([screen.screen, ...screen.screenAliases]),
      elements: screen.elements.map((element) => ({
        element: element.element,
        aliases: uniqueSorted([element.element, element.name ?? '', ...element.aliases]),
        postures: element.postures,
        snapshotTemplates: screen.sectionSnapshots,
      })),
    })),
    evidenceRefs: task.runtimeKnowledge.evidenceRefs,
    overlayRefs: task.runtimeKnowledge.confidenceOverlays.map((record) => record.id),
  });

  const selectedElement = translation.selected?.kind === 'element'
    ? task.runtimeKnowledge.screens
        .find((screen) => screen.screen === translation.selected?.screen)
        ?.elements.find((element) => element.element === translation.selected?.element) ?? null
    : null;
  const selectedScreenId = translation.selected?.kind === 'element'
    ? translation.selected.screen ?? null
    : translation.selected?.kind === 'screen'
      ? translation.selected.screen ?? null
      : null;
  const selectedScreen = selectedScreenId
    ? task.runtimeKnowledge.screens.find((screen) => screen.screen === selectedScreenId) ?? null
    : null;
  const overlayRefs = uniqueSorted(translation.candidates.flatMap((candidate) => candidate.sourceRefs));

  return {
    translation,
    screen: selectedScreen,
    element: selectedElement,
    overlayRefs,
    observation: translation.matched
      ? {
          source: 'translation',
          summary: translation.rationale,
          detail: translation.selected
            ? {
                target: translation.selected.target,
                score: String(translation.selected.score),
              }
            : undefined,
        }
      : undefined,
  };
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
    const controlResolution = selectedControlResolution(task, context);
    const controlRefs = selectedControlRefs(task, context);
    const evidenceRefs = uniqueSorted(task.runtimeKnowledge.evidenceRefs);

    const explicit = task.explicitResolution;
    if (explicit?.action && explicit.screen && (!requiresElement(explicit.action) || explicit.element)) {
      recordExhaustion(exhaustion, 'explicit', 'resolved', 'Explicit structured resolution satisfied executable requirements');
      return {
        kind: 'resolved',
        version: 1,
        stage: 'resolution',
        scope: 'step',
        ids: {
          adoId: null,
          suite: null,
          runId: null,
          stepIndex: task.index,
          dataset: context.controlSelection?.dataset ?? null,
          runbook: context.controlSelection?.runbook ?? null,
          resolutionControl: context.controlSelection?.resolutionControl ?? null,
        },
        fingerprints: {
          artifact: task.taskFingerprint,
          knowledge: task.runtimeKnowledge.knowledgeFingerprint,
          task: task.taskFingerprint,
          controls: null,
          content: null,
          run: null,
        },
        lineage: {
          sources: [],
          parents: [task.taskFingerprint],
          handshakes: ['preparation', 'resolution'],
        },
        governance: 'approved',
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        provider: context.provider,
        mode: context.mode,
        runAt: context.runAt,
        stepIndex: task.index,
        resolutionMode: 'deterministic',
        knowledgeRefs: explicit.screen ? [knowledgePaths.surface(explicit.screen), knowledgePaths.elements(explicit.screen)] : [],
        supplementRefs: [],
        controlRefs,
        evidenceRefs,
        overlayRefs: [],
        observations,
        exhaustion,
        handshakes: ['preparation', 'resolution'],
        winningConcern: 'intent',
        winningSource: 'scenario-explicit',
        translation: null,
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

    const actionResult = resolveAction(task, controlResolution);
    const action = actionResult.action;
    supplementRefs.push(...actionResult.supplementRefs);
    if (!action) {
      recordExhaustion(exhaustion, 'approved-screen-bundle', 'failed', 'Unable to infer action from approved knowledge');
    }

    const screenResult = resolveScreen(task, action, controlResolution, context.previousResolution);
    if (screenResult.screen) {
      knowledgeRefs.push(...screenResult.screen.knowledgeRefs);
      supplementRefs.push(...screenResult.supplementRefs);
      recordExhaustion(exhaustion, 'approved-screen-bundle', 'attempted', `Selected screen ${screenResult.screen.screen}`);
    } else {
      recordExhaustion(exhaustion, 'approved-screen-bundle', 'failed', 'No screen candidate matched approved knowledge priors');
    }

    const elementResult = resolveElement(task, screenResult.screen, controlResolution);
    if (elementResult.element) {
      supplementRefs.push(...elementResult.supplementRefs);
      recordExhaustion(exhaustion, 'local-hints', 'attempted', `Matched element ${elementResult.element.element}`);
    } else {
      recordExhaustion(exhaustion, 'local-hints', 'failed', 'No element candidate matched local hints');
    }

    const postureResult = resolvePosture(task, elementResult.element, controlResolution);
    supplementRefs.push(...postureResult.supplementRefs);
    recordExhaustion(exhaustion, 'shared-patterns', postureResult.posture ? 'attempted' : 'skipped', postureResult.posture ? `Matched posture ${postureResult.posture}` : 'No shared posture pattern required');

    recordExhaustion(
      exhaustion,
      'prior-evidence',
      task.runtimeKnowledge.evidenceRefs.length > 0 ? 'attempted' : 'skipped',
      task.runtimeKnowledge.evidenceRefs.length > 0 ? 'Prior evidence refs were available to the agent task' : 'No prior evidence refs available',
    );

    const override = resolveOverride(task, screenResult.screen, elementResult.element, postureResult.posture, controlResolution, context);
    const snapshotResult = resolveSnapshot(task, screenResult.screen, elementResult.element, controlResolution);
    supplementRefs.push(...snapshotResult.supplementRefs);
    const controlWasUsed = Boolean(
      controlResolution
      && (controlResolution.action || controlResolution.screen || controlResolution.element || controlResolution.posture || controlResolution.override !== undefined || controlResolution.snapshot_template),
    );
    const winningSource = controlWasUsed
      ? 'resolution-control'
      : override.source !== 'none'
        ? override.source
        : 'approved-knowledge';

    if (action && screenResult.screen && (!requiresElement(action) || elementResult.element) && (action !== 'assert-snapshot' || snapshotResult.snapshotTemplate)) {
      return {
        kind: 'resolved',
        version: 1,
        stage: 'resolution',
        scope: 'step',
        ids: {
          adoId: null,
          suite: null,
          runId: null,
          stepIndex: task.index,
          dataset: selectedDataset(task, context)?.name ?? null,
          runbook: selectedRunbook(task, context)?.name ?? null,
          resolutionControl: controlWasUsed ? (context.controlSelection?.resolutionControl ?? selectedRunbook(task, context)?.resolutionControl ?? task.runtimeKnowledge.controls.resolutionControls[0]?.name ?? null) : null,
        },
        fingerprints: {
          artifact: task.taskFingerprint,
          knowledge: task.runtimeKnowledge.knowledgeFingerprint,
          task: task.taskFingerprint,
          controls: null,
          content: null,
          run: null,
        },
        lineage: {
          sources: [],
          parents: [task.taskFingerprint],
          handshakes: ['preparation', 'resolution'],
        },
        governance: 'approved',
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        provider: context.provider,
        mode: context.mode,
        runAt: context.runAt,
        stepIndex: task.index,
        resolutionMode: 'deterministic',
        knowledgeRefs: uniqueSorted(knowledgeRefs),
        supplementRefs: uniqueSorted(supplementRefs),
        controlRefs,
        evidenceRefs,
        overlayRefs: [],
        observations,
        exhaustion,
        handshakes: ['preparation', 'resolution'],
        winningConcern: controlWasUsed
          ? 'control'
          : winningSource === 'knowledge-hint' || winningSource === 'posture-sample' || winningSource === 'approved-knowledge'
            ? 'knowledge'
            : winningSource === 'runbook-dataset' || winningSource === 'default-dataset' || winningSource === 'generated-token'
              ? 'control'
              : 'resolution',
        winningSource,
        translation: null,
        confidence: 'agent-verified',
        provenanceKind: 'approved-knowledge',
        target: {
          action,
          screen: screenResult.screen.screen,
          element: elementResult.element?.element ?? null,
          posture: postureResult.posture,
          override: override.override,
          snapshot_template: snapshotResult.snapshotTemplate,
        },
        evidenceDrafts: [],
        proposalDrafts: [],
      };
    }

    const overlayResult = resolveWithConfidenceOverlay(
      task,
      action,
      screenResult.screen,
      elementResult.element,
      snapshotResult.snapshotTemplate,
    );
    if (overlayResult.observation) {
      observations.push(overlayResult.observation);
    }
    if (overlayResult.overlayRefs.length > 0) {
      recordExhaustion(exhaustion, 'confidence-overlay', 'resolved', `Approved-equivalent overlays resolved ${overlayResult.overlayRefs.join(', ')}`);
      const overlayOverride = resolveOverride(task, overlayResult.screen, overlayResult.element, overlayResult.posture, controlResolution, context);
      return {
        kind: 'resolved',
        version: 1,
        stage: 'resolution',
        scope: 'step',
        ids: {
          adoId: null,
          suite: null,
          runId: null,
          stepIndex: task.index,
          dataset: selectedDataset(task, context)?.name ?? null,
          runbook: selectedRunbook(task, context)?.name ?? null,
          resolutionControl: context.controlSelection?.resolutionControl ?? selectedRunbook(task, context)?.resolutionControl ?? null,
        },
        fingerprints: {
          artifact: task.taskFingerprint,
          knowledge: task.runtimeKnowledge.knowledgeFingerprint,
          task: task.taskFingerprint,
          controls: task.runtimeKnowledge.confidenceFingerprint ?? null,
          content: null,
          run: null,
        },
        lineage: {
          sources: [...controlRefs, ...evidenceRefs, ...overlayResult.overlayRefs],
          parents: [task.taskFingerprint],
          handshakes: ['preparation', 'resolution'],
        },
        governance: 'approved',
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        provider: context.provider,
        mode: context.mode,
        runAt: context.runAt,
        stepIndex: task.index,
        resolutionMode: 'deterministic',
        knowledgeRefs: uniqueSorted(knowledgeRefs),
        supplementRefs: uniqueSorted(supplementRefs),
        controlRefs,
        evidenceRefs,
        overlayRefs: overlayResult.overlayRefs,
        observations,
        exhaustion,
        handshakes: ['preparation', 'resolution'],
        winningConcern: 'knowledge',
        winningSource: 'approved-equivalent',
        translation: null,
        confidence: 'agent-verified',
        provenanceKind: 'approved-knowledge',
        target: {
          action: action ?? allowedActionFallback(task) ?? 'custom',
          screen: overlayResult.screen!.screen,
          element: overlayResult.element?.element ?? null,
          posture: overlayResult.posture ?? null,
          override: overlayOverride.override,
          snapshot_template: overlayResult.snapshotTemplate,
        },
        evidenceDrafts: [],
        proposalDrafts: [],
      };
    }
    recordExhaustion(exhaustion, 'confidence-overlay', 'failed', 'No approved-equivalent confidence overlay produced an executable target');

    const translated = resolveWithTranslation(task, context.translate);
    if (translated.observation) {
      observations.push(translated.observation);
    }
    if (translated.translation?.matched && translated.screen && (!requiresElement(action) || translated.element) && (action !== 'assert-snapshot' || snapshotResult.snapshotTemplate)) {
      recordExhaustion(exhaustion, 'structured-translation', 'resolved', translated.translation.rationale);
      const translatedOverride = resolveOverride(task, translated.screen, translated.element, postureResult.posture, controlResolution, context);
      return {
        kind: 'resolved',
        version: 1,
        stage: 'resolution',
        scope: 'step',
        ids: {
          adoId: null,
          suite: null,
          runId: null,
          stepIndex: task.index,
          dataset: selectedDataset(task, context)?.name ?? null,
          runbook: selectedRunbook(task, context)?.name ?? null,
          resolutionControl: context.controlSelection?.resolutionControl ?? selectedRunbook(task, context)?.resolutionControl ?? null,
        },
        fingerprints: {
          artifact: task.taskFingerprint,
          knowledge: task.runtimeKnowledge.knowledgeFingerprint,
          task: task.taskFingerprint,
          controls: task.runtimeKnowledge.confidenceFingerprint ?? null,
          content: null,
          run: null,
        },
        lineage: {
          sources: [...controlRefs, ...evidenceRefs],
          parents: [task.taskFingerprint],
          handshakes: ['preparation', 'resolution'],
        },
        governance: 'approved',
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        provider: context.provider,
        mode: context.mode,
        runAt: context.runAt,
        stepIndex: task.index,
        resolutionMode: 'translation',
        knowledgeRefs: uniqueSorted(knowledgeRefs),
        supplementRefs: uniqueSorted(supplementRefs),
        controlRefs,
        evidenceRefs,
        overlayRefs: translated.overlayRefs,
        observations,
        exhaustion,
        handshakes: ['preparation', 'resolution'],
        winningConcern: 'resolution',
        winningSource: 'structured-translation',
        translation: translated.translation,
        confidence: 'agent-verified',
        provenanceKind: 'approved-knowledge',
        target: {
          action: action ?? allowedActionFallback(task) ?? 'custom',
          screen: translated.screen.screen,
          element: translated.element?.element ?? null,
          posture: postureResult.posture,
          override: translatedOverride.override,
          snapshot_template: snapshotResult.snapshotTemplate,
        },
        evidenceDrafts: [],
        proposalDrafts: [],
      };
    }
    recordExhaustion(exhaustion, 'structured-translation', context.translate ? 'failed' : 'skipped', context.translate ? 'Structured translation did not produce an executable target' : 'No structured translation stage was configured');

    const domScreen = translated.screen ?? overlayResult.screen ?? screenResult.screen;
    const domResolved = await resolveFromDom(context.page, task, domScreen, action);
    if (domResolved.observation) {
      observations.push(domResolved.observation);
    }
    if (domResolved.element && action && domScreen && (action !== 'assert-snapshot' || snapshotResult.snapshotTemplate)) {
      const liveScreen = domScreen;
      const liveElement = domResolved.element;
      recordExhaustion(exhaustion, 'live-dom', 'attempted', `Live DOM resolved ${domResolved.element.element}`);
      recordExhaustion(exhaustion, 'safe-degraded-resolution', 'resolved', 'A single live-DOM candidate remained after deterministic priors exhausted');
      const proposalDrafts = proposalForSupplementGap(task, liveScreen, liveElement);
      return {
        kind: 'resolved-with-proposals',
        version: 1,
        stage: 'resolution',
        scope: 'step',
        ids: {
          adoId: null,
          suite: null,
          runId: null,
          stepIndex: task.index,
          dataset: selectedDataset(task, context)?.name ?? null,
          runbook: selectedRunbook(task, context)?.name ?? null,
          resolutionControl: context.controlSelection?.resolutionControl ?? selectedRunbook(task, context)?.resolutionControl ?? null,
        },
        fingerprints: {
          artifact: task.taskFingerprint,
          knowledge: task.runtimeKnowledge.knowledgeFingerprint,
          task: task.taskFingerprint,
          controls: null,
          content: null,
          run: null,
        },
        lineage: {
          sources: [],
          parents: [task.taskFingerprint],
          handshakes: ['preparation', 'resolution'],
        },
        governance: 'review-required',
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        provider: context.provider,
        mode: context.mode,
        runAt: context.runAt,
        stepIndex: task.index,
        resolutionMode: 'agentic',
        knowledgeRefs: uniqueSorted(knowledgeRefs),
        supplementRefs: uniqueSorted(supplementRefs),
        controlRefs,
        evidenceRefs,
        overlayRefs: uniqueSorted([...overlayResult.overlayRefs, ...translated.overlayRefs]),
        observations,
        exhaustion,
        handshakes: ['preparation', 'resolution'],
        winningConcern: 'resolution',
        winningSource: 'live-dom',
        translation: translated.translation,
        confidence: 'agent-proposed',
        provenanceKind: 'live-exploration',
        target: {
          action,
          screen: liveScreen.screen,
          element: liveElement.element,
          posture: postureResult.posture,
          override: resolveOverride(task, liveScreen, liveElement, postureResult.posture, controlResolution, context).override,
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
      version: 1,
      stage: 'resolution',
      scope: 'step',
      ids: {
        adoId: null,
        suite: null,
        runId: null,
        stepIndex: task.index,
        dataset: selectedDataset(task, context)?.name ?? null,
        runbook: selectedRunbook(task, context)?.name ?? null,
        resolutionControl: context.controlSelection?.resolutionControl ?? selectedRunbook(task, context)?.resolutionControl ?? null,
      },
      fingerprints: {
        artifact: task.taskFingerprint,
        knowledge: task.runtimeKnowledge.knowledgeFingerprint,
        task: task.taskFingerprint,
        controls: null,
        content: null,
        run: null,
      },
      lineage: {
        sources: [],
        parents: [task.taskFingerprint],
        handshakes: ['preparation', 'resolution'],
      },
      governance: 'blocked',
      taskFingerprint: task.taskFingerprint,
      knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
      provider: context.provider,
      mode: context.mode,
      runAt: context.runAt,
      stepIndex: task.index,
      resolutionMode: 'agentic',
      knowledgeRefs: uniqueSorted(knowledgeRefs),
      supplementRefs: uniqueSorted(supplementRefs),
      controlRefs,
      evidenceRefs,
      overlayRefs: uniqueSorted([...overlayResult.overlayRefs, ...translated.overlayRefs]),
      observations,
      exhaustion,
      handshakes: ['preparation', 'resolution'],
      winningConcern: 'resolution',
      winningSource: 'none',
      translation: translated.translation,
      confidence: 'unbound',
      provenanceKind: 'unresolved',
      reason: 'No safe executable interpretation remained after exhausting explicit constraints, approved knowledge, prior evidence, live DOM exploration, and degraded resolution.',
      evidenceDrafts: [],
      proposalDrafts: [],
    };
  },
};
