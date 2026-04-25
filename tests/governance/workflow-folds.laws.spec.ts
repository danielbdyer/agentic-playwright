/**
 * Workflow-fold laws (W2.1 / Agent C #1, #2, #5, #10).
 *
 * Pin exhaustive-fold coverage for the central workflow unions
 * that previously lacked folds: `WorkflowStage`, `WorkflowScope`,
 * `WorkflowLane`, `ResolutionMode`, `ReasoningOp`. Each law
 * verifies:
 *
 *   - `*_VALUES: readonly T[]` matches the union (runtime
 *      side of the compile-time exhaustiveness witness).
 *   - `fold*` dispatches every value to the expected case.
 *   - Cases object is keyed by the closed set; adding a
 *      variant to the union without updating the fold is a
 *      type error (covered by build; tests sanity-check the
 *      runtime dispatch).
 */

import { describe, test, expect } from 'vitest';
import {
  WORKFLOW_STAGE_VALUES,
  WORKFLOW_SCOPE_VALUES,
  WORKFLOW_LANE_VALUES,
  RESOLUTION_MODE_VALUES,
  foldWorkflowStage,
  foldWorkflowScope,
  foldWorkflowLane,
  foldResolutionMode,
} from '../../product/domain/governance/workflow-folds';
import {
  REASONING_OP_VALUES,
  foldReasoningOp,
  type ReasoningOp,
} from '../../product/reasoning/reasoning';

describe('foldWorkflowStage', () => {
  test('dispatches every stage value', () => {
    const results = WORKFLOW_STAGE_VALUES.map((stage) =>
      foldWorkflowStage(stage, {
        preparation: () => 'preparation',
        resolution: () => 'resolution',
        execution: () => 'execution',
        evidence: () => 'evidence',
        proposal: () => 'proposal',
        projection: () => 'projection',
      }),
    );
    expect(results).toEqual([...WORKFLOW_STAGE_VALUES]);
  });

  test('WORKFLOW_STAGE_VALUES is a 6-element closed set', () => {
    expect(WORKFLOW_STAGE_VALUES).toHaveLength(6);
    expect(new Set(WORKFLOW_STAGE_VALUES).size).toBe(6);
  });
});

describe('foldWorkflowScope', () => {
  test('dispatches every scope value', () => {
    const results = WORKFLOW_SCOPE_VALUES.map((scope) =>
      foldWorkflowScope(scope, {
        scenario: () => 'scenario',
        step: () => 'step',
        run: () => 'run',
        suite: () => 'suite',
        workspace: () => 'workspace',
        control: () => 'control',
        hypothesis: () => 'hypothesis',
        compilation: () => 'compilation',
      }),
    );
    expect(results).toEqual([...WORKFLOW_SCOPE_VALUES]);
  });

  test('WORKFLOW_SCOPE_VALUES is an 8-element closed set', () => {
    expect(WORKFLOW_SCOPE_VALUES).toHaveLength(8);
    expect(new Set(WORKFLOW_SCOPE_VALUES).size).toBe(8);
  });
});

describe('foldWorkflowLane', () => {
  test('dispatches every lane value', () => {
    const results = WORKFLOW_LANE_VALUES.map((lane) =>
      foldWorkflowLane(lane, {
        intent: () => 'intent',
        knowledge: () => 'knowledge',
        control: () => 'control',
        resolution: () => 'resolution',
        execution: () => 'execution',
        governance: () => 'governance',
        projection: () => 'projection',
      }),
    );
    expect(results).toEqual([...WORKFLOW_LANE_VALUES]);
  });

  test('WORKFLOW_LANE_VALUES is a 7-element closed set', () => {
    expect(WORKFLOW_LANE_VALUES).toHaveLength(7);
    expect(new Set(WORKFLOW_LANE_VALUES).size).toBe(7);
  });
});

describe('foldResolutionMode', () => {
  test('dispatches every mode value', () => {
    const results = RESOLUTION_MODE_VALUES.map((mode) =>
      foldResolutionMode(mode, {
        deterministic: () => 'deterministic',
        translation: () => 'translation',
        agentic: () => 'agentic',
      }),
    );
    expect(results).toEqual([...RESOLUTION_MODE_VALUES]);
  });

  test('RESOLUTION_MODE_VALUES is a 3-element closed set', () => {
    expect(RESOLUTION_MODE_VALUES).toHaveLength(3);
    expect(new Set(RESOLUTION_MODE_VALUES).size).toBe(3);
  });
});

describe('foldReasoningOp', () => {
  test('dispatches every op value', () => {
    const results: readonly ReasoningOp[] = REASONING_OP_VALUES.map((op) =>
      foldReasoningOp(op, {
        select: () => 'select' as const,
        interpret: () => 'interpret' as const,
        synthesize: () => 'synthesize' as const,
      }),
    );
    expect(results).toEqual([...REASONING_OP_VALUES]);
  });

  test('REASONING_OP_VALUES is a 3-element closed set', () => {
    expect(REASONING_OP_VALUES).toHaveLength(3);
    expect(new Set(REASONING_OP_VALUES).size).toBe(3);
  });
});

