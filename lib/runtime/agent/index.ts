import type { ResolutionReceipt, StepTask } from '../../domain/types';
import { resolveAction, allowedActionFallback, requiresElement } from './resolve-action';
import { resolveFromDom } from './dom-fallback';
import { proposalForSupplementGap } from './proposals';
import { explicitResolvedReceipt, needsHumanReceipt } from './receipt';
import { resolveElement, resolveOverride, resolvePosture, resolveScreen, resolveSnapshot } from './resolve-target';
import { selectedControlRefs, selectedControlResolution } from './select-controls';
import { recordExhaustion, uniqueSorted } from './shared';
import { resolveWithConfidenceOverlay, resolveWithTranslation } from './translation';
import type { RuntimeAgentStageContext, RuntimeStepAgentContext } from './types';

export const RESOLUTION_PRECEDENCE = [
  'explicit',
  'control',
  'approved-knowledge',
  'overlays',
  'translation',
  'live-dom',
  'needs-human',
] as const;

export async function runResolutionPipeline(task: StepTask, context: RuntimeStepAgentContext): Promise<ResolutionReceipt> {
  const stage: RuntimeAgentStageContext = {
    task,
    context,
    controlResolution: selectedControlResolution(task, context),
    controlRefs: selectedControlRefs(task, context),
    evidenceRefs: uniqueSorted(task.runtimeKnowledge.evidenceRefs),
    exhaustion: [],
    observations: [],
    knowledgeRefs: [],
    supplementRefs: [],
  };

  const explicit = task.explicitResolution;
  if (explicit?.action && explicit.screen && (!requiresElement(explicit.action) || explicit.element)) {
    recordExhaustion(stage.exhaustion, 'explicit', 'resolved', 'Explicit structured resolution satisfied executable requirements');
    return explicitResolvedReceipt(stage);
  }
  recordExhaustion(stage.exhaustion, 'explicit', explicit ? 'attempted' : 'skipped', explicit ? 'Explicit constraints were partial and used as priors' : 'No explicit constraints present');

  const actionResult = resolveAction(task, stage.controlResolution);
  const action = actionResult.action;
  stage.supplementRefs.push(...actionResult.supplementRefs);
  if (!action) {
    recordExhaustion(stage.exhaustion, 'approved-screen-bundle', 'failed', 'Unable to infer action from approved knowledge');
  }

  const screenResult = resolveScreen(task, action, stage.controlResolution, context.previousResolution);
  if (screenResult.screen) {
    stage.knowledgeRefs.push(...screenResult.screen.knowledgeRefs);
    stage.supplementRefs.push(...screenResult.supplementRefs);
    recordExhaustion(stage.exhaustion, 'approved-screen-bundle', 'attempted', `Selected screen ${screenResult.screen.screen}`);
  } else {
    recordExhaustion(stage.exhaustion, 'approved-screen-bundle', 'failed', 'No screen candidate matched approved knowledge priors');
  }

  const elementResult = resolveElement(task, screenResult.screen, stage.controlResolution);
  if (elementResult.element) {
    stage.supplementRefs.push(...elementResult.supplementRefs);
    recordExhaustion(stage.exhaustion, 'local-hints', 'attempted', `Matched element ${elementResult.element.element}`);
  } else {
    recordExhaustion(stage.exhaustion, 'local-hints', 'failed', 'No element candidate matched local hints');
  }

  const postureResult = resolvePosture(task, elementResult.element, stage.controlResolution);
  stage.supplementRefs.push(...postureResult.supplementRefs);
  recordExhaustion(stage.exhaustion, 'shared-patterns', postureResult.posture ? 'attempted' : 'skipped', postureResult.posture ? `Matched posture ${postureResult.posture}` : 'No shared posture pattern required');

  recordExhaustion(
    stage.exhaustion,
    'prior-evidence',
    task.runtimeKnowledge.evidenceRefs.length > 0 ? 'attempted' : 'skipped',
    task.runtimeKnowledge.evidenceRefs.length > 0 ? 'Prior evidence refs were available to the agent task' : 'No prior evidence refs available',
  );

  const override = resolveOverride(task, screenResult.screen, elementResult.element, postureResult.posture, stage.controlResolution, context);
  const snapshotResult = resolveSnapshot(task, screenResult.screen, elementResult.element, stage.controlResolution);
  stage.supplementRefs.push(...snapshotResult.supplementRefs);

  if (action && screenResult.screen && (!requiresElement(action) || elementResult.element) && (action !== 'assert-snapshot' || snapshotResult.snapshotTemplate)) {
    recordExhaustion(stage.exhaustion, 'safe-degraded-resolution', 'resolved', 'Approved deterministic priors produced an executable target');
    return {
      ...needsHumanReceipt(stage, [], null),
      kind: 'resolved',
      governance: 'approved',
      resolutionMode: 'deterministic',
      overlayRefs: [],
      winningConcern: 'knowledge',
      winningSource: override.source,
      translation: null,
      confidence: 'compiler-derived',
      provenanceKind: 'approved-knowledge',
      target: {
        action,
        screen: screenResult.screen.screen,
        element: elementResult.element?.element ?? null,
        posture: postureResult.posture,
        override: override.override,
        snapshot_template: snapshotResult.snapshotTemplate,
      },
    } as ResolutionReceipt;
  }

  const overlayResult = resolveWithConfidenceOverlay(task, action, screenResult.screen, elementResult.element, snapshotResult.snapshotTemplate);
  if (overlayResult.observation) {
    stage.observations.push(overlayResult.observation);
  }
  if (overlayResult.overlayRefs.length > 0) {
    recordExhaustion(stage.exhaustion, 'confidence-overlay', 'resolved', `Approved-equivalent overlays resolved ${overlayResult.overlayRefs.join(', ')}`);
    const overlayOverride = resolveOverride(task, overlayResult.screen, overlayResult.element, overlayResult.posture, stage.controlResolution, context);
    return {
      ...needsHumanReceipt(stage, [], null),
      kind: 'resolved',
      governance: 'approved',
      resolutionMode: 'deterministic',
      lineage: { sources: [...stage.controlRefs, ...stage.evidenceRefs, ...overlayResult.overlayRefs], parents: [task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
      overlayRefs: overlayResult.overlayRefs,
      winningConcern: 'knowledge',
      winningSource: 'approved-equivalent',
      confidence: 'agent-verified',
      provenanceKind: 'approved-knowledge',
      translation: null,
      target: {
        action: action ?? allowedActionFallback(task) ?? 'custom',
        screen: overlayResult.screen!.screen,
        element: overlayResult.element?.element ?? null,
        posture: overlayResult.posture ?? null,
        override: overlayOverride.override,
        snapshot_template: overlayResult.snapshotTemplate,
      },
    } as ResolutionReceipt;
  }
  recordExhaustion(stage.exhaustion, 'confidence-overlay', 'failed', 'No approved-equivalent confidence overlay produced an executable target');

  const translated = resolveWithTranslation(task, context.translate);
  if (translated.observation) {
    stage.observations.push(translated.observation);
  }
  if (translated.translation?.matched && translated.screen && (!requiresElement(action) || translated.element) && (action !== 'assert-snapshot' || snapshotResult.snapshotTemplate)) {
    recordExhaustion(stage.exhaustion, 'structured-translation', 'resolved', translated.translation.rationale);
    const translatedOverride = resolveOverride(task, translated.screen, translated.element, postureResult.posture, stage.controlResolution, context);
    return {
      ...needsHumanReceipt(stage, [], null),
      kind: 'resolved',
      governance: 'approved',
      resolutionMode: 'translation',
      lineage: { sources: [...stage.controlRefs, ...stage.evidenceRefs], parents: [task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
      overlayRefs: translated.overlayRefs,
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
    } as ResolutionReceipt;
  }
  recordExhaustion(stage.exhaustion, 'structured-translation', context.translate ? 'failed' : 'skipped', context.translate ? 'Structured translation did not produce an executable target' : 'No structured translation stage was configured');

  const domScreen = translated.screen ?? overlayResult.screen ?? screenResult.screen;
  const domResolved = await resolveFromDom(context.page, task, domScreen, action);
  if (domResolved.observation) {
    stage.observations.push(domResolved.observation);
  }
  if (domResolved.element && action && domScreen && (action !== 'assert-snapshot' || snapshotResult.snapshotTemplate)) {
    const liveScreen = domScreen;
    const liveElement = domResolved.element;
    recordExhaustion(stage.exhaustion, 'live-dom', 'attempted', `Live DOM resolved ${domResolved.element.element}`);
    recordExhaustion(stage.exhaustion, 'safe-degraded-resolution', 'resolved', 'A single live-DOM candidate remained after deterministic priors exhausted');
    const proposalDrafts = proposalForSupplementGap(task, liveScreen, liveElement);
    return {
      ...needsHumanReceipt(stage, [...overlayResult.overlayRefs, ...translated.overlayRefs], translated.translation),
      kind: 'resolved-with-proposals',
      governance: 'review-required',
      lineage: { sources: [], parents: [task.taskFingerprint], handshakes: ['preparation', 'resolution'] },
      winningSource: 'live-dom',
      confidence: 'agent-proposed',
      provenanceKind: 'live-exploration',
      target: {
        action,
        screen: liveScreen.screen,
        element: liveElement.element,
        posture: postureResult.posture,
        override: resolveOverride(task, liveScreen, liveElement, postureResult.posture, stage.controlResolution, context).override,
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
    } as ResolutionReceipt;
  }

  recordExhaustion(stage.exhaustion, 'live-dom', context.page ? 'failed' : 'skipped', context.page ? 'Live DOM did not produce a unique safe resolution' : 'No live runtime page was available');
  recordExhaustion(stage.exhaustion, 'safe-degraded-resolution', 'failed', 'No safe degraded resolution remained after all machine paths were exhausted');

  return needsHumanReceipt(stage, [...overlayResult.overlayRefs, ...translated.overlayRefs], translated.translation);
}

export type { RuntimeStepAgentContext } from './types';
