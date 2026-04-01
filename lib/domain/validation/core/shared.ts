/**
 * Shared validation helpers extracted from legacy-core-validator.ts.
 * Used by context-specific validators (intent, knowledge, execution, governance, resolution, graph).
 */
import * as schemaDecode from '../../schemas/decode';
import * as schemas from '../../schemas';
import { mintApproved } from '../../types/workflow';
import type { ScenarioInterpretationSurface } from '../../types';
import type {
  SharedPatterns,
  BoundStep,
  CompilerDiagnostic,
  Confidence,
  EffectTargetKind,
  ElementSig,
  Governance,
  LocatorStrategy,
  PostureEffect,
  RefPath,
  ResolutionReceipt,
  ScenarioStep,
  StepAction,
  StepExecutionReceipt,
  StepInstruction,
  StepProgram,
  StepResolution,
  SurfaceDefinition,
  SurfaceSection,
  TrustPolicyArtifactType,
  ValueRef,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
  WorkflowLane,
  WorkflowScope,
  WorkflowStage,
} from '../../types';
import type { RecoveryPolicy } from '../../execution/recovery-policy';
import { SchemaError } from '../../kernel/errors';
import { uniqueSorted } from '../../kernel/collections';
import {
  createAdoId,
  createCanonicalTargetRef,
  createElementId,
  createEventSignatureRef,
  createFixtureId,
  createPostureId,
  createScreenId,
  createSelectorRef,
  createSectionId,
  createSnapshotTemplateId,
  createStateNodeRef,
  createSurfaceId,
  createTransitionRef,
  createWidgetId,
  ensureSafeRelativePathLike,
} from '../../kernel/identity';
import {
  expectArray,
  expectBoolean,
  expectEnum,
  expectId,
  expectIdArray,
  expectNumber,
  expectOptionalId,
  expectOptionalString,
  expectRecord,
  expectString,
  expectStringArray,
  expectStringRecord,
  type UnknownRecord,
} from '../primitives';

// ── Enum constant arrays ──────────────────────────────────────────────

export const scenarioStatuses = ['stub', 'draft', 'active', 'needs-repair', 'blocked', 'deprecated'] as const;
export const stepActions = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const;
export const confidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound'] as const;
export const resolutionModes = ['deterministic', 'translation', 'agentic'] as const;
export const valueRefKinds = ['literal', 'fixture-path', 'posture-sample', 'parameter-row', 'generated-token'] as const;
export const stepInstructionKinds = ['navigate', 'enter', 'invoke', 'observe-structure', 'custom-escape-hatch'] as const;
export const surfaceKinds = ['screen-root', 'form', 'action-cluster', 'validation-region', 'result-set', 'details-pane', 'modal', 'section-root'] as const;
export const assertionKinds = ['state', 'structure'] as const;
export const effectTargetKinds = ['self', 'element', 'surface'] as const;
export const governanceStates = ['approved', 'review-required', 'blocked'] as const;
export const certificationStates = ['uncertified', 'certified'] as const;
export const locatorStrategyKinds = ['test-id', 'role-name', 'css'] as const;
export const effectStates = ['validation-error', 'required-error', 'disabled', 'enabled', 'visible', 'hidden'] as const;
export const diagnosticSeverities = ['info', 'warn', 'error'] as const;
export const diagnosticConfidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound', 'mixed'] as const;
export const workflowStages = ['preparation', 'resolution', 'execution', 'evidence', 'proposal', 'projection'] as const;
export const workflowScopes = ['scenario', 'step', 'run', 'suite', 'workspace', 'control'] as const;
export const workflowLanes = ['intent', 'knowledge', 'control', 'resolution', 'execution', 'governance', 'projection'] as const;
export const stepWinningSources = ['scenario-explicit', 'resolution-control', 'runbook-dataset', 'default-dataset', 'knowledge-hint', 'posture-sample', 'generated-token', 'approved-knowledge', 'approved-equivalent', 'prior-evidence', 'structured-translation', 'live-dom', 'agent-interpreted', 'none'] as const;
export const statePredicateSemantics = ['visible', 'hidden', 'enabled', 'disabled', 'valid', 'invalid', 'open', 'closed', 'expanded', 'collapsed', 'populated', 'cleared', 'active-route', 'active-modal'] as const;
export const transitionEffectKinds = ['reveal', 'hide', 'enable', 'disable', 'validate', 'invalidate', 'open', 'close', 'navigate', 'return', 'expand', 'collapse', 'populate', 'clear'] as const;
export const graphNodeKinds = ['snapshot', 'screen', 'screen-hints', 'pattern', 'confidence-overlay', 'dataset', 'resolution-control', 'runbook', 'section', 'surface', 'element', 'posture', 'capability', 'scenario', 'step', 'generated-spec', 'generated-trace', 'generated-review', 'evidence', 'policy-decision', 'participant', 'intervention', 'improvement-run', 'acceptance-decision'] as const;
export const graphEdgeKinds = ['derived-from', 'contains', 'references', 'uses', 'learns-from', 'affects', 'asserts', 'emits', 'observed-by', 'proposed-change-for', 'governs', 'drifts-to'] as const;

// ── Re-exports for context validators ─────────────────────────────────

export {
  schemaDecode, schemas, mintApproved, SchemaError, uniqueSorted,
  createAdoId, createCanonicalTargetRef, createElementId, createEventSignatureRef,
  createFixtureId, createPostureId, createScreenId, createSelectorRef,
  createSectionId, createSnapshotTemplateId, createStateNodeRef,
  createSurfaceId, createTransitionRef, createWidgetId, ensureSafeRelativePathLike,
  expectArray, expectBoolean, expectEnum, expectId, expectIdArray,
  expectNumber, expectOptionalId, expectOptionalString, expectRecord,
  expectString, expectStringArray, expectStringRecord,
};
export type { UnknownRecord };

// ── Workflow envelope validators ──────────────────────────────────────

export function validateWorkflowEnvelopeIds(value: unknown, path: string): WorkflowEnvelopeIds {
  const ids = expectRecord(value ?? {}, path);
  return {
    adoId: expectOptionalId(ids.adoId, `${path}.adoId`, createAdoId) ?? null,
    suite: expectOptionalString(ids.suite, `${path}.suite`) ?? null,
    sessionId: expectOptionalString(ids.sessionId, `${path}.sessionId`) ?? null,
    runId: expectOptionalString(ids.runId, `${path}.runId`) ?? null,
    stepIndex: ids.stepIndex === undefined || ids.stepIndex === null ? null : expectNumber(ids.stepIndex, `${path}.stepIndex`),
    dataset: expectOptionalString(ids.dataset, `${path}.dataset`) ?? null,
    runbook: expectOptionalString(ids.runbook, `${path}.runbook`) ?? null,
    resolutionControl: expectOptionalString(ids.resolutionControl, `${path}.resolutionControl`) ?? null,
    participantIds: expectStringArray(ids.participantIds ?? [], `${path}.participantIds`),
    interventionIds: expectStringArray(ids.interventionIds ?? [], `${path}.interventionIds`),
    improvementRunId: expectOptionalString(ids.improvementRunId, `${path}.improvementRunId`) ?? null,
    iteration: ids.iteration === undefined || ids.iteration === null ? null : expectNumber(ids.iteration, `${path}.iteration`),
    parentExperimentId: expectOptionalString(ids.parentExperimentId, `${path}.parentExperimentId`) ?? null,
  };
}

export function validateWorkflowEnvelopeFingerprints(value: unknown, path: string, fallbackArtifact: string): WorkflowEnvelopeFingerprints {
  const fingerprints = expectRecord(value ?? {}, path);
  return {
    artifact: expectOptionalString(fingerprints.artifact, `${path}.artifact`) ?? fallbackArtifact,
    content: expectOptionalString(fingerprints.content, `${path}.content`) ?? null,
    knowledge: expectOptionalString(fingerprints.knowledge, `${path}.knowledge`) ?? null,
    controls: expectOptionalString(fingerprints.controls, `${path}.controls`) ?? null,
    task: expectOptionalString(fingerprints.task, `${path}.task`) ?? null,
    run: expectOptionalString(fingerprints.run, `${path}.run`) ?? null,
  };
}

export function validateWorkflowEnvelopeLineage(value: unknown, path: string, defaults?: Partial<WorkflowEnvelopeLineage>): WorkflowEnvelopeLineage {
  const lineage = expectRecord(value ?? {}, path);
  return {
    sources: expectStringArray(lineage.sources ?? defaults?.sources ?? [], `${path}.sources`),
    parents: expectStringArray(lineage.parents ?? defaults?.parents ?? [], `${path}.parents`),
    handshakes: expectArray(lineage.handshakes ?? defaults?.handshakes ?? [], `${path}.handshakes`).map((entry, index) =>
      expectEnum(entry, `${path}.handshakes[${index}]`, workflowStages),
    ) as WorkflowStage[],
    experimentIds: expectStringArray(lineage.experimentIds ?? defaults?.experimentIds ?? [], `${path}.experimentIds`),
  };
}

