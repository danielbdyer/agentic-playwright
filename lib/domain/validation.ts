import {
  AssertionKind,
  BoundScenario,
  BoundStep,
  CompilerDiagnostic,
  Confidence,
  DerivedGraph,
  EffectTargetKind,
  ElementSig,
  Manifest,
  Posture,
  PostureEffect,
  RefPath,
  Scenario,
  ScenarioMetadata,
  ScenarioPostcondition,
  ScenarioPrecondition,
  ScenarioSource,
  ScenarioStep,
  ScreenElements,
  ScreenPostures,
  StepAction,
  StepInstruction,
  StepProgram,
  SurfaceDefinition,
  SurfaceGraph,
  SurfaceSection,
  ValueRef,
} from './types';
import { computeAdoContentHash } from './hash';
import { SchemaError } from './errors';
import {
  AdoId,
  createAdoId,
  createElementId,
  createFixtureId,
  createPostureId,
  createScreenId,
  createSectionId,
  createSnapshotTemplateId,
  createSurfaceId,
  createWidgetId,
  ElementId,
  FixtureId,
  PostureId,
  ScreenId,
  SectionId,
  SnapshotTemplateId,
  SurfaceId,
  WidgetId,
} from './identity';

type UnknownRecord = Record<string, unknown>;

const scenarioStatuses = ['stub', 'draft', 'active', 'needs-repair', 'blocked', 'deprecated'] as const;
const stepActions = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const;
const confidences = ['human', 'agent-verified', 'agent-proposed', 'unbound'] as const;
const valueRefKinds = ['literal', 'fixture-path', 'posture-sample', 'parameter-row', 'generated-token'] as const;
const stepInstructionKinds = ['navigate', 'enter', 'invoke', 'observe-structure', 'custom-escape-hatch'] as const;
const surfaceKinds = ['screen-root', 'form', 'action-cluster', 'validation-region', 'result-set', 'details-pane', 'modal', 'section-root'] as const;
const assertionKinds = ['state', 'structure'] as const;
const effectTargetKinds = ['self', 'element', 'surface'] as const;
const effectStates = ['validation-error', 'required-error', 'disabled', 'enabled', 'visible', 'hidden'] as const;
const graphNodeKinds = ['snapshot', 'screen', 'section', 'surface', 'element', 'posture', 'capability', 'scenario', 'step', 'generated-spec', 'evidence'] as const;
const graphEdgeKinds = ['derived-from', 'contains', 'references', 'uses', 'affects', 'asserts', 'emits', 'observed-by', 'proposed-change-for'] as const;
const diagnosticSeverities = ['info', 'warn', 'error'] as const;
const diagnosticConfidences = ['human', 'agent-verified', 'agent-proposed', 'unbound', 'mixed'] as const;

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
    suite: expectString(metadata.suite, 'metadata.suite'),
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
  return {
    index: expectNumber(step.index, `${path}.index`),
    intent: expectString(step.intent, `${path}.intent`),
    action: validateAction(step.action, `${path}.action`),
    screen: expectOptionalId(step.screen, `${path}.screen`, createScreenId) ?? null,
    element: expectOptionalId(step.element, `${path}.element`, createElementId) ?? null,
    posture: expectOptionalId(step.posture, `${path}.posture`, createPostureId) ?? null,
    override: expectOptionalString(step.override, `${path}.override`) ?? null,
    snapshot_template: expectOptionalId(step.snapshot_template, `${path}.snapshot_template`, createSnapshotTemplateId) ?? null,
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
      kind: expectEnum(binding.kind, `${path}.binding.kind`, ['bound', 'unbound'] as const),
      reasons: expectStringArray(binding.reasons ?? [], `${path}.binding.reasons`),
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

function validateElement(value: unknown, path: string): ElementSig {
  const element = expectRecord(value, path);
  return {
    role: expectString(element.role, `${path}.role`),
    name: expectOptionalString(element.name, `${path}.name`) ?? null,
    testId: expectOptionalString(element.testId, `${path}.testId`) ?? null,
    cssFallback: expectOptionalString(element.cssFallback, `${path}.cssFallback`) ?? null,
    surface: expectId(element.surface, `${path}.surface`, createSurfaceId),
    widget: expectId(element.widget, `${path}.widget`, createWidgetId),
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

export function validateAdoSnapshot(value: unknown) {
  const snapshot = expectRecord(value, 'snapshot');
  const validated = {
    id: expectId(snapshot.id, 'snapshot.id', createAdoId),
    revision: expectNumber(snapshot.revision, 'snapshot.revision'),
    title: expectString(snapshot.title, 'snapshot.title'),
    suitePath: expectString(snapshot.suitePath, 'snapshot.suitePath'),
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

export function validateScreenPostures(value: unknown): ScreenPostures {
  const screen = expectRecord(value, 'screen-postures');
  const postures = expectRecord(screen.postures ?? {}, 'screen-postures.postures');
  return {
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
  };
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

