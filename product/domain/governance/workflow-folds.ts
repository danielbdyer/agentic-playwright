/**
 * Workflow-union folds + value-level companions (W2.1 / Agent C #2, #10).
 *
 * CLAUDE.md discipline: "Use the typed fold functions for all
 * major discriminated unions ... Prefer these over raw switch
 * statements — the fold guarantees compile-time exhaustiveness
 * when a new variant is added." The workflow-types module
 * declares ~20 closed unions; this module lifts the most
 * central ones into exhaustive folds + `*_VALUES` runtime
 * companions per Agent C's audit (2026-04-24).
 *
 * Why a sibling module rather than inline: `workflow-types.ts`
 * already mixes type declarations + envelope machinery +
 * helpers; keeping the folds separate avoids further bloat
 * and lets `grep foldWorkflow` land here directly.
 *
 * Pure domain — no Effect, no IO.
 */

import { closedUnion } from '../algebra/closed-union';
import type {
  AssertionKind,
  CapabilityName,
  CertificationStatus,
  DiagnosticSeverity,
  EffectState,
  EffectTargetKind,
  ExecutionProfile,
  LocatorStrategyKind,
  PatternActionName,
  ResolutionMode,
  RuntimeInterpreterMode,
  ScenarioLifecycle,
  ScenarioStatus,
  StepAction,
  StepBindingKind,
  StepProvenanceKind,
  SurfaceKind,
  WorkflowLane,
  WorkflowScope,
  WorkflowStage,
  WriteMode,
} from './workflow-types';

// ─── WorkflowStage ───────────────────────────────────────────

const WORKFLOW_STAGE_UNION = closedUnion<WorkflowStage>([
  'preparation',
  'resolution',
  'execution',
  'evidence',
  'proposal',
  'projection',
]);

export const WORKFLOW_STAGE_VALUES = WORKFLOW_STAGE_UNION.values;

export function foldWorkflowStage<R>(
  stage: WorkflowStage,
  cases: {
    readonly preparation: () => R;
    readonly resolution: () => R;
    readonly execution: () => R;
    readonly evidence: () => R;
    readonly proposal: () => R;
    readonly projection: () => R;
  },
): R {
  switch (stage) {
    case 'preparation':
      return cases.preparation();
    case 'resolution':
      return cases.resolution();
    case 'execution':
      return cases.execution();
    case 'evidence':
      return cases.evidence();
    case 'proposal':
      return cases.proposal();
    case 'projection':
      return cases.projection();
  }
}

// ─── WorkflowScope ───────────────────────────────────────────

const WORKFLOW_SCOPE_UNION = closedUnion<WorkflowScope>([
  'scenario',
  'step',
  'run',
  'suite',
  'workspace',
  'control',
  'hypothesis',
  'compilation',
]);

export const WORKFLOW_SCOPE_VALUES = WORKFLOW_SCOPE_UNION.values;

export function foldWorkflowScope<R>(
  scope: WorkflowScope,
  cases: {
    readonly scenario: () => R;
    readonly step: () => R;
    readonly run: () => R;
    readonly suite: () => R;
    readonly workspace: () => R;
    readonly control: () => R;
    readonly hypothesis: () => R;
    readonly compilation: () => R;
  },
): R {
  switch (scope) {
    case 'scenario':
      return cases.scenario();
    case 'step':
      return cases.step();
    case 'run':
      return cases.run();
    case 'suite':
      return cases.suite();
    case 'workspace':
      return cases.workspace();
    case 'control':
      return cases.control();
    case 'hypothesis':
      return cases.hypothesis();
    case 'compilation':
      return cases.compilation();
  }
}

// ─── WorkflowLane ────────────────────────────────────────────

const WORKFLOW_LANE_UNION = closedUnion<WorkflowLane>([
  'intent',
  'knowledge',
  'control',
  'resolution',
  'execution',
  'governance',
  'projection',
]);

export const WORKFLOW_LANE_VALUES = WORKFLOW_LANE_UNION.values;

export function foldWorkflowLane<R>(
  lane: WorkflowLane,
  cases: {
    readonly intent: () => R;
    readonly knowledge: () => R;
    readonly control: () => R;
    readonly resolution: () => R;
    readonly execution: () => R;
    readonly governance: () => R;
    readonly projection: () => R;
  },
): R {
  switch (lane) {
    case 'intent':
      return cases.intent();
    case 'knowledge':
      return cases.knowledge();
    case 'control':
      return cases.control();
    case 'resolution':
      return cases.resolution();
    case 'execution':
      return cases.execution();
    case 'governance':
      return cases.governance();
    case 'projection':
      return cases.projection();
  }
}

// ─── ResolutionMode ──────────────────────────────────────────

