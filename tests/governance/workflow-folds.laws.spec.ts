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