export function validateWorkflowEnvelopeHeader<Stage extends WorkflowStage, Scope extends WorkflowScope>(
  value: UnknownRecord,
  path: string,
  defaults: {
    stage: Stage;
    scope: Scope;
    governance: Governance;
    artifactFingerprint: string;
    ids?: Partial<WorkflowEnvelopeIds>;
    lineage?: Partial<WorkflowEnvelopeLineage>;
  },
): {
  version: 1;
  stage: Stage;
  scope: Scope;
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
} {
  const decoded = {
    version: value.version === undefined ? 1 : expectNumber(value.version, `${path}.version`) as 1,
    stage: value.stage === undefined ? defaults.stage : expectEnum(value.stage, `${path}.stage`, workflowStages) as Stage,
    scope: value.scope === undefined ? defaults.scope : expectEnum(value.scope, `${path}.scope`, workflowScopes) as Scope,
    ids: {
      ...defaults.ids,
      ...validateWorkflowEnvelopeIds(value.ids, `${path}.ids`),
    },
    fingerprints: validateWorkflowEnvelopeFingerprints(value.fingerprints, `${path}.fingerprints`, defaults.artifactFingerprint),
    lineage: validateWorkflowEnvelopeLineage(value.lineage, `${path}.lineage`, defaults.lineage),
    governance: value.governance === undefined ? defaults.governance : expectEnum(value.governance, `${path}.governance`, governanceStates),
  };
  return schemaDecode.decoderFor<{
    version: 1;
    stage: Stage;
    scope: Scope;
    ids: WorkflowEnvelopeIds;
    fingerprints: WorkflowEnvelopeFingerprints;
    lineage: WorkflowEnvelopeLineage;
    governance: Governance;
  }>(schemas.WorkflowEnvelopeHeaderSchema)(decoded);
}

// ── Primitive field validators ────────────────────────────────────────

export function validateAction(value: unknown, path: string): StepAction {
  return expectEnum(value, path, stepActions);
}

export function validateConfidence(value: unknown, path: string): Confidence {
  return expectEnum(value, path, confidences);
}

export function validateRefPath(value: unknown, path: string): RefPath {
  const refPath = expectRecord(value, path);
  return {
    segments: expectStringArray(refPath.segments, `${path}.segments`),
  };
}

export function validateTrustPolicyArtifactType(value: unknown, path: string): TrustPolicyArtifactType {
  return expectEnum(value, path, ['elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns'] as const);
}

export function validateCanonicalLineage(value: unknown, path: string) {
  const lineage = expectRecord(value ?? {}, path);
  return {
    runIds: expectStringArray(lineage.runIds ?? [], `${path}.runIds`),
    evidenceIds: expectStringArray(lineage.evidenceIds ?? [], `${path}.evidenceIds`),
    sourceArtifactPaths: expectStringArray(lineage.sourceArtifactPaths ?? [], `${path}.sourceArtifactPaths`),
    role: expectOptionalString(lineage.role, `${path}.role`) ?? null,
    state: expectOptionalString(lineage.state, `${path}.state`) ?? null,
    driftSeed: expectOptionalString(lineage.driftSeed, `${path}.driftSeed`) ?? null,
  };
}

export function validateProposalActivation(value: unknown, path: string) {
  const activation = expectRecord(value ?? {}, path);
  return {
    status: expectEnum(activation.status ?? 'pending', `${path}.status`, ['pending', 'activated', 'blocked'] as const),
    activatedAt: expectOptionalString(activation.activatedAt, `${path}.activatedAt`) ?? null,
    certifiedAt: expectOptionalString(activation.certifiedAt, `${path}.certifiedAt`) ?? null,
    reason: expectOptionalString(activation.reason, `${path}.reason`) ?? null,
  };
}

// ── Step-level validators ─────────────────────────────────────────────

export function validateStepResolution(value: unknown, path: string): StepResolution {
  const decoded = schemaDecode.decoderFor<StepResolution>(schemas.StepResolutionSchema)(value);
  return {
    ...decoded,
    action: decoded.action ?? undefined,
  };
}

export function validateValueRef(value: unknown, path: string): ValueRef {
  const ref = expectRecord(value, path);
  const kind = expectEnum(ref.kind, `${path}.kind`, valueRefKinds);

  switch (kind) {
    case 'literal':
      return { kind, value: expectString(ref.value, `${path}.value`) };
    case 'fixture-path':
      return { kind, path: validateRefPath(ref.path, `${path}.path`) };
    case 'posture-sample':
      return {
        kind,
        element: expectId(ref.element, `${path}.element`, createElementId),
        posture: expectId(ref.posture, `${path}.posture`, createPostureId),
        sampleIndex: expectNumber(ref.sampleIndex, `${path}.sampleIndex`),
      };
    case 'parameter-row':
      return {
        kind,
        name: expectString(ref.name, `${path}.name`),
        rowIndex: expectNumber(ref.rowIndex, `${path}.rowIndex`),
      };
    case 'generated-token':
      return { kind, token: expectString(ref.token, `${path}.token`) };
  }
}

export function validateStepInstruction(value: unknown, path: string): StepInstruction {
  const instruction = expectRecord(value, path);
  const kind = expectEnum(instruction.kind, `${path}.kind`, stepInstructionKinds);

  switch (kind) {
    case 'navigate':
      return { kind, screen: expectId(instruction.screen, `${path}.screen`, createScreenId) };
    case 'enter':
      return {
        kind,
        screen: expectId(instruction.screen, `${path}.screen`, createScreenId),
        element: expectId(instruction.element, `${path}.element`, createElementId),
        posture: expectOptionalId(instruction.posture, `${path}.posture`, createPostureId) ?? null,
        value: instruction.value === undefined || instruction.value === null ? null : validateValueRef(instruction.value, `${path}.value`),
      };
    case 'invoke':
      return {
        kind,
        screen: expectId(instruction.screen, `${path}.screen`, createScreenId),
        element: expectId(instruction.element, `${path}.element`, createElementId),
        action: expectEnum(instruction.action, `${path}.action`, ['click'] as const),
      };
    case 'observe-structure':
      return {
        kind,
        screen: expectId(instruction.screen, `${path}.screen`, createScreenId),
        element: expectId(instruction.element, `${path}.element`, createElementId),
        snapshotTemplate: expectId(instruction.snapshotTemplate, `${path}.snapshotTemplate`, createSnapshotTemplateId),
      };
    case 'custom-escape-hatch':
      return { kind, reason: expectString(instruction.reason, `${path}.reason`) };
  }
}

export function validateStepProgram(value: unknown, path: string): StepProgram {
  const program = expectRecord(value, path);
  return {
    kind: expectEnum(program.kind, `${path}.kind`, ['step-program'] as const),
    instructions: expectArray(program.instructions ?? [], `${path}.instructions`).map((entry, index) =>
      validateStepInstruction(entry, `${path}.instructions[${index}]`),
    ),
  };
}

export function validateBoundStep(value: unknown, _path: string): BoundStep {
  return schemaDecode.decoderFor<BoundStep>(schemas.BoundStepSchema)(value);
}