const RESOLUTION_MODE_UNION = closedUnion<ResolutionMode>([
  'deterministic',
  'translation',
  'agentic',
]);

export const RESOLUTION_MODE_VALUES = RESOLUTION_MODE_UNION.values;

export function foldResolutionMode<R>(
  mode: ResolutionMode,
  cases: {
    readonly deterministic: () => R;
    readonly translation: () => R;
    readonly agentic: () => R;
  },
): R {
  switch (mode) {
    case 'deterministic':
      return cases.deterministic();
    case 'translation':
      return cases.translation();
    case 'agentic':
      return cases.agentic();
  }
}

// ─── CertificationStatus ─────────────────────────────────────

const CERTIFICATION_STATUS_UNION = closedUnion<CertificationStatus>([
  'uncertified',
  'certified',
]);

export const CERTIFICATION_STATUS_VALUES = CERTIFICATION_STATUS_UNION.values;

export function foldCertificationStatus<R>(
  status: CertificationStatus,
  cases: { readonly uncertified: () => R; readonly certified: () => R },
): R {
  switch (status) {
    case 'uncertified':
      return cases.uncertified();
    case 'certified':
      return cases.certified();
  }
}

// ─── StepProvenanceKind ──────────────────────────────────────

const STEP_PROVENANCE_KIND_UNION = closedUnion<StepProvenanceKind>([
  'explicit',
  'approved-knowledge',
  'live-exploration',
  'agent-interpreted',
  'unresolved',
]);

export const STEP_PROVENANCE_KIND_VALUES = STEP_PROVENANCE_KIND_UNION.values;

export function foldStepProvenanceKind<R>(
  kind: StepProvenanceKind,
  cases: {
    readonly explicit: () => R;
    readonly approvedKnowledge: () => R;
    readonly liveExploration: () => R;
    readonly agentInterpreted: () => R;
    readonly unresolved: () => R;
  },
): R {
  switch (kind) {
    case 'explicit':
      return cases.explicit();
    case 'approved-knowledge':
      return cases.approvedKnowledge();
    case 'live-exploration':
      return cases.liveExploration();
    case 'agent-interpreted':
      return cases.agentInterpreted();
    case 'unresolved':
      return cases.unresolved();
  }
}

// ─── ScenarioStatus ──────────────────────────────────────────

const SCENARIO_STATUS_UNION = closedUnion<ScenarioStatus>([
  'stub',
  'draft',
  'active',
  'needs-repair',
  'blocked',
  'deprecated',
]);

export const SCENARIO_STATUS_VALUES = SCENARIO_STATUS_UNION.values;

export function foldScenarioStatus<R>(
  status: ScenarioStatus,
  cases: {
    readonly stub: () => R;
    readonly draft: () => R;
    readonly active: () => R;
    readonly needsRepair: () => R;
    readonly blocked: () => R;
    readonly deprecated: () => R;
  },
): R {
  switch (status) {
    case 'stub':
      return cases.stub();
    case 'draft':
      return cases.draft();
    case 'active':
      return cases.active();
    case 'needs-repair':
      return cases.needsRepair();
    case 'blocked':
      return cases.blocked();
    case 'deprecated':
      return cases.deprecated();
  }
}

// ─── StepAction ──────────────────────────────────────────────

const STEP_ACTION_UNION = closedUnion<StepAction>([
  'navigate',
  'input',
  'click',
  'assert-snapshot',
  'custom',
]);

export const STEP_ACTION_VALUES = STEP_ACTION_UNION.values;

export function foldStepAction<R>(
  action: StepAction,
  cases: {
    readonly navigate: () => R;
    readonly input: () => R;
    readonly click: () => R;
    readonly assertSnapshot: () => R;
    readonly custom: () => R;
  },
): R {
  switch (action) {
    case 'navigate':
      return cases.navigate();
    case 'input':
      return cases.input();
    case 'click':
      return cases.click();
    case 'assert-snapshot':
      return cases.assertSnapshot();
    case 'custom':
      return cases.custom();
  }
}

// ─── DiagnosticSeverity ──────────────────────────────────────

const DIAGNOSTIC_SEVERITY_UNION = closedUnion<DiagnosticSeverity>([
  'info',
  'warn',
  'error',
]);

export const DIAGNOSTIC_SEVERITY_VALUES = DIAGNOSTIC_SEVERITY_UNION.values;

export function foldDiagnosticSeverity<R>(
  severity: DiagnosticSeverity,
  cases: { readonly info: () => R; readonly warn: () => R; readonly error: () => R },
): R {
  switch (severity) {
    case 'info':
      return cases.info();
    case 'warn':
      return cases.warn();
    case 'error':
      return cases.error();
  }
}

// ─── RuntimeInterpreterMode ──────────────────────────────────