// ─── W2.1.2 — sweep of remaining workflow-types unions ───────

import {
  CERTIFICATION_STATUS_VALUES,
  STEP_PROVENANCE_KIND_VALUES,
  SCENARIO_STATUS_VALUES,
  STEP_ACTION_VALUES,
  DIAGNOSTIC_SEVERITY_VALUES,
  RUNTIME_INTERPRETER_MODE_VALUES,
  EXECUTION_PROFILE_VALUES,
  WRITE_MODE_VALUES,
  PATTERN_ACTION_NAME_VALUES,
  SCENARIO_LIFECYCLE_VALUES,
  STEP_BINDING_KIND_VALUES,
  EFFECT_STATE_VALUES,
  SURFACE_KIND_VALUES,
  ASSERTION_KIND_VALUES,
  CAPABILITY_NAME_VALUES,
  EFFECT_TARGET_KIND_VALUES,
  LOCATOR_STRATEGY_KIND_VALUES,
  foldCertificationStatus,
  foldStepProvenanceKind,
  foldScenarioStatus,
  foldStepAction,
  foldDiagnosticSeverity,
  foldRuntimeInterpreterMode,
  foldExecutionProfile,
  foldWriteMode,
  foldPatternActionName,
  foldScenarioLifecycle,
  foldStepBindingKind,
  foldEffectState,
  foldSurfaceKind,
  foldAssertionKind,
  foldCapabilityName,
  foldEffectTargetKind,
  foldLocatorStrategyKind,
} from '../../product/domain/governance/workflow-folds';

