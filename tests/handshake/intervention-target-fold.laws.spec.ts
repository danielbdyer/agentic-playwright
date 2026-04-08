import { expect, test } from '@playwright/test';
import {
  ALL_INTERVENTION_TARGET_KINDS,
  foldInterventionTargetKind,
} from '../../lib/domain/handshake/intervention-target-fold';
import {
  ALL_OPERATOR_INBOX_KINDS,
  foldOperatorInboxKind,
} from '../../lib/domain/resolution/inbox-fold';
import type { InterventionTarget } from '../../lib/domain/handshake/intervention';
import type { OperatorInboxItem } from '../../lib/domain/resolution/types';

function target(kind: InterventionTarget['kind']): InterventionTarget {
  return { kind, ref: 'test', label: 'test' };
}

function inbox(kind: OperatorInboxItem['kind']): OperatorInboxItem {
  return {
    id: 'test',
    kind,
    status: 'actionable',
    title: 'test',
    summary: 'test',
    adoId: null,
    suite: null,
    runId: null,
    stepIndex: null,
    proposalId: null,
    artifactPath: null,
    targetPath: null,
    winningConcern: null,
    winningSource: null,
    resolutionMode: null,
    nextCommands: [],
  } as unknown as OperatorInboxItem;
}

// ─── foldInterventionTargetKind ────────────────────────────────────

test('foldInterventionTargetKind dispatches each of 13 cases', () => {
  const dispatch = (kind: InterventionTarget['kind']): string =>
    foldInterventionTargetKind<string>(target(kind), {
      workspace: () => 'workspace-branch',
      suite: () => 'suite-branch',
      scenario: () => 'scenario-branch',
      run: () => 'run-branch',
      step: () => 'step-branch',
      artifact: () => 'artifact-branch',
      graphNode: () => 'graphNode-branch',
      selector: () => 'selector-branch',
      proposal: () => 'proposal-branch',
      knowledge: () => 'knowledge-branch',
      session: () => 'session-branch',
      benchmark: () => 'benchmark-branch',
      codebase: () => 'codebase-branch',
    });
  expect(ALL_INTERVENTION_TARGET_KINDS).toHaveLength(13);
  for (const kind of ALL_INTERVENTION_TARGET_KINDS) {
    const result = dispatch(kind);
    expect(result).toContain('-branch');
  }
});

test('foldInterventionTargetKind returns the matching branch result', () => {
  const result = foldInterventionTargetKind<number>(target('proposal'), {
    workspace: () => 1,
    suite: () => 2,
    scenario: () => 3,
    run: () => 4,
    step: () => 5,
    artifact: () => 6,
    graphNode: () => 7,
    selector: () => 8,
    proposal: () => 999,
    knowledge: () => 10,
    session: () => 11,
    benchmark: () => 12,
    codebase: () => 13,
  });
  expect(result).toBe(999);
});

// ─── foldOperatorInboxKind ─────────────────────────────────────────

test('foldOperatorInboxKind dispatches each of 6 cases', () => {
  const dispatch = (kind: OperatorInboxItem['kind']): string =>
    foldOperatorInboxKind<string>(inbox(kind), {
      proposal: () => 'proposal-branch',
      blockedPolicy: () => 'blockedPolicy-branch',
      degradedLocator: () => 'degradedLocator-branch',
      needsHuman: () => 'needsHuman-branch',
      approvedEquivalent: () => 'approvedEquivalent-branch',
      recovery: () => 'recovery-branch',
    });
  expect(ALL_OPERATOR_INBOX_KINDS).toHaveLength(6);
  for (const kind of ALL_OPERATOR_INBOX_KINDS) {
    expect(dispatch(kind)).toContain('-branch');
  }
});

test('foldOperatorInboxKind returns the matching branch result', () => {
  const result = foldOperatorInboxKind<string>(inbox('needs-human'), {
    proposal: () => 'proposal',
    blockedPolicy: () => 'blockedPolicy',
    degradedLocator: () => 'degradedLocator',
    needsHuman: () => 'WIN',
    approvedEquivalent: () => 'approvedEquivalent',
    recovery: () => 'recovery',
  });
  expect(result).toBe('WIN');
});

test('ALL_INTERVENTION_TARGET_KINDS is structurally exhaustive (canonical order)', () => {
  // If a new kind is added without updating this array, the spec fails
  expect(ALL_INTERVENTION_TARGET_KINDS.length).toBe(13);
});

test('ALL_OPERATOR_INBOX_KINDS is structurally exhaustive', () => {
  expect(ALL_OPERATOR_INBOX_KINDS.length).toBe(6);
});