const RUNTIME_INTERPRETER_MODE_UNION = closedUnion<RuntimeInterpreterMode>([
  'playwright',
  'dry-run',
  'diagnostic',
]);

export const RUNTIME_INTERPRETER_MODE_VALUES = RUNTIME_INTERPRETER_MODE_UNION.values;

export function foldRuntimeInterpreterMode<R>(
  mode: RuntimeInterpreterMode,
  cases: {
    readonly playwright: () => R;
    readonly dryRun: () => R;
    readonly diagnostic: () => R;
  },
): R {
  switch (mode) {
    case 'playwright':
      return cases.playwright();
    case 'dry-run':
      return cases.dryRun();
    case 'diagnostic':
      return cases.diagnostic();
  }
}

// ─── ExecutionProfile ────────────────────────────────────────

const EXECUTION_PROFILE_UNION = closedUnion<ExecutionProfile>([
  'interactive',
  'ci-batch',
  'dogfood',
]);

export const EXECUTION_PROFILE_VALUES = EXECUTION_PROFILE_UNION.values;

export function foldExecutionProfile<R>(
  profile: ExecutionProfile,
  cases: {
    readonly interactive: () => R;
    readonly ciBatch: () => R;
    readonly dogfood: () => R;
  },
): R {
  switch (profile) {
    case 'interactive':
      return cases.interactive();
    case 'ci-batch':
      return cases.ciBatch();
    case 'dogfood':
      return cases.dogfood();
  }
}

// ─── WriteMode ───────────────────────────────────────────────

const WRITE_MODE_UNION = closedUnion<WriteMode>(['persist', 'no-write']);

export const WRITE_MODE_VALUES = WRITE_MODE_UNION.values;

export function foldWriteMode<R>(
  mode: WriteMode,
  cases: { readonly persist: () => R; readonly noWrite: () => R },
): R {
  switch (mode) {
    case 'persist':
      return cases.persist();
    case 'no-write':
      return cases.noWrite();
  }
}

// ─── PatternActionName ───────────────────────────────────────

const PATTERN_ACTION_NAME_UNION = closedUnion<PatternActionName>([
  'navigate',
  'input',
  'click',
  'assert-snapshot',
]);

export const PATTERN_ACTION_NAME_VALUES = PATTERN_ACTION_NAME_UNION.values;

export function foldPatternActionName<R>(
  name: PatternActionName,
  cases: {
    readonly navigate: () => R;
    readonly input: () => R;
    readonly click: () => R;
    readonly assertSnapshot: () => R;
  },
): R {
  switch (name) {
    case 'navigate':
      return cases.navigate();
    case 'input':
      return cases.input();
    case 'click':
      return cases.click();
    case 'assert-snapshot':
      return cases.assertSnapshot();
  }
}

// ─── ScenarioLifecycle ───────────────────────────────────────

const SCENARIO_LIFECYCLE_UNION = closedUnion<ScenarioLifecycle>([
  'normal',
  'fixme',
  'skip',
  'fail',
]);

export const SCENARIO_LIFECYCLE_VALUES = SCENARIO_LIFECYCLE_UNION.values;

export function foldScenarioLifecycle<R>(
  lifecycle: ScenarioLifecycle,
  cases: {
    readonly normal: () => R;
    readonly fixme: () => R;
    readonly skip: () => R;
    readonly fail: () => R;
  },
): R {
  switch (lifecycle) {
    case 'normal':
      return cases.normal();
    case 'fixme':
      return cases.fixme();
    case 'skip':
      return cases.skip();
    case 'fail':
      return cases.fail();
  }
}

// ─── StepBindingKind ─────────────────────────────────────────

const STEP_BINDING_KIND_UNION = closedUnion<StepBindingKind>([
  'bound',
  'deferred',
  'unbound',
]);

export const STEP_BINDING_KIND_VALUES = STEP_BINDING_KIND_UNION.values;

export function foldStepBindingKind<R>(
  kind: StepBindingKind,
  cases: {
    readonly bound: () => R;
    readonly deferred: () => R;
    readonly unbound: () => R;
  },
): R {
  switch (kind) {
    case 'bound':
      return cases.bound();
    case 'deferred':
      return cases.deferred();
    case 'unbound':
      return cases.unbound();
  }
}

// ─── EffectState ─────────────────────────────────────────────

const EFFECT_STATE_UNION = closedUnion<EffectState>([
  'validation-error',
  'required-error',
  'disabled',
  'enabled',
  'visible',
  'hidden',
]);

export const EFFECT_STATE_VALUES = EFFECT_STATE_UNION.values;