export function validateStepBase(value: unknown, path: string): ScenarioStep {
  const step = expectRecord(value, path);
  const resolution = step.resolution === undefined || step.resolution === null
    ? null
    : validateStepResolution(step.resolution, `${path}.resolution`);
  return {
    index: expectNumber(step.index, `${path}.index`),
    intent: expectString(step.intent ?? step.action_text, `${path}.intent`),
    action_text: expectString(step.action_text ?? step.intent, `${path}.action_text`),
    expected_text: expectString(step.expected_text ?? '', `${path}.expected_text`),
    action: step.action === undefined
      ? (resolution?.action ?? 'custom')
      : validateAction(step.action, `${path}.action`),
    screen: expectOptionalId(step.screen ?? resolution?.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(step.element ?? resolution?.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(step.posture ?? resolution?.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(step.override ?? resolution?.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(step.snapshot_template ?? resolution?.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
    resolution,
    confidence: validateConfidence(step.confidence, `${path}.confidence`),
  };
}

// ── Diagnostic validator ──────────────────────────────────────────────

export function validateDiagnostic(value: unknown, path: string): CompilerDiagnostic {
  const diagnostic = expectRecord(value, path);
  const provenance = diagnostic.provenance ? expectRecord(diagnostic.provenance, `${path}.provenance`) : {};
  const confidenceValue = provenance.confidence;

  return {
    code: expectString(diagnostic.code, `${path}.code`),
    severity: expectEnum(diagnostic.severity, `${path}.severity`, diagnosticSeverities),
    message: expectString(diagnostic.message, `${path}.message`),
    adoId: expectId(diagnostic.adoId, `${path}.adoId`, createAdoId),
    stepIndex: diagnostic.stepIndex === undefined ? undefined : expectNumber(diagnostic.stepIndex, `${path}.stepIndex`),
    artifactPath: diagnostic.artifactPath === undefined ? undefined : expectString(diagnostic.artifactPath, `${path}.artifactPath`),
    provenance: {
      sourceRevision: provenance.sourceRevision === undefined ? undefined : expectNumber(provenance.sourceRevision, `${path}.provenance.sourceRevision`),
      contentHash: provenance.contentHash === undefined ? undefined : expectString(provenance.contentHash, `${path}.provenance.contentHash`),
      scenarioPath: provenance.scenarioPath === undefined ? undefined : expectString(provenance.scenarioPath, `${path}.provenance.scenarioPath`),
      snapshotPath: provenance.snapshotPath === undefined ? undefined : expectString(provenance.snapshotPath, `${path}.provenance.snapshotPath`),
      knowledgePath: provenance.knowledgePath === undefined ? undefined : expectString(provenance.knowledgePath, `${path}.provenance.knowledgePath`),
      confidence:
        confidenceValue === undefined
          ? undefined
          : (expectEnum(confidenceValue, `${path}.provenance.confidence`, diagnosticConfidences) as Confidence | 'mixed'),
    },
  };
}

// ── Locator, element, effect validators ───────────────────────────────

export function validateLocatorStrategy(value: unknown, path: string): LocatorStrategy {
  const strategy = expectRecord(value, path);
  const kind = expectEnum(strategy.kind, `${path}.kind`, locatorStrategyKinds);

  switch (kind) {
    case 'test-id':
      return { kind, value: expectString(strategy.value, `${path}.value`) };
    case 'role-name':
      return {
        kind,
        role: expectString(strategy.role, `${path}.role`),
        name: expectOptionalString(strategy.name, `${path}.name`) ?? null,
      };
    case 'css':
      return { kind, value: expectString(strategy.value, `${path}.value`) };
  }
}

export function validateElement(value: unknown, path: string): ElementSig {
  const element = expectRecord(value, path);
  const role = expectString(element.role, `${path}.role`);
  const name = expectOptionalString(element.name, `${path}.name`) ?? null;
  const testId = expectOptionalString(element.testId, `${path}.testId`) ?? null;
  const cssFallback = expectOptionalString(element.cssFallback, `${path}.cssFallback`) ?? null;
  const locator = element.locator === undefined
    ? [
        ...(testId ? [{ kind: 'test-id', value: testId } as const] : []),
        { kind: 'role-name' as const, role, name },
        ...(cssFallback ? [{ kind: 'css', value: cssFallback } as const] : []),
      ]
    : expectArray(element.locator, `${path}.locator`).map((entry, index) => validateLocatorStrategy(entry, `${path}.locator[${index}]`));

  return {
    role,
    name,
    testId,
    cssFallback,
    locator,
    surface: expectId(element.surface, `${path}.surface`, createSurfaceId),
    widget: expectId(element.widget, `${path}.widget`, createWidgetId),
    affordance: expectOptionalString(element.affordance, `${path}.affordance`) ?? null,
    required: element.required === undefined ? undefined : expectBoolean(element.required, `${path}.required`),
  };
}

export function validateEffect(value: unknown, path: string): PostureEffect {
  const effect = expectRecord(value, path);
  const targetKind =
    effect.targetKind === undefined
      ? undefined
      : (expectEnum(effect.targetKind, `${path}.targetKind`, effectTargetKinds) as EffectTargetKind);

  if (effect.target === 'self' || targetKind === 'self') {
    return {
      target: 'self',
      targetKind: 'self',
      state: expectEnum(effect.state, `${path}.state`, effectStates),
      message: expectOptionalString(effect.message, `${path}.message`) ?? null,
    };
  }

  return {
    target:
      targetKind === 'surface'
        ? expectId(effect.target, `${path}.target`, createSurfaceId)
        : expectId(effect.target, `${path}.target`, createElementId),
    targetKind,
    state: expectEnum(effect.state, `${path}.state`, effectStates),
    message: expectOptionalString(effect.message, `${path}.message`) ?? null,
  };
}

// ── Resolution sub-validators ─────────────────────────────────────────

export function validateResolutionCandidateSummary(value: unknown, path: string) {
  const summary = expectRecord(value, path);
  return {
    concern: expectEnum(summary.concern, `${path}.concern`, ['action', 'screen', 'element', 'posture', 'snapshot'] as const),
    source: expectEnum(summary.source, `${path}.source`, ['explicit', 'control', 'approved-screen-knowledge', 'shared-patterns', 'prior-evidence', 'approved-equivalent-overlay', 'structured-translation', 'live-dom'] as const),
    value: expectString(summary.value, `${path}.value`),
    score: expectNumber(summary.score, `${path}.score`),
    reason: expectString(summary.reason, `${path}.reason`),
  };
}

export function validateResolutionObservation(value: unknown, path: string) {
  const observation = expectRecord(value, path);
  return {
    source: expectEnum(observation.source, `${path}.source`, ['approved-screen-knowledge', 'shared-patterns', 'prior-evidence', 'approved-equivalent-overlay', 'structured-translation', 'live-dom', 'runtime'] as const),
    summary: expectString(observation.summary, `${path}.summary`),
    detail: observation.detail === undefined ? undefined : expectStringRecord(observation.detail, `${path}.detail`),
    topCandidates: observation.topCandidates === undefined ? undefined : expectArray(observation.topCandidates, `${path}.topCandidates`).map((entry, index) => validateResolutionCandidateSummary(entry, `${path}.topCandidates[${index}]`)),
    rejectedCandidates: observation.rejectedCandidates === undefined ? undefined : expectArray(observation.rejectedCandidates, `${path}.rejectedCandidates`).map((entry, index) => validateResolutionCandidateSummary(entry, `${path}.rejectedCandidates[${index}]`)),
  };
}

export function validateResolutionExhaustionEntry(value: unknown, path: string) {
  const entry = expectRecord(value, path);
  return {
    stage: expectEnum(entry.stage, `${path}.stage`, ['explicit', 'control', 'approved-screen-knowledge', 'shared-patterns', 'prior-evidence', 'approved-equivalent-overlay', 'structured-translation', 'live-dom', 'agent-interpreted', 'needs-human'] as const),
    outcome: expectEnum(entry.outcome, `${path}.outcome`, ['attempted', 'resolved', 'skipped', 'failed'] as const),
    reason: expectString(entry.reason, `${path}.reason`),
    topCandidates: entry.topCandidates === undefined ? undefined : expectArray(entry.topCandidates, `${path}.topCandidates`).map((candidate, index) => validateResolutionCandidateSummary(candidate, `${path}.topCandidates[${index}]`)),
    rejectedCandidates: entry.rejectedCandidates === undefined ? undefined : expectArray(entry.rejectedCandidates, `${path}.rejectedCandidates`).map((candidate, index) => validateResolutionCandidateSummary(candidate, `${path}.rejectedCandidates[${index}]`)),
  };
}

export function validateResolutionEvidenceDraft(value: unknown, path: string) {
  const draft = expectRecord(value, path);
  const proposal = expectRecord(draft.proposal, `${path}.proposal`);
  return {
    type: expectString(draft.type, `${path}.type`),
    trigger: expectString(draft.trigger, `${path}.trigger`),
    observation: expectStringRecord(draft.observation ?? {}, `${path}.observation`),
    proposal: {
      file: expectString(proposal.file, `${path}.proposal.file`),
      field: expectString(proposal.field, `${path}.proposal.field`),
      old_value: expectOptionalString(proposal.old_value, `${path}.proposal.old_value`) ?? null,
      new_value: expectOptionalString(proposal.new_value, `${path}.proposal.new_value`) ?? null,
    },
    confidence: expectNumber(draft.confidence, `${path}.confidence`),
    risk: expectEnum(draft.risk, `${path}.risk`, ['low', 'medium', 'high'] as const),
    scope: expectString(draft.scope, `${path}.scope`),
  };
}

export function validateResolutionProposalDraft(value: unknown, path: string) {
  const draft = expectRecord(value, path);
  return {
    artifactType: validateTrustPolicyArtifactType(draft.artifactType, `${path}.artifactType`),
    targetPath: expectString(draft.targetPath, `${path}.targetPath`),
    title: expectString(draft.title, `${path}.title`),
    patch: expectRecord(draft.patch ?? {}, `${path}.patch`),
    rationale: expectString(draft.rationale, `${path}.rationale`),
  };
}

export function validateResolutionTarget(value: unknown, path: string) {
  const target = expectRecord(value, path);
  return {
    action: validateAction(target.action, `${path}.action`),
    screen: expectId(target.screen, `${path}.screen`, createScreenId),
    element: expectOptionalId(target.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(target.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(target.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(target.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
    semanticDestination: expectOptionalString(target.semanticDestination, `${path}.semanticDestination`) ?? null,
    routeVariantRef: expectOptionalString(target.routeVariantRef, `${path}.routeVariantRef`) ?? null,
  };
}

export function validateResolutionControlSelector(value: unknown, path: string) {
  const selector = expectRecord(value ?? {}, path);
  return {
    adoIds: expectIdArray(selector.adoIds ?? [], `${path}.adoIds`, createAdoId),
    suites: expectStringArray(selector.suites ?? [], `${path}.suites`).map((entry, index) =>
      ensureSafeRelativePathLike(entry, `${path}.suites[${index}]`),
    ),
    tags: expectStringArray(selector.tags ?? [], `${path}.tags`),
  };
}

export function validateRecoveryPolicy(value: unknown, path: string) {
  const policy = expectRecord(value, path);
  const families = expectRecord(policy.families ?? {}, `${path}.families`);
  const familyNames = ['precondition-failure', 'locator-degradation-failure', 'environment-runtime-failure'] as const;
  return {
    version: expectNumber(policy.version ?? 1, `${path}.version`) as 1,
    profile: expectString(policy.profile ?? 'default', `${path}.profile`),
    families: Object.fromEntries(familyNames.map((family) => {
      const familyConfig = expectRecord(families[family] ?? {}, `${path}.families.${family}`);
      const budget = expectRecord(familyConfig.budget ?? {}, `${path}.families.${family}.budget`);
      return [family, {
        budget: {
          maxAttempts: expectNumber(budget.maxAttempts ?? 0, `${path}.families.${family}.budget.maxAttempts`),
          maxTotalMs: expectNumber(budget.maxTotalMs ?? 0, `${path}.families.${family}.budget.maxTotalMs`),
          backoffMs: expectNumber(budget.backoffMs ?? 0, `${path}.families.${family}.budget.backoffMs`),
        },
        strategies: expectArray(familyConfig.strategies ?? [], `${path}.families.${family}.strategies`).map((entry, index) => {
          const strategy = expectRecord(entry, `${path}.families.${family}.strategies[${index}]`);
          return {
            id: expectEnum(strategy.id, `${path}.families.${family}.strategies[${index}].id`, ['verify-prerequisites', 'execute-prerequisite-actions', 'force-alternate-locator-rungs', 'snapshot-guided-reresolution', 'bounded-retry-with-backoff', 'refresh-runtime'] as const),
            enabled: expectBoolean(strategy.enabled, `${path}.families.${family}.strategies[${index}].enabled`),
            maxAttempts: strategy.maxAttempts === undefined ? undefined : expectNumber(strategy.maxAttempts, `${path}.families.${family}.strategies[${index}].maxAttempts`),
            backoffMs: strategy.backoffMs === undefined ? undefined : expectNumber(strategy.backoffMs, `${path}.families.${family}.strategies[${index}].backoffMs`),
            diagnostics: expectStringArray(strategy.diagnostics ?? [], `${path}.families.${family}.strategies[${index}].diagnostics`),
          };
        }),
      }];
    })) as RecoveryPolicy['families'],
  } satisfies RecoveryPolicy;
}

// ── Translation receipt ───────────────────────────────────────────────

export function validateTranslationReceipt(value: unknown, path: string) {
  const receipt = expectRecord(value, path);
  return {
    kind: expectEnum(receipt.kind, `${path}.kind`, ['translation-receipt'] as const),
    version: expectNumber(receipt.version, `${path}.version`) as 1,
    mode: expectEnum(receipt.mode, `${path}.mode`, ['structured-translation'] as const),
    matched: expectBoolean(receipt.matched, `${path}.matched`),
    selected: receipt.selected === undefined || receipt.selected === null
      ? null
      : (() => {
          const candidate = expectRecord(receipt.selected, `${path}.selected`);
          return {
            kind: expectEnum(candidate.kind, `${path}.selected.kind`, ['screen', 'element', 'posture', 'snapshot-template'] as const),
            target: expectString(candidate.target, `${path}.selected.target`),
            screen: expectOptionalId(candidate.screen, `${path}.selected.screen`, createScreenId) ?? null,
            element: expectOptionalId(candidate.element, `${path}.selected.element`, createElementId) ?? null,
            posture: expectOptionalId(candidate.posture, `${path}.selected.posture`, createPostureId) ?? null,
            snapshotTemplate: expectOptionalId(candidate.snapshotTemplate, `${path}.selected.snapshotTemplate`, createSnapshotTemplateId) ?? null,
            aliases: expectStringArray(candidate.aliases ?? [], `${path}.selected.aliases`),
            score: expectNumber(candidate.score, `${path}.selected.score`),
            sourceRefs: expectStringArray(candidate.sourceRefs ?? [], `${path}.selected.sourceRefs`),
          };
        })(),
    candidates: expectArray(receipt.candidates ?? [], `${path}.candidates`).map((entry, index) => {
      const candidate = expectRecord(entry, `${path}.candidates[${index}]`);
      return {
        kind: expectEnum(candidate.kind, `${path}.candidates[${index}].kind`, ['screen', 'element', 'posture', 'snapshot-template'] as const),
        target: expectString(candidate.target, `${path}.candidates[${index}].target`),
        screen: expectOptionalId(candidate.screen, `${path}.candidates[${index}].screen`, createScreenId) ?? null,
        element: expectOptionalId(candidate.element, `${path}.candidates[${index}].element`, createElementId) ?? null,
        posture: expectOptionalId(candidate.posture, `${path}.candidates[${index}].posture`, createPostureId) ?? null,
        snapshotTemplate: expectOptionalId(candidate.snapshotTemplate, `${path}.candidates[${index}].snapshotTemplate`, createSnapshotTemplateId) ?? null,
        aliases: expectStringArray(candidate.aliases ?? [], `${path}.candidates[${index}].aliases`),
        score: expectNumber(candidate.score, `${path}.candidates[${index}].score`),
        sourceRefs: expectStringArray(candidate.sourceRefs ?? [], `${path}.candidates[${index}].sourceRefs`),
      };
    }),
    rationale: expectString(receipt.rationale, `${path}.rationale`),
    cache: receipt.cache === undefined || receipt.cache === null
      ? undefined
      : (() => {
          const cache = expectRecord(receipt.cache, `${path}.cache`);
          return {
            key: expectString(cache.key, `${path}.cache.key`),
            status: expectEnum(cache.status, `${path}.cache.status`, ['hit', 'miss', 'disabled'] as const),
            reason: expectOptionalString(cache.reason, `${path}.cache.reason`) ?? null,
          };
        })(),
    failureClass: receipt.failureClass === undefined
      ? undefined
      : expectEnum(receipt.failureClass, `${path}.failureClass`, ['none', 'no-candidate', 'runtime-disabled', 'cache-disabled', 'cache-miss', 'cache-invalidated', 'translator-error'] as const),
  };
}

// ── Resolution receipt ────────────────────────────────────────────────

export function validateResolutionReceipt(value: unknown, path: string): ResolutionReceipt {
  const receipt = expectRecord(value, path);
  const header = validateWorkflowEnvelopeHeader(receipt, path, {
    stage: 'resolution',
    scope: 'step',
    governance: mintApproved(),
    artifactFingerprint: expectOptionalString(receipt.taskFingerprint, `${path}.taskFingerprint`) ?? `${path}:resolution`,
    ids: {
      stepIndex: receipt.stepIndex === undefined ? null : expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation', 'resolution'],
    },
  });
  const base = {
    ...header,
    taskFingerprint: expectString(receipt.taskFingerprint, `${path}.taskFingerprint`),
    knowledgeFingerprint: expectString(receipt.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    provider: expectString(receipt.provider, `${path}.provider`),
    mode: expectString(receipt.mode, `${path}.mode`),
    runAt: expectString(receipt.runAt, `${path}.runAt`),
    stepIndex: expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    resolutionMode: expectEnum(receipt.resolutionMode ?? 'deterministic', `${path}.resolutionMode`, resolutionModes),
    knowledgeRefs: expectStringArray(receipt.knowledgeRefs ?? [], `${path}.knowledgeRefs`),
    supplementRefs: expectStringArray(receipt.supplementRefs ?? [], `${path}.supplementRefs`),
    controlRefs: expectStringArray(receipt.controlRefs ?? [], `${path}.controlRefs`),
    evidenceRefs: expectStringArray(receipt.evidenceRefs ?? [], `${path}.evidenceRefs`),
    overlayRefs: expectStringArray(receipt.overlayRefs ?? [], `${path}.overlayRefs`),
    observations: expectArray(receipt.observations ?? [], `${path}.observations`).map((entry, index) =>
      validateResolutionObservation(entry, `${path}.observations[${index}]`),
    ),
    exhaustion: expectArray(receipt.exhaustion ?? [], `${path}.exhaustion`).map((entry, index) =>
      validateResolutionExhaustionEntry(entry, `${path}.exhaustion[${index}]`),
    ),
    evidenceDrafts: expectArray(receipt.evidenceDrafts ?? [], `${path}.evidenceDrafts`).map((entry, index) =>
      validateResolutionEvidenceDraft(entry, `${path}.evidenceDrafts[${index}]`),
    ),
    proposalDrafts: expectArray(receipt.proposalDrafts ?? [], `${path}.proposalDrafts`).map((entry, index) =>
      validateResolutionProposalDraft(entry, `${path}.proposalDrafts[${index}]`),
    ),
    handshakes: expectArray(receipt.handshakes ?? ['preparation', 'resolution'], `${path}.handshakes`).map((entry, index) =>
      expectEnum(entry, `${path}.handshakes[${index}]`, workflowStages),
    ) as WorkflowStage[],
    winningConcern: receipt.winningConcern === undefined
      ? 'resolution'
      : expectEnum(receipt.winningConcern, `${path}.winningConcern`, workflowLanes) as WorkflowLane,
    winningSource: receipt.winningSource === undefined
      ? 'none'
      : expectEnum(receipt.winningSource, `${path}.winningSource`, stepWinningSources),
    translation: receipt.translation === undefined || receipt.translation === null
      ? null
      : validateTranslationReceipt(receipt.translation, `${path}.translation`),
  };
  const kind = expectEnum(receipt.kind, `${path}.kind`, ['resolved', 'resolved-with-proposals', 'agent-interpreted', 'needs-human'] as const);
  if (kind === 'needs-human') {
    return {
      ...base,
      kind,
      confidence: expectEnum(receipt.confidence, `${path}.confidence`, ['unbound'] as const),
      provenanceKind: expectEnum(receipt.provenanceKind, `${path}.provenanceKind`, ['unresolved'] as const),
      reason: expectString(receipt.reason, `${path}.reason`),
    };
  }
  if (kind === 'agent-interpreted') {
    return {
      ...base,
      kind,
      confidence: expectEnum(receipt.confidence, `${path}.confidence`, ['agent-proposed'] as const),
      provenanceKind: expectEnum(receipt.provenanceKind, `${path}.provenanceKind`, ['agent-interpreted'] as const),
      target: validateResolutionTarget(receipt.target, `${path}.target`),
      rationale: expectString(receipt.rationale ?? '', `${path}.rationale`),
    };
  }
  if (kind === 'resolved') {
    return {
      ...base,
      kind,
      confidence: expectEnum(receipt.confidence, `${path}.confidence`, ['compiler-derived', 'agent-verified'] as const),
      provenanceKind: expectEnum(receipt.provenanceKind, `${path}.provenanceKind`, ['explicit', 'approved-knowledge', 'live-exploration'] as const),
      target: validateResolutionTarget(receipt.target, `${path}.target`),
    };
  }
  return {
    ...base,
    kind,
    confidence: expectEnum(receipt.confidence, `${path}.confidence`, ['agent-proposed', 'agent-verified'] as const),
    provenanceKind: expectEnum(receipt.provenanceKind, `${path}.provenanceKind`, ['approved-knowledge', 'live-exploration'] as const),
    target: validateResolutionTarget(receipt.target, `${path}.target`),
  };
}

// ── Step execution receipt ────────────────────────────────────────────

export function validateStepExecutionReceipt(value: unknown, path: string): StepExecutionReceipt {
  const receipt = expectRecord(value, path);
  const execution = expectRecord(receipt.execution, `${path}.execution`);
  const header = validateWorkflowEnvelopeHeader(receipt, path, {
    stage: 'execution',
    scope: 'step',
    governance: execution.status === 'failed' ? 'blocked' : 'approved',
    artifactFingerprint: expectOptionalString(receipt.taskFingerprint, `${path}.taskFingerprint`) ?? `${path}:execution`,
    ids: {
      stepIndex: receipt.stepIndex === undefined ? null : expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation', 'resolution', 'execution'],
    },
  });
  return {
    ...header,
    stepIndex: expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    taskFingerprint: expectString(receipt.taskFingerprint, `${path}.taskFingerprint`),
    knowledgeFingerprint: expectString(receipt.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    runAt: expectString(receipt.runAt, `${path}.runAt`),
    mode: expectString(receipt.mode, `${path}.mode`),
    widgetContract: expectOptionalString(receipt.widgetContract, `${path}.widgetContract`) ?? null,
    locatorStrategy: expectOptionalString(receipt.locatorStrategy, `${path}.locatorStrategy`) ?? null,
    locatorRung: receipt.locatorRung === undefined || receipt.locatorRung === null
      ? null
      : expectNumber(receipt.locatorRung, `${path}.locatorRung`),
    degraded: expectBoolean(receipt.degraded, `${path}.degraded`),
    preconditionFailures: expectStringArray(receipt.preconditionFailures ?? [], `${path}.preconditionFailures`),
    planning: receipt.planning === undefined
      ? undefined
      : (() => {
        const planning = expectRecord(receipt.planning, `${path}.planning`);
        const planningFailure = planning.failure === undefined ? undefined : expectRecord(planning.failure, `${path}.planning.failure`);
        return {
          requiredPreconditions: expectArray(planning.requiredPreconditions ?? [], `${path}.planning.requiredPreconditions`).map((ref, index) =>
            expectId(ref, `${path}.planning.requiredPreconditions[${index}]`, createStateNodeRef),
          ),
          forbiddenPreconditions: expectArray(planning.forbiddenPreconditions ?? [], `${path}.planning.forbiddenPreconditions`).map((ref, index) =>
            expectId(ref, `${path}.planning.forbiddenPreconditions[${index}]`, createStateNodeRef),
          ),
          availableTransitions: expectArray(planning.availableTransitions ?? [], `${path}.planning.availableTransitions`).map((entry, index) => {
            const candidate = expectRecord(entry, `${path}.planning.availableTransitions[${index}]`);
            return {
              transitionRef: expectId(candidate.transitionRef, `${path}.planning.availableTransitions[${index}].transitionRef`, createTransitionRef),
              eventSignatureRef: expectId(candidate.eventSignatureRef, `${path}.planning.availableTransitions[${index}].eventSignatureRef`, createEventSignatureRef),
              sourceStateRefs: expectArray(candidate.sourceStateRefs ?? [], `${path}.planning.availableTransitions[${index}].sourceStateRefs`).map((ref, refIndex) =>
                expectId(ref, `${path}.planning.availableTransitions[${index}].sourceStateRefs[${refIndex}]`, createStateNodeRef),
              ),
              targetStateRefs: expectArray(candidate.targetStateRefs ?? [], `${path}.planning.availableTransitions[${index}].targetStateRefs`).map((ref, refIndex) =>
                expectId(ref, `${path}.planning.availableTransitions[${index}].targetStateRefs[${refIndex}]`, createStateNodeRef),
              ),
            };
          }),
          chosenTransitionPath: expectArray(planning.chosenTransitionPath ?? [], `${path}.planning.chosenTransitionPath`).map((entry, index) => {
            const step = expectRecord(entry, `${path}.planning.chosenTransitionPath[${index}]`);
            return {
              depth: expectNumber(step.depth, `${path}.planning.chosenTransitionPath[${index}].depth`),
              transitionRef: expectId(step.transitionRef, `${path}.planning.chosenTransitionPath[${index}].transitionRef`, createTransitionRef),
              eventSignatureRef: expectId(step.eventSignatureRef, `${path}.planning.chosenTransitionPath[${index}].eventSignatureRef`, createEventSignatureRef),
              fromStateRefs: expectArray(step.fromStateRefs ?? [], `${path}.planning.chosenTransitionPath[${index}].fromStateRefs`).map((ref, refIndex) =>
                expectId(ref, `${path}.planning.chosenTransitionPath[${index}].fromStateRefs[${refIndex}]`, createStateNodeRef),
              ),
              toStateRefs: expectArray(step.toStateRefs ?? [], `${path}.planning.chosenTransitionPath[${index}].toStateRefs`).map((ref, refIndex) =>
                expectId(ref, `${path}.planning.chosenTransitionPath[${index}].toStateRefs[${refIndex}]`, createStateNodeRef),
              ),
            };
          }),
          projectedSatisfiedStateRefs: expectArray(planning.projectedSatisfiedStateRefs ?? [], `${path}.planning.projectedSatisfiedStateRefs`).map((ref, index) =>
            expectId(ref, `${path}.planning.projectedSatisfiedStateRefs[${index}]`, createStateNodeRef),
          ),
          status: expectEnum(planning.status, `${path}.planning.status`, ['already-satisfied', 'path-found', 'no-path', 'not-applicable'] as const),
          failure: planningFailure === undefined
            ? undefined
            : {
              code: expectEnum(planningFailure.code, `${path}.planning.failure.code`, ['runtime-state-precondition-unreachable'] as const),
              message: expectString(planningFailure.message, `${path}.planning.failure.message`),
              missingRequiredStates: expectArray(planningFailure.missingRequiredStates ?? [], `${path}.planning.failure.missingRequiredStates`).map((ref, index) =>
                expectId(ref, `${path}.planning.failure.missingRequiredStates[${index}]`, createStateNodeRef),
              ),
              forbiddenActiveStates: expectArray(planningFailure.forbiddenActiveStates ?? [], `${path}.planning.failure.forbiddenActiveStates`).map((ref, index) =>
                expectId(ref, `${path}.planning.failure.forbiddenActiveStates[${index}]`, createStateNodeRef),
              ),
            },
        };
      })(),
    requiredStateRefs: expectArray(receipt.requiredStateRefs ?? [], `${path}.requiredStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.requiredStateRefs[${index}]`, createStateNodeRef),
    ),
    forbiddenStateRefs: expectArray(receipt.forbiddenStateRefs ?? [], `${path}.forbiddenStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.forbiddenStateRefs[${index}]`, createStateNodeRef),
    ),
    effectAssertions: expectStringArray(receipt.effectAssertions ?? [], `${path}.effectAssertions`),
    eventSignatureRefs: expectArray(receipt.eventSignatureRefs ?? [], `${path}.eventSignatureRefs`).map((entry, index) =>
      expectId(entry, `${path}.eventSignatureRefs[${index}]`, createEventSignatureRef),
    ),
    expectedTransitionRefs: expectArray(receipt.expectedTransitionRefs ?? [], `${path}.expectedTransitionRefs`).map((entry, index) =>
      expectId(entry, `${path}.expectedTransitionRefs[${index}]`, createTransitionRef),
    ),
    observedStateRefs: expectArray(receipt.observedStateRefs ?? [], `${path}.observedStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.observedStateRefs[${index}]`, createStateNodeRef),
    ),
    transitionObservations: expectArray(receipt.transitionObservations ?? [], `${path}.transitionObservations`).map((entry, index) => {
      const observation = expectRecord(entry, `${path}.transitionObservations[${index}]`);
      return {
        observationId: expectString(observation.observationId, `${path}.transitionObservations[${index}].observationId`),
        source: expectEnum(observation.source, `${path}.transitionObservations[${index}].source`, ['harvest', 'runtime'] as const),
        actor: expectEnum(observation.actor, `${path}.transitionObservations[${index}].actor`, ['safe-active-harvest', 'runtime-execution', 'live-dom'] as const),
        screen: expectId(observation.screen, `${path}.transitionObservations[${index}].screen`, createScreenId),
        eventSignatureRef: expectOptionalId(observation.eventSignatureRef, `${path}.transitionObservations[${index}].eventSignatureRef`, createEventSignatureRef) ?? null,
        transitionRef: expectOptionalId(observation.transitionRef, `${path}.transitionObservations[${index}].transitionRef`, createTransitionRef) ?? null,
        expectedTransitionRefs: expectArray(observation.expectedTransitionRefs ?? [], `${path}.transitionObservations[${index}].expectedTransitionRefs`).map((ref, refIndex) =>
          expectId(ref, `${path}.transitionObservations[${index}].expectedTransitionRefs[${refIndex}]`, createTransitionRef),
        ),
        observedStateRefs: expectArray(observation.observedStateRefs ?? [], `${path}.transitionObservations[${index}].observedStateRefs`).map((ref, refIndex) =>
          expectId(ref, `${path}.transitionObservations[${index}].observedStateRefs[${refIndex}]`, createStateNodeRef),
        ),
        unexpectedStateRefs: expectArray(observation.unexpectedStateRefs ?? [], `${path}.transitionObservations[${index}].unexpectedStateRefs`).map((ref, refIndex) =>
          expectId(ref, `${path}.transitionObservations[${index}].unexpectedStateRefs[${refIndex}]`, createStateNodeRef),
        ),
        confidence: expectEnum(observation.confidence, `${path}.transitionObservations[${index}].confidence`, ['observed', 'inferred', 'missing'] as const),
        classification: expectEnum(observation.classification, `${path}.transitionObservations[${index}].classification`, ['matched', 'ambiguous-match', 'missing-expected', 'unexpected-effects'] as const),
        detail: observation.detail === undefined ? undefined : expectStringRecord(observation.detail, `${path}.transitionObservations[${index}].detail`),
      };
    }),
    navigation: (() => {
      if (receipt.navigation === undefined || receipt.navigation === null) {
        return undefined;
      }
      const navigation = expectRecord(receipt.navigation, `${path}.navigation`);
      return {
        selectedRouteVariantRef: expectOptionalString(navigation.selectedRouteVariantRef, `${path}.navigation.selectedRouteVariantRef`) ?? null,
        selectedRouteUrl: expectOptionalString(navigation.selectedRouteUrl, `${path}.navigation.selectedRouteUrl`) ?? null,
        semanticDestination: expectOptionalString(navigation.semanticDestination, `${path}.navigation.semanticDestination`) ?? null,
        expectedEntryStateRefs: expectArray(navigation.expectedEntryStateRefs ?? [], `${path}.navigation.expectedEntryStateRefs`).map((entry, index) =>
          expectId(entry, `${path}.navigation.expectedEntryStateRefs[${index}]`, createStateNodeRef),
        ),
        observedEntryStateRefs: expectArray(navigation.observedEntryStateRefs ?? [], `${path}.navigation.observedEntryStateRefs`).map((entry, index) =>
          expectId(entry, `${path}.navigation.observedEntryStateRefs[${index}]`, createStateNodeRef),
        ),
        fallbackRoutePath: expectStringArray(navigation.fallbackRoutePath ?? [], `${path}.navigation.fallbackRoutePath`),
        mismatch: expectBoolean(navigation.mismatch ?? false, `${path}.navigation.mismatch`),
        rationale: expectOptionalString(navigation.rationale, `${path}.navigation.rationale`) ?? null,
      };
    })(),
    durationMs: expectNumber(receipt.durationMs ?? 0, `${path}.durationMs`),
    timing: (() => {
      const timing = expectRecord(receipt.timing ?? {}, `${path}.timing`);
      return {
        setupMs: expectNumber(timing.setupMs ?? 0, `${path}.timing.setupMs`),
        resolutionMs: expectNumber(timing.resolutionMs ?? 0, `${path}.timing.resolutionMs`),
        actionMs: expectNumber(timing.actionMs ?? 0, `${path}.timing.actionMs`),
        assertionMs: expectNumber(timing.assertionMs ?? 0, `${path}.timing.assertionMs`),
        retriesMs: expectNumber(timing.retriesMs ?? 0, `${path}.timing.retriesMs`),
        teardownMs: expectNumber(timing.teardownMs ?? 0, `${path}.timing.teardownMs`),
        totalMs: expectNumber(timing.totalMs ?? receipt.durationMs ?? 0, `${path}.timing.totalMs`),
      };
    })(),
    cost: (() => {
      const cost = expectRecord(receipt.cost ?? { instructionCount: 0, diagnosticCount: 0 }, `${path}.cost`);
      return {
        instructionCount: expectNumber(cost.instructionCount, `${path}.cost.instructionCount`),
        diagnosticCount: expectNumber(cost.diagnosticCount, `${path}.cost.diagnosticCount`),
      };
    })(),
    budget: (() => {
      const budget = expectRecord(receipt.budget ?? {}, `${path}.budget`);
      const thresholds = expectRecord(budget.thresholds ?? {}, `${path}.budget.thresholds`);
      return {
        thresholds: {
          maxSetupMs: thresholds.maxSetupMs === undefined || thresholds.maxSetupMs === null ? undefined : expectNumber(thresholds.maxSetupMs, `${path}.budget.thresholds.maxSetupMs`),
          maxResolutionMs: thresholds.maxResolutionMs === undefined || thresholds.maxResolutionMs === null ? undefined : expectNumber(thresholds.maxResolutionMs, `${path}.budget.thresholds.maxResolutionMs`),
          maxActionMs: thresholds.maxActionMs === undefined || thresholds.maxActionMs === null ? undefined : expectNumber(thresholds.maxActionMs, `${path}.budget.thresholds.maxActionMs`),
          maxAssertionMs: thresholds.maxAssertionMs === undefined || thresholds.maxAssertionMs === null ? undefined : expectNumber(thresholds.maxAssertionMs, `${path}.budget.thresholds.maxAssertionMs`),
          maxRetriesMs: thresholds.maxRetriesMs === undefined || thresholds.maxRetriesMs === null ? undefined : expectNumber(thresholds.maxRetriesMs, `${path}.budget.thresholds.maxRetriesMs`),
          maxTeardownMs: thresholds.maxTeardownMs === undefined || thresholds.maxTeardownMs === null ? undefined : expectNumber(thresholds.maxTeardownMs, `${path}.budget.thresholds.maxTeardownMs`),
          maxTotalMs: thresholds.maxTotalMs === undefined || thresholds.maxTotalMs === null ? undefined : expectNumber(thresholds.maxTotalMs, `${path}.budget.thresholds.maxTotalMs`),
          maxInstructionCount: thresholds.maxInstructionCount === undefined || thresholds.maxInstructionCount === null ? undefined : expectNumber(thresholds.maxInstructionCount, `${path}.budget.thresholds.maxInstructionCount`),
          maxDiagnosticCount: thresholds.maxDiagnosticCount === undefined || thresholds.maxDiagnosticCount === null ? undefined : expectNumber(thresholds.maxDiagnosticCount, `${path}.budget.thresholds.maxDiagnosticCount`),
        },
        status: expectEnum(budget.status ?? 'not-configured', `${path}.budget.status`, ['within-budget', 'over-budget', 'not-configured'] as const),
        breaches: expectStringArray(budget.breaches ?? [], `${path}.budget.breaches`),
      };
    })(),
    failure: (() => {
      const failure = expectRecord(receipt.failure ?? {}, `${path}.failure`);
      return {
        family: expectEnum(failure.family ?? 'none', `${path}.failure.family`, ['none', 'precondition-failure', 'locator-degradation-failure', 'environment-runtime-failure'] as const),
        code: expectOptionalString(failure.code, `${path}.failure.code`) ?? null,
        message: expectOptionalString(failure.message, `${path}.failure.message`) ?? null,
      };
    })(),
    recovery: (() => {
      const recovery = expectRecord(receipt.recovery ?? {}, `${path}.recovery`);
      return {
        policyProfile: expectString(recovery.policyProfile ?? 'default', `${path}.recovery.policyProfile`),
        attempts: expectArray(recovery.attempts ?? [], `${path}.recovery.attempts`).map((entry, index) => {
          const attempt = expectRecord(entry, `${path}.recovery.attempts[${index}]`);
          return {
            strategyId: expectEnum(attempt.strategyId, `${path}.recovery.attempts[${index}].strategyId`, ['verify-prerequisites', 'execute-prerequisite-actions', 'force-alternate-locator-rungs', 'snapshot-guided-reresolution', 'bounded-retry-with-backoff', 'refresh-runtime'] as const),
            family: expectEnum(attempt.family, `${path}.recovery.attempts[${index}].family`, ['precondition-failure', 'locator-degradation-failure', 'environment-runtime-failure'] as const),
            attempt: expectNumber(attempt.attempt, `${path}.recovery.attempts[${index}].attempt`),
            startedAt: expectString(attempt.startedAt, `${path}.recovery.attempts[${index}].startedAt`),
            durationMs: expectNumber(attempt.durationMs, `${path}.recovery.attempts[${index}].durationMs`),
            result: expectEnum(attempt.result, `${path}.recovery.attempts[${index}].result`, ['recovered', 'failed', 'skipped'] as const),
            diagnostics: expectStringArray(attempt.diagnostics ?? [], `${path}.recovery.attempts[${index}].diagnostics`),
          };
        }),
      };
    })(),
    handshakes: expectArray(receipt.handshakes ?? ['preparation', 'resolution', 'execution'], `${path}.handshakes`).map((entry, index) =>
      expectEnum(entry, `${path}.handshakes[${index}]`, workflowStages),
    ) as WorkflowStage[],
    execution: {
      status: expectEnum(execution.status, `${path}.execution.status`, ['ok', 'failed', 'skipped'] as const),
      observedEffects: expectStringArray(execution.observedEffects ?? [], `${path}.execution.observedEffects`),
      diagnostics: expectArray(execution.diagnostics ?? [], `${path}.execution.diagnostics`).map((entry, index) => {
        const diagnostic = expectRecord(entry, `${path}.execution.diagnostics[${index}]`);
        return {
          code: expectString(diagnostic.code, `${path}.execution.diagnostics[${index}].code`),
          message: expectString(diagnostic.message, `${path}.execution.diagnostics[${index}].message`),
          context: diagnostic.context === undefined ? undefined : expectStringRecord(diagnostic.context, `${path}.execution.diagnostics[${index}].context`),
        };
      }),
    },
  };
}

// ── Task / candidate validators ──────────────────────────────────────

export function validateStepTaskElementCandidate(value: unknown, path: string) {
  const candidate = expectRecord(value, path);
  return {
    element: expectId(candidate.element, `${path}.element`, createElementId),
    targetRef: candidate.targetRef === undefined || candidate.targetRef === null
      ? null
      : expectId(candidate.targetRef, `${path}.targetRef`, createCanonicalTargetRef),
    role: expectString(candidate.role, `${path}.role`),
    name: expectOptionalString(candidate.name, `${path}.name`) ?? null,
    surface: expectId(candidate.surface, `${path}.surface`, createSurfaceId),
    widget: expectId(candidate.widget, `${path}.widget`, createWidgetId),
    affordance: expectOptionalString(candidate.affordance, `${path}.affordance`) ?? null,
    aliases: expectStringArray(candidate.aliases ?? [], `${path}.aliases`),
    locator: expectArray(candidate.locator ?? [], `${path}.locator`).map((entry, index) => validateLocatorStrategy(entry, `${path}.locator[${index}]`)),
    postures: expectIdArray(candidate.postures ?? [], `${path}.postures`, createPostureId),
    defaultValueRef: expectOptionalString(candidate.defaultValueRef, `${path}.defaultValueRef`) ?? null,
    parameter: expectOptionalString(candidate.parameter, `${path}.parameter`) ?? null,
    graphNodeId: expectOptionalString(candidate.graphNodeId, `${path}.graphNodeId`) ?? null,
    selectorRefs: expectArray(candidate.selectorRefs ?? [], `${path}.selectorRefs`).map((entry, index) =>
      expectId(entry, `${path}.selectorRefs[${index}]`, createSelectorRef),
    ),
    snapshotAliases: Object.fromEntries(
      Object.entries(expectRecord(candidate.snapshotAliases ?? {}, `${path}.snapshotAliases`)).map(([snapshotId, aliases]) => [
        ensureSafeRelativePathLike(snapshotId, `${path}.snapshotAliases.${snapshotId}`),
        expectStringArray(aliases, `${path}.snapshotAliases.${snapshotId}`),
      ]),
    ),
  };
}

export function validateStepTaskScreenCandidate(value: unknown, path: string) {
  const candidate = expectRecord(value, path);
  return {
    screen: expectId(candidate.screen, `${path}.screen`, createScreenId),
    url: expectString(candidate.url, `${path}.url`),
    routeVariantRefs: expectStringArray(candidate.routeVariantRefs ?? [], `${path}.routeVariantRefs`),
    routeVariants: expectArray(candidate.routeVariants ?? [], `${path}.routeVariants`).map((entry, index) => {
      const variant = expectRecord(entry, `${path}.routeVariants[${index}]`);
      const historical = expectRecord(variant.historicalSuccess ?? {}, `${path}.routeVariants[${index}].historicalSuccess`);
      return {
        routeVariantRef: expectString(variant.routeVariantRef, `${path}.routeVariants[${index}].routeVariantRef`),
        url: expectString(variant.url, `${path}.routeVariants[${index}].url`),
        urlPattern: expectOptionalString(variant.urlPattern, `${path}.routeVariants[${index}].urlPattern`) ?? null,
        dimensions: expectArray(variant.dimensions ?? [], `${path}.routeVariants[${index}].dimensions`).map((dimension, dimensionIndex) =>
          expectEnum(dimension, `${path}.routeVariants[${index}].dimensions[${dimensionIndex}]`, ['query', 'hash', 'tab', 'segment'] as const),
        ),
        expectedEntryStateRefs: expectArray(variant.expectedEntryStateRefs ?? [], `${path}.routeVariants[${index}].expectedEntryStateRefs`).map((stateRef, stateRefIndex) =>
          expectId(stateRef, `${path}.routeVariants[${index}].expectedEntryStateRefs[${stateRefIndex}]`, createStateNodeRef),
        ),
        historicalSuccess: {
          successCount: expectNumber(historical.successCount ?? 0, `${path}.routeVariants[${index}].historicalSuccess.successCount`),
          failureCount: expectNumber(historical.failureCount ?? 0, `${path}.routeVariants[${index}].historicalSuccess.failureCount`),
          lastSuccessAt: expectOptionalString(historical.lastSuccessAt, `${path}.routeVariants[${index}].historicalSuccess.lastSuccessAt`) ?? null,
        },
      };
    }),
    screenAliases: expectStringArray(candidate.screenAliases ?? [], `${path}.screenAliases`),
    knowledgeRefs: expectStringArray(candidate.knowledgeRefs ?? [], `${path}.knowledgeRefs`),
    supplementRefs: expectStringArray(candidate.supplementRefs ?? [], `${path}.supplementRefs`),
    elements: expectArray(candidate.elements ?? [], `${path}.elements`).map((entry, index) =>
      validateStepTaskElementCandidate(entry, `${path}.elements[${index}]`),
    ),
    sectionSnapshots: expectIdArray(candidate.sectionSnapshots ?? [], `${path}.sectionSnapshots`, createSnapshotTemplateId),
    graphNodeId: expectOptionalString(candidate.graphNodeId, `${path}.graphNodeId`) ?? null,
  };
}

export function validateArtifactConfidenceRecord(value: unknown, path: string) {
  const record = expectRecord(value, path);
  const lineage = expectRecord(record.lineage ?? {}, `${path}.lineage`);
  return {
    id: expectString(record.id, `${path}.id`),
    artifactType: validateTrustPolicyArtifactType(record.artifactType, `${path}.artifactType`),
    artifactPath: expectString(record.artifactPath, `${path}.artifactPath`),
    score: expectNumber(record.score, `${path}.score`),
    threshold: expectNumber(record.threshold, `${path}.threshold`),
    status: expectEnum(record.status, `${path}.status`, ['learning', 'approved-equivalent', 'needs-review'] as const),
    successCount: expectNumber(record.successCount, `${path}.successCount`),
    failureCount: expectNumber(record.failureCount, `${path}.failureCount`),
    evidenceCount: expectNumber(record.evidenceCount, `${path}.evidenceCount`),
    screen: expectOptionalId(record.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(record.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(record.posture, `${path}.posture`, createPostureId) ?? null,
    snapshotTemplate: expectOptionalId(record.snapshotTemplate, `${path}.snapshotTemplate`, createSnapshotTemplateId) ?? null,
    learnedAliases: expectStringArray(record.learnedAliases ?? [], `${path}.learnedAliases`),
    lastSuccessAt: expectOptionalString(record.lastSuccessAt, `${path}.lastSuccessAt`) ?? null,
    lastFailureAt: expectOptionalString(record.lastFailureAt, `${path}.lastFailureAt`) ?? null,
    lineage: {
      runIds: expectStringArray(lineage.runIds ?? [], `${path}.lineage.runIds`),
      evidenceIds: expectStringArray(lineage.evidenceIds ?? [], `${path}.lineage.evidenceIds`),
      sourceArtifactPaths: expectStringArray(lineage.sourceArtifactPaths ?? [], `${path}.lineage.sourceArtifactPaths`),
    },
  };
}

export function validateInterfaceResolutionContext(
  value: unknown,
  path: string,
  validateSharedPatternsFn: (value: unknown) => SharedPatterns,
) {
  const session = expectRecord(value, path);
  return {
    knowledgeFingerprint: expectString(session.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    confidenceFingerprint: expectOptionalString(session.confidenceFingerprint, `${path}.confidenceFingerprint`) ?? null,
    interfaceGraphFingerprint: expectOptionalString(session.interfaceGraphFingerprint, `${path}.interfaceGraphFingerprint`) ?? null,
    selectorCanonFingerprint: expectOptionalString(session.selectorCanonFingerprint, `${path}.selectorCanonFingerprint`) ?? null,
    interfaceGraphPath: expectOptionalString(session.interfaceGraphPath, `${path}.interfaceGraphPath`) ?? null,
    selectorCanonPath: expectOptionalString(session.selectorCanonPath, `${path}.selectorCanonPath`) ?? null,
    sharedPatterns: validateSharedPatternsFn(session.sharedPatterns),
    screens: expectArray(session.screens ?? [], `${path}.screens`).map((entry, index) =>
      validateStepTaskScreenCandidate(entry, `${path}.screens[${index}]`),
    ),
    evidenceRefs: expectStringArray(session.evidenceRefs ?? [], `${path}.evidenceRefs`),
    confidenceOverlays: expectArray(session.confidenceOverlays ?? [], `${path}.confidenceOverlays`).map((entry, index) =>
      validateArtifactConfidenceRecord(entry, `${path}.confidenceOverlays[${index}]`),
    ),
    controls: (() => {
      const controls = expectRecord(session.controls ?? {}, `${path}.controls`);
      return {
        datasets: expectArray(controls.datasets ?? [], `${path}.controls.datasets`).map((entry, index) => {
          const dataset = expectRecord(entry, `${path}.controls.datasets[${index}]`);
          return {
            name: expectString(dataset.name, `${path}.controls.datasets[${index}].name`),
            artifactPath: expectString(dataset.artifactPath, `${path}.controls.datasets[${index}].artifactPath`),
            isDefault: expectBoolean(dataset.isDefault, `${path}.controls.datasets[${index}].isDefault`),
            fixtures: expectRecord(dataset.fixtures ?? {}, `${path}.controls.datasets[${index}].fixtures`),
            elementDefaults: Object.fromEntries(
              Object.entries(expectRecord(dataset.elementDefaults ?? {}, `${path}.controls.datasets[${index}].elementDefaults`))
                .map(([key, value]) => [key, expectString(value, `${path}.controls.datasets[${index}].elementDefaults.${key}`)]),
            ),
            generatedTokens: Object.fromEntries(
              Object.entries(expectRecord(dataset.generatedTokens ?? {}, `${path}.controls.datasets[${index}].generatedTokens`))
                .map(([key, value]) => [key, expectString(value, `${path}.controls.datasets[${index}].generatedTokens.${key}`)]),
            ),
          };
        }),
        resolutionControls: expectArray(controls.resolutionControls ?? [], `${path}.controls.resolutionControls`).map((entry, index) => {
          const control = expectRecord(entry, `${path}.controls.resolutionControls[${index}]`);
          const domPolicy = control.domExplorationPolicy === undefined
            ? undefined
            : expectRecord(control.domExplorationPolicy, `${path}.controls.resolutionControls[${index}].domExplorationPolicy`);
          return {
            name: expectString(control.name, `${path}.controls.resolutionControls[${index}].name`),
            artifactPath: expectString(control.artifactPath, `${path}.controls.resolutionControls[${index}].artifactPath`),
            stepIndex: expectNumber(control.stepIndex, `${path}.controls.resolutionControls[${index}].stepIndex`),
            resolution: validateStepResolution(control.resolution, `${path}.controls.resolutionControls[${index}].resolution`),
            domExplorationPolicy: domPolicy
              ? {
                maxCandidates: expectNumber(domPolicy.maxCandidates, `${path}.controls.resolutionControls[${index}].domExplorationPolicy.maxCandidates`),
                maxProbes: expectNumber(domPolicy.maxProbes, `${path}.controls.resolutionControls[${index}].domExplorationPolicy.maxProbes`),
                forbiddenActions: expectArray(
                  domPolicy.forbiddenActions ?? [],
                  `${path}.controls.resolutionControls[${index}].domExplorationPolicy.forbiddenActions`,
                ).map((entry, actionIndex) =>
                  expectEnum(entry, `${path}.controls.resolutionControls[${index}].domExplorationPolicy.forbiddenActions[${actionIndex}]`, ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const),
                ),
              }
              : undefined,
          };
        }),
        runbooks: expectArray(controls.runbooks ?? [], `${path}.controls.runbooks`).map((entry, index) => {
          const runbook = expectRecord(entry, `${path}.controls.runbooks[${index}]`);
          return {
            name: expectString(runbook.name, `${path}.controls.runbooks[${index}].name`),
            artifactPath: expectString(runbook.artifactPath, `${path}.controls.runbooks[${index}].artifactPath`),
            isDefault: expectBoolean(runbook.isDefault, `${path}.controls.runbooks[${index}].isDefault`),
            selector: validateResolutionControlSelector(runbook.selector, `${path}.controls.runbooks[${index}].selector`),
            interpreterMode: runbook.interpreterMode === undefined || runbook.interpreterMode === null
              ? null
              : expectEnum(runbook.interpreterMode, `${path}.controls.runbooks[${index}].interpreterMode`, ['playwright', 'dry-run', 'diagnostic'] as const),
            dataset: expectOptionalString(runbook.dataset, `${path}.controls.runbooks[${index}].dataset`) ?? null,
            resolutionControl: expectOptionalString(runbook.resolutionControl, `${path}.controls.runbooks[${index}].resolutionControl`) ?? null,
            translationEnabled: runbook.translationEnabled === undefined ? undefined : expectBoolean(runbook.translationEnabled, `${path}.controls.runbooks[${index}].translationEnabled`),
            translationCacheEnabled: runbook.translationCacheEnabled === undefined ? undefined : expectBoolean(runbook.translationCacheEnabled, `${path}.controls.runbooks[${index}].translationCacheEnabled`),
            providerId: expectOptionalString(runbook.providerId, `${path}.controls.runbooks[${index}].providerId`) ?? null,
            recoveryPolicy: runbook.recoveryPolicy === undefined
              ? undefined
              : validateRecoveryPolicy(runbook.recoveryPolicy, `${path}.controls.runbooks[${index}].recoveryPolicy`),
          };
        }),
      };
    })(),
  };
}

export function validateStepTask(value: unknown, path: string) {
  const task = expectRecord(value, path);
  const stepFingerprint = expectOptionalString(task.stepFingerprint, `${path}.stepFingerprint`)
    ?? expectString(task.taskFingerprint, `${path}.taskFingerprint`);
  return {
    index: expectNumber(task.index, `${path}.index`),
    intent: expectString(task.intent, `${path}.intent`),
    actionText: expectString(task.actionText, `${path}.actionText`),
    expectedText: expectString(task.expectedText, `${path}.expectedText`),
    normalizedIntent: expectString(task.normalizedIntent, `${path}.normalizedIntent`),
    allowedActions: expectArray(task.allowedActions ?? [], `${path}.allowedActions`).map((entry, index) =>
      validateAction(entry, `${path}.allowedActions[${index}]`),
    ),
    explicitResolution: task.explicitResolution === undefined || task.explicitResolution === null
      ? null
      : validateStepResolution(task.explicitResolution, `${path}.explicitResolution`),
    controlResolution: task.controlResolution === undefined || task.controlResolution === null
      ? null
      : validateStepResolution(task.controlResolution, `${path}.controlResolution`),
    grounding: (() => {
      const grounding = expectRecord(task.grounding, `${path}.grounding`);
      return {
        targetRefs: expectArray(grounding.targetRefs ?? [], `${path}.grounding.targetRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.targetRefs[${index}]`, createCanonicalTargetRef),
        ),
        selectorRefs: expectArray(grounding.selectorRefs ?? [], `${path}.grounding.selectorRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.selectorRefs[${index}]`, createSelectorRef),
        ),
        fallbackSelectorRefs: expectArray(grounding.fallbackSelectorRefs ?? [], `${path}.grounding.fallbackSelectorRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.fallbackSelectorRefs[${index}]`, createSelectorRef),
        ),
        routeVariantRefs: expectStringArray(grounding.routeVariantRefs ?? [], `${path}.grounding.routeVariantRefs`),
        assertionAnchors: expectStringArray(grounding.assertionAnchors ?? [], `${path}.grounding.assertionAnchors`),
        effectAssertions: expectStringArray(grounding.effectAssertions ?? [], `${path}.grounding.effectAssertions`),
        requiredStateRefs: expectArray(grounding.requiredStateRefs ?? [], `${path}.grounding.requiredStateRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.requiredStateRefs[${index}]`, createStateNodeRef),
        ),
        forbiddenStateRefs: expectArray(grounding.forbiddenStateRefs ?? [], `${path}.grounding.forbiddenStateRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.forbiddenStateRefs[${index}]`, createStateNodeRef),
        ),
        eventSignatureRefs: expectArray(grounding.eventSignatureRefs ?? [], `${path}.grounding.eventSignatureRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.eventSignatureRefs[${index}]`, createEventSignatureRef),
        ),
        expectedTransitionRefs: expectArray(grounding.expectedTransitionRefs ?? [], `${path}.grounding.expectedTransitionRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.expectedTransitionRefs[${index}]`, createTransitionRef),
        ),
        resultStateRefs: expectArray(grounding.resultStateRefs ?? [], `${path}.grounding.resultStateRefs`).map((entry, index) =>
          expectId(entry, `${path}.grounding.resultStateRefs[${index}]`, createStateNodeRef),
        ),
      };
    })(),
    stepFingerprint,
    taskFingerprint: stepFingerprint,
  };
}