describe('W2.1.2 — workflow-types union sweep', () => {
  test('every *_VALUES array has the expected closed-set size', () => {
    expect(CERTIFICATION_STATUS_VALUES).toHaveLength(2);
    expect(STEP_PROVENANCE_KIND_VALUES).toHaveLength(5);
    expect(SCENARIO_STATUS_VALUES).toHaveLength(6);
    expect(STEP_ACTION_VALUES).toHaveLength(5);
    expect(DIAGNOSTIC_SEVERITY_VALUES).toHaveLength(3);
    expect(RUNTIME_INTERPRETER_MODE_VALUES).toHaveLength(3);
    expect(EXECUTION_PROFILE_VALUES).toHaveLength(3);
    expect(WRITE_MODE_VALUES).toHaveLength(2);
    expect(PATTERN_ACTION_NAME_VALUES).toHaveLength(4);
    expect(SCENARIO_LIFECYCLE_VALUES).toHaveLength(4);
    expect(STEP_BINDING_KIND_VALUES).toHaveLength(3);
    expect(EFFECT_STATE_VALUES).toHaveLength(6);
    expect(SURFACE_KIND_VALUES).toHaveLength(8);
    expect(ASSERTION_KIND_VALUES).toHaveLength(2);
    expect(CAPABILITY_NAME_VALUES).toHaveLength(6);
    expect(EFFECT_TARGET_KIND_VALUES).toHaveLength(3);
    expect(LOCATOR_STRATEGY_KIND_VALUES).toHaveLength(6);
  });

  test('every fold dispatches every value of its union', () => {
    // Each fold returns the input value back; verifies dispatch.
    const cases = [
      {
        values: CERTIFICATION_STATUS_VALUES,
        fold: (v: typeof CERTIFICATION_STATUS_VALUES[number]) =>
          foldCertificationStatus(v, {
            uncertified: () => 'uncertified',
            certified: () => 'certified',
          }),
      },
      {
        values: STEP_PROVENANCE_KIND_VALUES,
        fold: (v: typeof STEP_PROVENANCE_KIND_VALUES[number]) =>
          foldStepProvenanceKind(v, {
            explicit: () => 'explicit',
            approvedKnowledge: () => 'approved-knowledge',
            liveExploration: () => 'live-exploration',
            agentInterpreted: () => 'agent-interpreted',
            unresolved: () => 'unresolved',
          }),
      },
      {
        values: SCENARIO_STATUS_VALUES,
        fold: (v: typeof SCENARIO_STATUS_VALUES[number]) =>
          foldScenarioStatus(v, {
            stub: () => 'stub',
            draft: () => 'draft',
            active: () => 'active',
            needsRepair: () => 'needs-repair',
            blocked: () => 'blocked',
            deprecated: () => 'deprecated',
          }),
      },
      {
        values: STEP_ACTION_VALUES,
        fold: (v: typeof STEP_ACTION_VALUES[number]) =>
          foldStepAction(v, {
            navigate: () => 'navigate',
            input: () => 'input',
            click: () => 'click',
            assertSnapshot: () => 'assert-snapshot',
            custom: () => 'custom',
          }),
      },
      {
        values: DIAGNOSTIC_SEVERITY_VALUES,
        fold: (v: typeof DIAGNOSTIC_SEVERITY_VALUES[number]) =>
          foldDiagnosticSeverity(v, {
            info: () => 'info',
            warn: () => 'warn',
            error: () => 'error',
          }),
      },
      {
        values: RUNTIME_INTERPRETER_MODE_VALUES,
        fold: (v: typeof RUNTIME_INTERPRETER_MODE_VALUES[number]) =>
          foldRuntimeInterpreterMode(v, {
            playwright: () => 'playwright',
            dryRun: () => 'dry-run',
            diagnostic: () => 'diagnostic',
          }),
      },
      {
        values: EXECUTION_PROFILE_VALUES,
        fold: (v: typeof EXECUTION_PROFILE_VALUES[number]) =>
          foldExecutionProfile(v, {
            interactive: () => 'interactive',
            ciBatch: () => 'ci-batch',
            dogfood: () => 'dogfood',
          }),
      },
      {
        values: WRITE_MODE_VALUES,
        fold: (v: typeof WRITE_MODE_VALUES[number]) =>
          foldWriteMode(v, {
            persist: () => 'persist',
            noWrite: () => 'no-write',
          }),
      },
      {
        values: PATTERN_ACTION_NAME_VALUES,
        fold: (v: typeof PATTERN_ACTION_NAME_VALUES[number]) =>
          foldPatternActionName(v, {
            navigate: () => 'navigate',
            input: () => 'input',
            click: () => 'click',
            assertSnapshot: () => 'assert-snapshot',
          }),
      },
      {
        values: SCENARIO_LIFECYCLE_VALUES,
        fold: (v: typeof SCENARIO_LIFECYCLE_VALUES[number]) =>
          foldScenarioLifecycle(v, {
            normal: () => 'normal',
            fixme: () => 'fixme',
            skip: () => 'skip',
            fail: () => 'fail',
          }),
      },
      {
        values: STEP_BINDING_KIND_VALUES,
        fold: (v: typeof STEP_BINDING_KIND_VALUES[number]) =>
          foldStepBindingKind(v, {
            bound: () => 'bound',
            deferred: () => 'deferred',
            unbound: () => 'unbound',
          }),
      },
      {
        values: EFFECT_STATE_VALUES,
        fold: (v: typeof EFFECT_STATE_VALUES[number]) =>
          foldEffectState(v, {
            validationError: () => 'validation-error',
            requiredError: () => 'required-error',
            disabled: () => 'disabled',
            enabled: () => 'enabled',
            visible: () => 'visible',
            hidden: () => 'hidden',
          }),
      },
      {
        values: SURFACE_KIND_VALUES,
        fold: (v: typeof SURFACE_KIND_VALUES[number]) =>
          foldSurfaceKind(v, {
            screenRoot: () => 'screen-root',
            form: () => 'form',
            actionCluster: () => 'action-cluster',
            validationRegion: () => 'validation-region',
            resultSet: () => 'result-set',
            detailsPane: () => 'details-pane',
            modal: () => 'modal',
            sectionRoot: () => 'section-root',
          }),
      },
      {
        values: ASSERTION_KIND_VALUES,
        fold: (v: typeof ASSERTION_KIND_VALUES[number]) =>
          foldAssertionKind(v, { state: () => 'state', structure: () => 'structure' }),
      },
      {
        values: CAPABILITY_NAME_VALUES,
        fold: (v: typeof CAPABILITY_NAME_VALUES[number]) =>
          foldCapabilityName(v, {
            navigate: () => 'navigate',
            enter: () => 'enter',
            invoke: () => 'invoke',
            observeStructure: () => 'observe-structure',
            observeState: () => 'observe-state',
            customEscapeHatch: () => 'custom-escape-hatch',
          }),
      },
      {
        values: EFFECT_TARGET_KIND_VALUES,
        fold: (v: typeof EFFECT_TARGET_KIND_VALUES[number]) =>
          foldEffectTargetKind(v, {
            self: () => 'self',
            element: () => 'element',
            surface: () => 'surface',
          }),
      },
      {
        values: LOCATOR_STRATEGY_KIND_VALUES,
        fold: (v: typeof LOCATOR_STRATEGY_KIND_VALUES[number]) =>
          foldLocatorStrategyKind(v, {
            role: () => 'role',
            label: () => 'label',
            placeholder: () => 'placeholder',
            text: () => 'text',
            testId: () => 'test-id',
            css: () => 'css',
          }),
      },
    ];
    for (const { values, fold } of cases) {
      const results = values.map(fold as (v: string) => string);
      expect(results).toEqual([...values]);
    }
  });
});