export function foldEffectState<R>(
  state: EffectState,
  cases: {
    readonly validationError: () => R;
    readonly requiredError: () => R;
    readonly disabled: () => R;
    readonly enabled: () => R;
    readonly visible: () => R;
    readonly hidden: () => R;
  },
): R {
  switch (state) {
    case 'validation-error':
      return cases.validationError();
    case 'required-error':
      return cases.requiredError();
    case 'disabled':
      return cases.disabled();
    case 'enabled':
      return cases.enabled();
    case 'visible':
      return cases.visible();
    case 'hidden':
      return cases.hidden();
  }
}

// ─── SurfaceKind ─────────────────────────────────────────────

const SURFACE_KIND_UNION = closedUnion<SurfaceKind>([
  'screen-root',
  'form',
  'action-cluster',
  'validation-region',
  'result-set',
  'details-pane',
  'modal',
  'section-root',
]);

export const SURFACE_KIND_VALUES = SURFACE_KIND_UNION.values;

export function foldSurfaceKind<R>(
  kind: SurfaceKind,
  cases: {
    readonly screenRoot: () => R;
    readonly form: () => R;
    readonly actionCluster: () => R;
    readonly validationRegion: () => R;
    readonly resultSet: () => R;
    readonly detailsPane: () => R;
    readonly modal: () => R;
    readonly sectionRoot: () => R;
  },
): R {
  switch (kind) {
    case 'screen-root':
      return cases.screenRoot();
    case 'form':
      return cases.form();
    case 'action-cluster':
      return cases.actionCluster();
    case 'validation-region':
      return cases.validationRegion();
    case 'result-set':
      return cases.resultSet();
    case 'details-pane':
      return cases.detailsPane();
    case 'modal':
      return cases.modal();
    case 'section-root':
      return cases.sectionRoot();
  }
}

// ─── AssertionKind ───────────────────────────────────────────

const ASSERTION_KIND_UNION = closedUnion<AssertionKind>(['state', 'structure']);

export const ASSERTION_KIND_VALUES = ASSERTION_KIND_UNION.values;

export function foldAssertionKind<R>(
  kind: AssertionKind,
  cases: { readonly state: () => R; readonly structure: () => R },
): R {
  switch (kind) {
    case 'state':
      return cases.state();
    case 'structure':
      return cases.structure();
  }
}

// ─── CapabilityName ──────────────────────────────────────────

const CAPABILITY_NAME_UNION = closedUnion<CapabilityName>([
  'navigate',
  'enter',
  'invoke',
  'observe-structure',
  'observe-state',
  'custom-escape-hatch',
]);

export const CAPABILITY_NAME_VALUES = CAPABILITY_NAME_UNION.values;

export function foldCapabilityName<R>(
  name: CapabilityName,
  cases: {
    readonly navigate: () => R;
    readonly enter: () => R;
    readonly invoke: () => R;
    readonly observeStructure: () => R;
    readonly observeState: () => R;
    readonly customEscapeHatch: () => R;
  },
): R {
  switch (name) {
    case 'navigate':
      return cases.navigate();
    case 'enter':
      return cases.enter();
    case 'invoke':
      return cases.invoke();
    case 'observe-structure':
      return cases.observeStructure();
    case 'observe-state':
      return cases.observeState();
    case 'custom-escape-hatch':
      return cases.customEscapeHatch();
  }
}

// ─── EffectTargetKind ────────────────────────────────────────

const EFFECT_TARGET_KIND_UNION = closedUnion<EffectTargetKind>([
  'self',
  'element',
  'surface',
]);

export const EFFECT_TARGET_KIND_VALUES = EFFECT_TARGET_KIND_UNION.values;

export function foldEffectTargetKind<R>(
  kind: EffectTargetKind,
  cases: {
    readonly self: () => R;
    readonly element: () => R;
    readonly surface: () => R;
  },
): R {
  switch (kind) {
    case 'self':
      return cases.self();
    case 'element':
      return cases.element();
    case 'surface':
      return cases.surface();
  }
}

// ─── LocatorStrategyKind ─────────────────────────────────────

const LOCATOR_STRATEGY_KIND_UNION = closedUnion<LocatorStrategyKind>([
  'role',
  'label',
  'placeholder',
  'text',
  'test-id',
  'css',
]);

export const LOCATOR_STRATEGY_KIND_VALUES = LOCATOR_STRATEGY_KIND_UNION.values;

export function foldLocatorStrategyKind<R>(
  kind: LocatorStrategyKind,
  cases: {
    readonly role: () => R;
    readonly label: () => R;
    readonly placeholder: () => R;
    readonly text: () => R;
    readonly testId: () => R;
    readonly css: () => R;
  },
): R {
  switch (kind) {
    case 'role':
      return cases.role();
    case 'label':
      return cases.label();
    case 'placeholder':
      return cases.placeholder();
    case 'text':
      return cases.text();
    case 'test-id':
      return cases.testId();
    case 'css':
      return cases.css();
  }
}
