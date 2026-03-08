import type {
  AssertionKind,
  BoundScenario,
  BoundStep,
  CompilerDiagnostic,
  Confidence,
  DerivedGraph,
  EffectTargetKind,
  ElementSig,
  LocatorStrategy,
  Manifest,
  MergedPatterns,
  PatternDocument,
  Posture,
  PostureEffect,
  RefPath,
  RunRecord,
  Scenario,
  ScenarioMetadata,
  ScenarioTaskPacket,
  ScenarioPostcondition,
  ScenarioPrecondition,
  ScenarioSource,
  ScenarioStep,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
  StepAction,
  StepBindingKind,
  StepInstruction,
  StepResolution,
  StepProgram,
  ProposalBundle,
  ResolutionReceipt,
  SurfaceDefinition,
  SurfaceGraph,
  SurfaceSection,
  TrustPolicy,
  TrustPolicyArtifactType,
  TrustPolicyEvaluation,
  TrustPolicyEvaluationReason,
  ValueRef,
  WidgetCapabilityContract,
} from './types';
import { computeAdoContentHash } from './hash';
import { validatePatternDocument as validatePatternDocumentRecord } from './knowledge/patterns';
import { normalizeScreenPostures } from './posture-contract';
import { SchemaError } from './errors';
import {
  createAdoId,
  createElementId,
  createFixtureId,
  createPostureId,
  createScreenId,
  createSectionId,
  createSnapshotTemplateId,
  createSurfaceId,
  createWidgetId,
  ensureSafeRelativePathLike,
} from './identity';

type UnknownRecord = Record<string, unknown>;

const scenarioStatuses = ['stub', 'draft', 'active', 'needs-repair', 'blocked', 'deprecated'] as const;
const stepActions = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const;
const confidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound'] as const;
const valueRefKinds = ['literal', 'fixture-path', 'posture-sample', 'parameter-row', 'generated-token'] as const;
const stepInstructionKinds = ['navigate', 'enter', 'invoke', 'observe-structure', 'custom-escape-hatch'] as const;
const surfaceKinds = ['screen-root', 'form', 'action-cluster', 'validation-region', 'result-set', 'details-pane', 'modal', 'section-root'] as const;
const assertionKinds = ['state', 'structure'] as const;
const effectTargetKinds = ['self', 'element', 'surface'] as const;
const governanceStates = ['approved', 'review-required', 'blocked'] as const;
const locatorStrategyKinds = ['test-id', 'role-name', 'css'] as const;
const effectStates = ['validation-error', 'required-error', 'disabled', 'enabled', 'visible', 'hidden'] as const;
const widgetActions = ['click', 'fill', 'clear', 'get-value'] as const;
const widgetPreconditions = ['visible', 'enabled', 'editable'] as const;
const widgetEffectCategories = ['mutation', 'observation', 'focus', 'navigation'] as const;
const graphNodeKinds = ['snapshot', 'screen', 'screen-hints', 'pattern', 'section', 'surface', 'element', 'posture', 'capability', 'scenario', 'step', 'generated-spec', 'generated-trace', 'generated-review', 'evidence', 'policy-decision'] as const;
const graphEdgeKinds = ['derived-from', 'contains', 'references', 'uses', 'affects', 'asserts', 'emits', 'observed-by', 'proposed-change-for', 'governs'] as const;
const diagnosticSeverities = ['info', 'warn', 'error'] as const;
const diagnosticConfidences = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound', 'mixed'] as const;

function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new SchemaError('expected object', path);
  }
  return value as UnknownRecord;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SchemaError('expected array', path);
  }
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new SchemaError('expected string', path);
  }
  return value;
}

function expectOptionalString(value: unknown, path: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return expectString(value, path);
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new SchemaError('expected number', path);
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SchemaError('expected boolean', path);
  }
  return value;
}

function expectEnum<T extends string>(value: unknown, path: string, members: readonly T[]): T {
  const parsed = expectString(value, path);
  if (!members.includes(parsed as T)) {
    throw new SchemaError(`expected one of ${members.join(', ')}`, path);
  }
  return parsed as T;
}

function expectId<T>(value: unknown, path: string, create: (raw: string) => T): T {
  return create(expectString(value, path));
}

function expectOptionalId<T>(value: unknown, path: string, create: (raw: string) => T): T | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return create(expectString(value, path));
}

function expectStringArray(value: unknown, path: string): string[] {
  return expectArray(value, path).map((entry, index) => expectString(entry, `${path}[${index}]`));
}

function expectIdArray<T>(value: unknown, path: string, create: (raw: string) => T): T[] {
  return expectArray(value, path).map((entry, index) => expectId(entry, `${path}[${index}]`, create));
}

function expectStringRecord(value: unknown, path: string): Record<string, string> {
  const record = expectRecord(value, path);
  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => [key, expectString(entryValue, `${path}.${key}`)]),
  );
}

function validateRefPath(value: unknown, path: string): RefPath {
  const refPath = expectRecord(value, path);
  return {
    segments: expectStringArray(refPath.segments, `${path}.segments`),
  };
}

function validateScenarioSource(value: unknown): ScenarioSource {
  const source = expectRecord(value, 'source');
  return {
    ado_id: expectId(source.ado_id, 'source.ado_id', createAdoId),
    revision: expectNumber(source.revision, 'source.revision'),
    content_hash: expectString(source.content_hash, 'source.content_hash'),
    synced_at: expectString(source.synced_at, 'source.synced_at'),
  };
}

function validateScenarioMetadata(value: unknown): ScenarioMetadata {
  const metadata = expectRecord(value, 'metadata');
  return {
    title: expectString(metadata.title, 'metadata.title'),
    suite: ensureSafeRelativePathLike(expectString(metadata.suite, 'metadata.suite'), 'metadata.suite'),
    tags: expectStringArray(metadata.tags ?? [], 'metadata.tags'),
    priority: expectNumber(metadata.priority, 'metadata.priority'),
    status: expectEnum(metadata.status, 'metadata.status', scenarioStatuses),
    status_detail: expectOptionalString(metadata.status_detail, 'metadata.status_detail') ?? null,
  };
}

function validatePrecondition(value: unknown, path: string): ScenarioPrecondition {
  const precondition = expectRecord(value, path);
  return {
    fixture: expectId(precondition.fixture, `${path}.fixture`, createFixtureId),
    params: precondition.params ? expectStringRecord(precondition.params, `${path}.params`) : undefined,
  };
}

function validateAction(value: unknown, path: string): StepAction {
  return expectEnum(value, path, stepActions);
}

function validateConfidence(value: unknown, path: string): Confidence {
  return expectEnum(value, path, confidences);
}

function validateStepResolution(value: unknown, path: string): StepResolution {
  const resolution = expectRecord(value, path);
  return {
    action: resolution.action === undefined ? undefined : validateAction(resolution.action, `${path}.action`),
    screen: expectOptionalId(resolution.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(resolution.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(resolution.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(resolution.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(resolution.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
  };
}

function validateValueRef(value: unknown, path: string): ValueRef {
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

function validateStepInstruction(value: unknown, path: string): StepInstruction {
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

function validateStepProgram(value: unknown, path: string): StepProgram {
  const program = expectRecord(value, path);
  return {
    kind: expectEnum(program.kind, `${path}.kind`, ['step-program'] as const),
    instructions: expectArray(program.instructions ?? [], `${path}.instructions`).map((entry, index) =>
      validateStepInstruction(entry, `${path}.instructions[${index}]`),
    ),
  };
}

function validateStepBase(value: unknown, path: string): ScenarioStep {
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

function validatePostcondition(value: unknown, path: string): ScenarioPostcondition {
  const post = expectRecord(value, path);
  return {
    action: validateAction(post.action, `${path}.action`),
    screen: expectOptionalId(post.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(post.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(post.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(post.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(post.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
  };
}

function validateDiagnostic(value: unknown, path: string): CompilerDiagnostic {
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

function validateBoundStep(value: unknown, path: string): BoundStep {
  const step = validateStepBase(value, path);
  const rawStep = expectRecord(value, path);
  const binding = expectRecord(rawStep.binding, `${path}.binding`);
  return {
    ...step,
    binding: {
      kind: expectEnum(binding.kind, `${path}.binding.kind`, ['bound', 'deferred', 'unbound'] as const) as StepBindingKind,
      reasons: expectStringArray(binding.reasons ?? [], `${path}.binding.reasons`),
      ruleId: expectOptionalString(binding.ruleId, `${path}.binding.ruleId`) ?? null,
      normalizedIntent: expectString(binding.normalizedIntent ?? '', `${path}.binding.normalizedIntent`),
      knowledgeRefs: expectStringArray(binding.knowledgeRefs ?? [], `${path}.binding.knowledgeRefs`),
      supplementRefs: expectStringArray(binding.supplementRefs ?? [], `${path}.binding.supplementRefs`),
      evidenceIds: expectStringArray(binding.evidenceIds ?? [], `${path}.binding.evidenceIds`),
      governance: expectEnum(binding.governance, `${path}.binding.governance`, governanceStates),
      reviewReasons: expectStringArray(binding.reviewReasons ?? [], `${path}.binding.reviewReasons`),
    },
    program: rawStep.program ? validateStepProgram(rawStep.program, `${path}.program`) : undefined,
  };
}

function validateSection(value: unknown, path: string): SurfaceSection {
  const section = expectRecord(value, path);
  return {
    selector: expectString(section.selector, `${path}.selector`),
    url: section.url === undefined ? undefined : expectString(section.url, `${path}.url`),
    kind: expectEnum(section.kind, `${path}.kind`, surfaceKinds),
    surfaces: expectIdArray(section.surfaces ?? [], `${path}.surfaces`, createSurfaceId),
    snapshot: expectOptionalId(section.snapshot, `${path}.snapshot`, createSnapshotTemplateId) ?? null,
  };
}

function validateSurfaceDefinition(value: unknown, path: string): SurfaceDefinition {
  const surface = expectRecord(value, path);
  return {
    kind: expectEnum(surface.kind, `${path}.kind`, surfaceKinds),
    section: expectId(surface.section, `${path}.section`, createSectionId),
    selector: expectString(surface.selector, `${path}.selector`),
    parents: expectIdArray(surface.parents ?? [], `${path}.parents`, createSurfaceId),
    children: expectIdArray(surface.children ?? [], `${path}.children`, createSurfaceId),
    elements: expectIdArray(surface.elements ?? [], `${path}.elements`, createElementId),
    assertions: expectArray(surface.assertions ?? [], `${path}.assertions`).map((entry, index) =>
      expectEnum(entry, `${path}.assertions[${index}]`, assertionKinds),
    ) as AssertionKind[],
    required: surface.required === undefined ? undefined : expectBoolean(surface.required, `${path}.required`),
  };
}

function validateLocatorStrategy(value: unknown, path: string): LocatorStrategy {
  const strategy = expectRecord(value, path);
  const kind = expectEnum(strategy.kind, `${path}.kind`, locatorStrategyKinds);

  switch (kind) {
    case 'test-id':
      return {
        kind,
        value: expectString(strategy.value, `${path}.value`),
      };
    case 'role-name':
      return {
        kind,
        role: expectString(strategy.role, `${path}.role`),
        name: expectOptionalString(strategy.name, `${path}.name`) ?? null,
      };
    case 'css':
      return {
        kind,
        value: expectString(strategy.value, `${path}.value`),
      };
  }
}

function validateElement(value: unknown, path: string): ElementSig {
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

function validateEffect(value: unknown, path: string): PostureEffect {
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

function validatePosture(value: unknown, path: string): Posture {
  const posture = expectRecord(value, path);
  return {
    values: expectStringArray(posture.values ?? [], `${path}.values`),
    effects: expectArray(posture.effects ?? [], `${path}.effects`).map((entry, index) =>
      validateEffect(entry, `${path}.effects[${index}]`),
    ),
  };
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)) as T[];
}

export function validateWidgetCapabilityContract(value: unknown, path = 'widget-contract'): WidgetCapabilityContract {
  const contract = expectRecord(value, path);
  const supportedActions = uniqueSorted(
    expectArray(contract.supportedActions ?? [], `${path}.supportedActions`).map((entry, index) =>
      expectEnum(entry, `${path}.supportedActions[${index}]`, widgetActions),
    ),
  );
  const requiredPreconditions = uniqueSorted(
    expectArray(contract.requiredPreconditions ?? [], `${path}.requiredPreconditions`).map((entry, index) =>
      expectEnum(entry, `${path}.requiredPreconditions[${index}]`, widgetPreconditions),
    ),
  );
  const rawSideEffects = expectRecord(contract.sideEffects ?? {}, `${path}.sideEffects`);
  const sideEffects = Object.fromEntries(
    Object.entries(rawSideEffects).map(([action, semantics]) => {
      const validatedAction = expectEnum(action, `${path}.sideEffects.${action}`, widgetActions);
      if (!supportedActions.includes(validatedAction)) {
        throw new SchemaError(`sideEffects references unsupported action ${validatedAction}`, `${path}.sideEffects.${action}`);
      }
      const entry = expectRecord(semantics, `${path}.sideEffects.${action}`);
      return [
        validatedAction,
        {
          expectedStates: uniqueSorted(
            expectArray(entry.expectedStates ?? [], `${path}.sideEffects.${action}.expectedStates`).map((state, index) =>
              expectEnum(state, `${path}.sideEffects.${action}.expectedStates[${index}]`, effectStates),
            ),
          ),
          effectCategories: uniqueSorted(
            expectArray(entry.effectCategories ?? [], `${path}.sideEffects.${action}.effectCategories`).map((category, index) =>
              expectEnum(category, `${path}.sideEffects.${action}.effectCategories[${index}]`, widgetEffectCategories),
            ),
          ),
        },
      ];
    }),
  );

  for (const action of supportedActions) {
    if (!sideEffects[action]) {
      throw new SchemaError(`missing side-effect semantics for action ${action}`, `${path}.sideEffects`);
    }
  }

  return {
    widget: expectId(contract.widget, `${path}.widget`, createWidgetId),
    supportedActions,
    requiredPreconditions,
    sideEffects,
  };
}

export function validateAdoSnapshot(value: unknown) {
  const snapshot = expectRecord(value, 'snapshot');
  const validated = {
    id: expectId(snapshot.id, 'snapshot.id', createAdoId),
    revision: expectNumber(snapshot.revision, 'snapshot.revision'),
    title: expectString(snapshot.title, 'snapshot.title'),
    suitePath: ensureSafeRelativePathLike(expectString(snapshot.suitePath, 'snapshot.suitePath'), 'snapshot.suitePath'),
    areaPath: expectString(snapshot.areaPath, 'snapshot.areaPath'),
    tags: expectStringArray(snapshot.tags ?? [], 'snapshot.tags'),
    priority: expectNumber(snapshot.priority, 'snapshot.priority'),
    steps: expectArray(snapshot.steps, 'snapshot.steps').map((entry, index) => {
      const step = expectRecord(entry, `snapshot.steps[${index}]`);
      return {
        index: expectNumber(step.index, `snapshot.steps[${index}].index`),
        action: expectString(step.action, `snapshot.steps[${index}].action`),
        expected: expectString(step.expected, `snapshot.steps[${index}].expected`),
        sharedStepId: step.sharedStepId === undefined ? undefined : expectString(step.sharedStepId, `snapshot.steps[${index}].sharedStepId`),
      };
    }),
    parameters: expectArray(snapshot.parameters ?? [], 'snapshot.parameters').map((entry, index) => {
      const parameter = expectRecord(entry, `snapshot.parameters[${index}]`);
      return {
        name: expectString(parameter.name, `snapshot.parameters[${index}].name`),
        values: expectStringArray(parameter.values, `snapshot.parameters[${index}].values`),
      };
    }),
    dataRows: expectArray(snapshot.dataRows ?? [], 'snapshot.dataRows').map((entry, index) =>
      expectStringRecord(entry, `snapshot.dataRows[${index}]`),
    ),
    contentHash: expectString(snapshot.contentHash, 'snapshot.contentHash'),
    syncedAt: expectString(snapshot.syncedAt, 'snapshot.syncedAt'),
  };

  const computedHash = computeAdoContentHash(validated);
  if (validated.contentHash !== computedHash) {
    throw new SchemaError(`contentHash mismatch, expected ${computedHash}`, 'snapshot.contentHash');
  }

  return validated;
}

export function validateScenario(value: unknown): Scenario {
  const scenario = expectRecord(value, 'scenario');
  return {
    source: validateScenarioSource(scenario.source),
    metadata: validateScenarioMetadata(scenario.metadata),
    preconditions: expectArray(scenario.preconditions ?? [], 'preconditions').map((entry, index) =>
      validatePrecondition(entry, `preconditions[${index}]`),
    ),
    steps: expectArray(scenario.steps ?? [], 'steps').map((entry, index) => validateStepBase(entry, `steps[${index}]`)),
    postconditions: expectArray(scenario.postconditions ?? [], 'postconditions').map((entry, index) =>
      validatePostcondition(entry, `postconditions[${index}]`),
    ),
  };
}

export function validateBoundScenario(value: unknown): BoundScenario {
  const scenario = validateScenario(value);
  const raw = expectRecord(value, 'scenario');
  return {
    ...scenario,
    kind: expectEnum(raw.kind, 'kind', ['bound-scenario'] as const),
    steps: expectArray(raw.steps ?? [], 'steps').map((entry, index) => validateBoundStep(entry, `steps[${index}]`)),
    diagnostics: expectArray(raw.diagnostics ?? [], 'diagnostics').map((entry, index) =>
      validateDiagnostic(entry, `diagnostics[${index}]`),
    ),
  };
}

function validateStepTaskElementCandidate(value: unknown, path: string) {
  const candidate = expectRecord(value, path);
  return {
    element: expectId(candidate.element, `${path}.element`, createElementId),
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
    snapshotAliases: Object.fromEntries(
      Object.entries(expectRecord(candidate.snapshotAliases ?? {}, `${path}.snapshotAliases`)).map(([snapshotId, aliases]) => [
        ensureSafeRelativePathLike(snapshotId, `${path}.snapshotAliases.${snapshotId}`),
        expectStringArray(aliases, `${path}.snapshotAliases.${snapshotId}`),
      ]),
    ),
  };
}

function validateStepTaskScreenCandidate(value: unknown, path: string) {
  const candidate = expectRecord(value, path);
  return {
    screen: expectId(candidate.screen, `${path}.screen`, createScreenId),
    url: expectString(candidate.url, `${path}.url`),
    screenAliases: expectStringArray(candidate.screenAliases ?? [], `${path}.screenAliases`),
    knowledgeRefs: expectStringArray(candidate.knowledgeRefs ?? [], `${path}.knowledgeRefs`),
    supplementRefs: expectStringArray(candidate.supplementRefs ?? [], `${path}.supplementRefs`),
    elements: expectArray(candidate.elements ?? [], `${path}.elements`).map((entry, index) =>
      validateStepTaskElementCandidate(entry, `${path}.elements[${index}]`),
    ),
    sectionSnapshots: expectIdArray(candidate.sectionSnapshots ?? [], `${path}.sectionSnapshots`, createSnapshotTemplateId),
  };
}

function validateRuntimeKnowledgeSession(value: unknown, path: string) {
  const session = expectRecord(value, path);
  return {
    knowledgeFingerprint: expectString(session.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    sharedPatterns: validateSharedPatterns(session.sharedPatterns),
    screens: expectArray(session.screens ?? [], `${path}.screens`).map((entry, index) =>
      validateStepTaskScreenCandidate(entry, `${path}.screens[${index}]`),
    ),
    evidenceRefs: expectStringArray(session.evidenceRefs ?? [], `${path}.evidenceRefs`),
  };
}

function validateStepTask(value: unknown, path: string) {
  const task = expectRecord(value, path);
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
    runtimeKnowledge: validateRuntimeKnowledgeSession(task.runtimeKnowledge, `${path}.runtimeKnowledge`),
    taskFingerprint: expectString(task.taskFingerprint, `${path}.taskFingerprint`),
  };
}

export function validateScenarioTaskPacket(value: unknown): ScenarioTaskPacket {
  const packet = expectRecord(value, 'scenarioTaskPacket');
  return {
    kind: expectEnum(packet.kind, 'scenarioTaskPacket.kind', ['scenario-task-packet'] as const),
    adoId: expectId(packet.adoId, 'scenarioTaskPacket.adoId', createAdoId),
    revision: expectNumber(packet.revision, 'scenarioTaskPacket.revision'),
    title: expectString(packet.title, 'scenarioTaskPacket.title'),
    suite: ensureSafeRelativePathLike(expectString(packet.suite, 'scenarioTaskPacket.suite'), 'scenarioTaskPacket.suite'),
    taskFingerprint: expectString(packet.taskFingerprint, 'scenarioTaskPacket.taskFingerprint'),
    knowledgeFingerprint: expectString(packet.knowledgeFingerprint, 'scenarioTaskPacket.knowledgeFingerprint'),
    steps: expectArray(packet.steps ?? [], 'scenarioTaskPacket.steps').map((entry, index) =>
      validateStepTask(entry, `scenarioTaskPacket.steps[${index}]`),
    ),
  };
}

function validateResolutionObservation(value: unknown, path: string) {
  const observation = expectRecord(value, path);
  return {
    source: expectEnum(observation.source, `${path}.source`, ['knowledge', 'evidence', 'dom', 'runtime'] as const),
    summary: expectString(observation.summary, `${path}.summary`),
    detail: observation.detail === undefined ? undefined : expectStringRecord(observation.detail, `${path}.detail`),
  };
}

function validateResolutionExhaustionEntry(value: unknown, path: string) {
  const entry = expectRecord(value, path);
  return {
    stage: expectEnum(entry.stage, `${path}.stage`, ['explicit', 'approved-screen-bundle', 'local-hints', 'shared-patterns', 'prior-evidence', 'live-dom', 'safe-degraded-resolution'] as const),
    outcome: expectEnum(entry.outcome, `${path}.outcome`, ['attempted', 'resolved', 'skipped', 'failed'] as const),
    reason: expectString(entry.reason, `${path}.reason`),
  };
}

function validateResolutionEvidenceDraft(value: unknown, path: string) {
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

function validateResolutionProposalDraft(value: unknown, path: string) {
  const draft = expectRecord(value, path);
  return {
    artifactType: validateTrustPolicyArtifactType(draft.artifactType, `${path}.artifactType`),
    targetPath: expectString(draft.targetPath, `${path}.targetPath`),
    title: expectString(draft.title, `${path}.title`),
    patch: expectRecord(draft.patch ?? {}, `${path}.patch`),
    rationale: expectString(draft.rationale, `${path}.rationale`),
  };
}

function validateResolutionTarget(value: unknown, path: string) {
  const target = expectRecord(value, path);
  return {
    action: validateAction(target.action, `${path}.action`),
    screen: expectId(target.screen, `${path}.screen`, createScreenId),
    element: expectOptionalId(target.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(target.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(target.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(target.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
  };
}

function validateResolutionReceipt(value: unknown, path: string): ResolutionReceipt {
  const receipt = expectRecord(value, path);
  const base = {
    taskFingerprint: expectString(receipt.taskFingerprint, `${path}.taskFingerprint`),
    knowledgeFingerprint: expectString(receipt.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    provider: expectString(receipt.provider, `${path}.provider`),
    mode: expectString(receipt.mode, `${path}.mode`),
    runAt: expectString(receipt.runAt, `${path}.runAt`),
    stepIndex: expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    knowledgeRefs: expectStringArray(receipt.knowledgeRefs ?? [], `${path}.knowledgeRefs`),
    supplementRefs: expectStringArray(receipt.supplementRefs ?? [], `${path}.supplementRefs`),
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
  };
  const kind = expectEnum(receipt.kind, `${path}.kind`, ['resolved', 'resolved-with-proposals', 'needs-human'] as const);
  if (kind === 'needs-human') {
    return {
      ...base,
      kind,
      confidence: expectEnum(receipt.confidence, `${path}.confidence`, ['unbound'] as const),
      provenanceKind: expectEnum(receipt.provenanceKind, `${path}.provenanceKind`, ['unresolved'] as const),
      reason: expectString(receipt.reason, `${path}.reason`),
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

function validateStepExecutionReceipt(value: unknown, path: string) {
  const receipt = expectRecord(value, path);
  const execution = expectRecord(receipt.execution, `${path}.execution`);
  return {
    stepIndex: expectNumber(receipt.stepIndex, `${path}.stepIndex`),
    taskFingerprint: expectString(receipt.taskFingerprint, `${path}.taskFingerprint`),
    knowledgeFingerprint: expectString(receipt.knowledgeFingerprint, `${path}.knowledgeFingerprint`),
    runAt: expectString(receipt.runAt, `${path}.runAt`),
    mode: expectString(receipt.mode, `${path}.mode`),
    locatorStrategy: expectOptionalString(receipt.locatorStrategy, `${path}.locatorStrategy`) ?? null,
    degraded: expectBoolean(receipt.degraded, `${path}.degraded`),
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

export function validateRunRecord(value: unknown): RunRecord {
  const record = expectRecord(value, 'runRecord');
  return {
    kind: expectEnum(record.kind, 'runRecord.kind', ['scenario-run-record'] as const),
    runId: expectString(record.runId, 'runRecord.runId'),
    adoId: expectId(record.adoId, 'runRecord.adoId', createAdoId),
    revision: expectNumber(record.revision, 'runRecord.revision'),
    title: expectString(record.title, 'runRecord.title'),
    suite: ensureSafeRelativePathLike(expectString(record.suite, 'runRecord.suite'), 'runRecord.suite'),
    taskFingerprint: expectString(record.taskFingerprint, 'runRecord.taskFingerprint'),
    knowledgeFingerprint: expectString(record.knowledgeFingerprint, 'runRecord.knowledgeFingerprint'),
    provider: expectString(record.provider, 'runRecord.provider'),
    mode: expectString(record.mode, 'runRecord.mode'),
    startedAt: expectString(record.startedAt, 'runRecord.startedAt'),
    completedAt: expectString(record.completedAt, 'runRecord.completedAt'),
    steps: expectArray(record.steps ?? [], 'runRecord.steps').map((entry, index) => {
      const step = expectRecord(entry, `runRecord.steps[${index}]`);
      return {
        stepIndex: expectNumber(step.stepIndex, `runRecord.steps[${index}].stepIndex`),
        interpretation: validateResolutionReceipt(step.interpretation, `runRecord.steps[${index}].interpretation`),
        execution: validateStepExecutionReceipt(step.execution, `runRecord.steps[${index}].execution`),
        evidenceIds: expectStringArray(step.evidenceIds ?? [], `runRecord.steps[${index}].evidenceIds`),
      };
    }),
    evidenceIds: expectStringArray(record.evidenceIds ?? [], 'runRecord.evidenceIds'),
  };
}

export function validateProposalBundle(value: unknown): ProposalBundle {
  const bundle = expectRecord(value, 'proposalBundle');
  return {
    kind: expectEnum(bundle.kind, 'proposalBundle.kind', ['proposal-bundle'] as const),
    adoId: expectId(bundle.adoId, 'proposalBundle.adoId', createAdoId),
    runId: expectString(bundle.runId, 'proposalBundle.runId'),
    revision: expectNumber(bundle.revision, 'proposalBundle.revision'),
    title: expectString(bundle.title, 'proposalBundle.title'),
    suite: ensureSafeRelativePathLike(expectString(bundle.suite, 'proposalBundle.suite'), 'proposalBundle.suite'),
    proposals: expectArray(bundle.proposals ?? [], 'proposalBundle.proposals').map((entry, index) => {
      const proposal = expectRecord(entry, `proposalBundle.proposals[${index}]`);
      return {
        stepIndex: expectNumber(proposal.stepIndex, `proposalBundle.proposals[${index}].stepIndex`),
        artifactType: validateTrustPolicyArtifactType(proposal.artifactType, `proposalBundle.proposals[${index}].artifactType`),
        targetPath: expectString(proposal.targetPath, `proposalBundle.proposals[${index}].targetPath`),
        title: expectString(proposal.title, `proposalBundle.proposals[${index}].title`),
        patch: expectRecord(proposal.patch ?? {}, `proposalBundle.proposals[${index}].patch`),
        evidenceIds: expectStringArray(proposal.evidenceIds ?? [], `proposalBundle.proposals[${index}].evidenceIds`),
        impactedSteps: expectArray(proposal.impactedSteps ?? [], `proposalBundle.proposals[${index}].impactedSteps`).map((stepIndex, impactedIndex) =>
          expectNumber(stepIndex, `proposalBundle.proposals[${index}].impactedSteps[${impactedIndex}]`),
        ),
        trustPolicy: validateTrustPolicyEvaluation(proposal.trustPolicy),
      };
    }),
  };
}

export function validateSurfaceGraph(value: unknown): SurfaceGraph {
  const graph = expectRecord(value, 'surface-graph');
  const sections = expectRecord(graph.sections ?? {}, 'surface-graph.sections');
  const surfaces = expectRecord(graph.surfaces ?? {}, 'surface-graph.surfaces');
  return {
    screen: expectId(graph.screen, 'surface-graph.screen', createScreenId),
    url: expectString(graph.url, 'surface-graph.url'),
    sections: Object.fromEntries(
      Object.entries(sections).map(([key, entry]) => [key, validateSection(entry, `surface-graph.sections.${key}`)]),
    ),
    surfaces: Object.fromEntries(
      Object.entries(surfaces).map(([key, entry]) => [key, validateSurfaceDefinition(entry, `surface-graph.surfaces.${key}`)]),
    ),
  };
}

export function validateScreenElements(value: unknown): ScreenElements {
  const screen = expectRecord(value, 'screen-elements');
  const elements = expectRecord(screen.elements, 'screen-elements.elements');
  return {
    screen: expectId(screen.screen, 'screen-elements.screen', createScreenId),
    url: expectString(screen.url, 'screen-elements.url'),
    elements: Object.fromEntries(
      Object.entries(elements).map(([key, entry]) => [key, validateElement(entry, `screen-elements.elements.${key}`)]),
    ),
  };
}

export function validateScreenHints(value: unknown): ScreenHints {
  const hints = expectRecord(value, 'screen-hints');
  const elements = expectRecord(hints.elements ?? {}, 'screen-hints.elements');
  return {
    screen: expectId(hints.screen, 'screen-hints.screen', createScreenId),
    screenAliases: uniqueSorted(expectStringArray(hints.screenAliases ?? [], 'screen-hints.screenAliases')),
    elements: Object.fromEntries(
      Object.entries(elements).map(([elementId, entry]) => {
        const hint = expectRecord(entry, `screen-hints.elements.${elementId}`);
        return [
          elementId,
          {
            aliases: uniqueSorted(expectStringArray(hint.aliases ?? [], `screen-hints.elements.${elementId}.aliases`)),
            defaultValueRef: expectOptionalString(hint.defaultValueRef, `screen-hints.elements.${elementId}.defaultValueRef`) ?? null,
            parameter: expectOptionalString(hint.parameter, `screen-hints.elements.${elementId}.parameter`) ?? null,
            snapshotAliases: Object.fromEntries(
              Object.entries(expectRecord(hint.snapshotAliases ?? {}, `screen-hints.elements.${elementId}.snapshotAliases`)).map(([snapshotId, aliases]) => [
                ensureSafeRelativePathLike(snapshotId, `screen-hints.elements.${elementId}.snapshotAliases.${snapshotId}`),
                uniqueSorted(expectStringArray(aliases, `screen-hints.elements.${elementId}.snapshotAliases.${snapshotId}`)),
              ]),
            ),
            affordance: expectOptionalString(hint.affordance, `screen-hints.elements.${elementId}.affordance`) ?? null,
          },
        ];
      }),
    ),
  };
}

export function validatePatternDocument(value: unknown): PatternDocument {
  return validatePatternDocumentRecord(value);
}

export function validateSharedPatterns(value: unknown): SharedPatterns {
  const patterns = expectRecord(value, 'shared-patterns');
  const actions = expectRecord(patterns.actions, 'shared-patterns.actions');
  const postures = expectRecord(patterns.postures ?? {}, 'shared-patterns.postures');
  const sources = expectRecord(patterns.sources, 'shared-patterns.sources');
  const actionSources = expectRecord(sources.actions, 'shared-patterns.sources.actions');
  const postureSources = expectRecord(sources.postures ?? {}, 'shared-patterns.sources.postures');
  const requiredActions = ['navigate', 'input', 'click', 'assert-snapshot'] as const;

  const validatedActions = Object.fromEntries(requiredActions.map((action) => {
    const record = expectRecord(actions[action], `shared-patterns.actions.${action}`);
    return [action, {
      id: expectString(record.id, `shared-patterns.actions.${action}.id`),
      aliases: uniqueSorted(expectStringArray(record.aliases ?? [], `shared-patterns.actions.${action}.aliases`)),
    }];
  })) as MergedPatterns['actions'];

  return {
    version: expectNumber(patterns.version, 'shared-patterns.version') as 1,
    actions: validatedActions,
    postures: Object.fromEntries(
      Object.entries(postures).map(([postureId, entry]) => {
        const record = expectRecord(entry, `shared-patterns.postures.${postureId}`);
        return [postureId, {
          id: expectString(record.id, `shared-patterns.postures.${postureId}.id`),
          aliases: uniqueSorted(expectStringArray(record.aliases ?? [], `shared-patterns.postures.${postureId}.aliases`)),
        }];
      }),
    ),
    documents: uniqueSorted(expectStringArray(patterns.documents ?? [], 'shared-patterns.documents')),
    sources: {
      actions: Object.fromEntries(requiredActions.map((action) => [
        action,
        expectString(actionSources[action], `shared-patterns.sources.actions.${action}`),
      ])) as MergedPatterns['sources']['actions'],
      postures: Object.fromEntries(
        Object.entries(postureSources).map(([postureId, sourcePath]) => [
          postureId,
          expectString(sourcePath, `shared-patterns.sources.postures.${postureId}`),
        ]),
      ),
    },
  };
}

export function validateScreenPostures(value: unknown): ScreenPostures {
  const screen = expectRecord(value, 'screen-postures');
  const postures = expectRecord(screen.postures ?? {}, 'screen-postures.postures');
  return normalizeScreenPostures({
    screen: expectId(screen.screen, 'screen-postures.screen', createScreenId),
    postures: Object.fromEntries(
      Object.entries(postures).map(([elementId, entry]) => {
        const postureSet = expectRecord(entry, `screen-postures.postures.${elementId}`);
        return [
          elementId,
          Object.fromEntries(
            Object.entries(postureSet).map(([postureId, postureValue]) => [
              postureId,
              validatePosture(postureValue, `screen-postures.postures.${elementId}.${postureId}`),
            ]),
          ),
        ];
      }),
    ),
  });
}

export function validateManifest(value: unknown): Manifest {
  const manifest = expectRecord(value, 'manifest');
  const entries = expectRecord(manifest.entries ?? {}, 'manifest.entries');
  return {
    entries: Object.fromEntries(
      Object.entries(entries).map(([adoId, entry]) => {
        const item = expectRecord(entry, `manifest.entries.${adoId}`);
        return [
          adoId,
          {
            adoId: expectId(item.adoId, `manifest.entries.${adoId}.adoId`, createAdoId),
            revision: expectNumber(item.revision, `manifest.entries.${adoId}.revision`),
            contentHash: expectString(item.contentHash, `manifest.entries.${adoId}.contentHash`),
            syncedAt: expectString(item.syncedAt, `manifest.entries.${adoId}.syncedAt`),
            sourcePath: expectString(item.sourcePath, `manifest.entries.${adoId}.sourcePath`),
          },
        ];
      }),
    ),
  };
}

function validateGraphNode(value: unknown, path: string) {
  const node = expectRecord(value, path);
  const provenance = node.provenance ? expectRecord(node.provenance, `${path}.provenance`) : {};
  return {
    id: expectString(node.id, `${path}.id`),
    kind: expectEnum(node.kind, `${path}.kind`, graphNodeKinds),
    label: expectString(node.label, `${path}.label`),
    fingerprint: expectString(node.fingerprint, `${path}.fingerprint`),
    artifactPath: expectOptionalString(node.artifactPath, `${path}.artifactPath`) ?? undefined,
    provenance: {
      sourceRevision: provenance.sourceRevision === undefined ? undefined : expectNumber(provenance.sourceRevision, `${path}.provenance.sourceRevision`),
      contentHash: provenance.contentHash === undefined ? undefined : expectString(provenance.contentHash, `${path}.provenance.contentHash`),
      scenarioPath: provenance.scenarioPath === undefined ? undefined : expectString(provenance.scenarioPath, `${path}.provenance.scenarioPath`),
      snapshotPath: provenance.snapshotPath === undefined ? undefined : expectString(provenance.snapshotPath, `${path}.provenance.snapshotPath`),
      knowledgePath: provenance.knowledgePath === undefined ? undefined : expectString(provenance.knowledgePath, `${path}.provenance.knowledgePath`),
      confidence:
        provenance.confidence === undefined
          ? undefined
          : (expectEnum(provenance.confidence, `${path}.provenance.confidence`, diagnosticConfidences) as Confidence | 'mixed'),
    },
    payload: node.payload === undefined ? undefined : expectRecord(node.payload, `${path}.payload`),
  };
}

function validateGraphEdge(value: unknown, path: string) {
  const edge = expectRecord(value, path);
  const provenance = edge.provenance ? expectRecord(edge.provenance, `${path}.provenance`) : {};
  return {
    id: expectString(edge.id, `${path}.id`),
    kind: expectEnum(edge.kind, `${path}.kind`, graphEdgeKinds),
    from: expectString(edge.from, `${path}.from`),
    to: expectString(edge.to, `${path}.to`),
    fingerprint: expectString(edge.fingerprint, `${path}.fingerprint`),
    provenance: {
      sourceRevision: provenance.sourceRevision === undefined ? undefined : expectNumber(provenance.sourceRevision, `${path}.provenance.sourceRevision`),
      contentHash: provenance.contentHash === undefined ? undefined : expectString(provenance.contentHash, `${path}.provenance.contentHash`),
      scenarioPath: provenance.scenarioPath === undefined ? undefined : expectString(provenance.scenarioPath, `${path}.provenance.scenarioPath`),
      snapshotPath: provenance.snapshotPath === undefined ? undefined : expectString(provenance.snapshotPath, `${path}.provenance.snapshotPath`),
      knowledgePath: provenance.knowledgePath === undefined ? undefined : expectString(provenance.knowledgePath, `${path}.provenance.knowledgePath`),
      confidence:
        provenance.confidence === undefined
          ? undefined
          : (expectEnum(provenance.confidence, `${path}.provenance.confidence`, diagnosticConfidences) as Confidence | 'mixed'),
    },
    payload: edge.payload === undefined ? undefined : expectRecord(edge.payload, `${path}.payload`),
  };
}

export function validateDerivedGraph(value: unknown): DerivedGraph {
  const graph = expectRecord(value, 'derived-graph');
  return {
    version: expectEnum(graph.version, 'derived-graph.version', ['v1'] as const),
    fingerprint: expectString(graph.fingerprint, 'derived-graph.fingerprint'),
    nodes: expectArray(graph.nodes ?? [], 'derived-graph.nodes').map((entry, index) =>
      validateGraphNode(entry, `derived-graph.nodes[${index}]`),
    ),
    edges: expectArray(graph.edges ?? [], 'derived-graph.edges').map((entry, index) =>
      validateGraphEdge(entry, `derived-graph.edges[${index}]`),
    ),
    resources: expectArray(graph.resources ?? [], 'derived-graph.resources').map((entry, index) => {
      const resource = expectRecord(entry, `derived-graph.resources[${index}]`);
      return {
        uri: expectString(resource.uri, `derived-graph.resources[${index}].uri`),
        description: expectString(resource.description, `derived-graph.resources[${index}].description`),
      };
    }),
    resourceTemplates: expectArray(graph.resourceTemplates ?? [], 'derived-graph.resourceTemplates').map((entry, index) => {
      const template = expectRecord(entry, `derived-graph.resourceTemplates[${index}]`);
      return {
        uriTemplate: expectString(template.uriTemplate, `derived-graph.resourceTemplates[${index}].uriTemplate`),
        description: expectString(template.description, `derived-graph.resourceTemplates[${index}].description`),
      };
    }),
  };
}


function validateTrustPolicyArtifactType(value: unknown, path: string): TrustPolicyArtifactType {
  return expectEnum(value, path, ['elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns'] as const);
}

function validateTrustPolicyEvaluationReason(value: unknown, path: string): TrustPolicyEvaluationReason {
  const record = expectRecord(value, path);
  return {
    code: expectEnum(record.code, `${path}.code`, ['minimum-confidence', 'required-evidence', 'forbidden-auto-heal'] as const),
    message: expectString(record.message, `${path}.message`),
  };
}

export function validateTrustPolicy(value: unknown): TrustPolicy {
  const policy = expectRecord(value, 'trustPolicy');
  const artifactTypesRecord = expectRecord(policy.artifactTypes, 'trustPolicy.artifactTypes');
  const parsedEntries = Object.entries(artifactTypesRecord).map(([artifactType, ruleValue]) => {
    const typedArtifact = validateTrustPolicyArtifactType(artifactType, `trustPolicy.artifactTypes.${artifactType}`);
    const ruleRecord = expectRecord(ruleValue, `trustPolicy.artifactTypes.${artifactType}`);
    const evidenceRecord = expectRecord(ruleRecord.requiredEvidence, `trustPolicy.artifactTypes.${artifactType}.requiredEvidence`);
    return [typedArtifact, {
      minimumConfidence: expectNumber(ruleRecord.minimumConfidence, `trustPolicy.artifactTypes.${artifactType}.minimumConfidence`),
      requiredEvidence: {
        minCount: expectNumber(evidenceRecord.minCount, `trustPolicy.artifactTypes.${artifactType}.requiredEvidence.minCount`),
        kinds: expectStringArray(evidenceRecord.kinds, `trustPolicy.artifactTypes.${artifactType}.requiredEvidence.kinds`),
      },
    }] as const;
  });

  const artifactTypes = Object.fromEntries(parsedEntries) as TrustPolicy['artifactTypes'];

  for (const requiredType of ['elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns'] as const) {
    if (!artifactTypes[requiredType]) {
      throw new SchemaError(`missing trust policy rule for ${requiredType}`, 'trustPolicy.artifactTypes');
    }
  }

  const version = expectNumber(policy.version, 'trustPolicy.version');
  if (version !== 1) {
    throw new SchemaError('expected version 1', 'trustPolicy.version');
  }

  return {
    version,
    artifactTypes,
    forbiddenAutoHealClasses: expectStringArray(policy.forbiddenAutoHealClasses ?? [], 'trustPolicy.forbiddenAutoHealClasses'),
  };
}

export function validateTrustPolicyEvaluation(value: unknown): TrustPolicyEvaluation {
  const record = expectRecord(value, 'trustPolicyEvaluation');
  return {
    decision: expectEnum(record.decision, 'trustPolicyEvaluation.decision', ['allow', 'review', 'deny'] as const),
    reasons: expectArray(record.reasons ?? [], 'trustPolicyEvaluation.reasons').map((entry, index) => validateTrustPolicyEvaluationReason(entry, `trustPolicyEvaluation.reasons[${index}]`)),
  };
}








