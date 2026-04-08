/**
 * End-to-end: actor-chain coherence requires explicit drift
 * acknowledgement (Phase 1.6 invariant).
 *
 * Exercises the MCP `actorChainCoherenceProofObligation` reducer through
 * the real tool handler path by injecting synthetic inbox items and
 * observing the resulting obligation emitted from `get_convergence_proof`.
 *
 * Scenarios:
 *   A. Single-actor chain (depth 1) — coherence not required.
 *   B. Multi-actor chain with preserved semantic core → coherent.
 *   C. Multi-actor chain with detected-but-unacknowledged drift → NOT
 *      coherent (the Phase 1.6 invariant — was previously a tautology).
 *   D. Multi-actor chain with detected drift AND a `driftAcknowledgedBy`
 *      record → coherent.
 *
 * This test will fail if:
 *   - The `||` tautology in `actorChainCoherenceProofObligation` returns
 *   - `driftAcknowledgedBy` stops being required for coherence on drifted chains
 */

import { Effect } from 'effect';
import { expect, test } from '@playwright/test';
import {
  createDashboardMcpServer,
  type DashboardMcpServerOptions,
  type LoopStatus,
} from '../../lib/infrastructure/mcp/dashboard-mcp-server';

function mockOptions(
  artifacts: Readonly<Record<string, unknown>>,
  loopStatus: LoopStatus = { phase: 'idle' },
): DashboardMcpServerOptions {
  return {
    readArtifact: (path: string) => artifacts[path] ?? null,
    screenshotCache: { get: () => null },
    pendingDecisions: new Map(),
    broadcast: () => {},
    getLoopStatus: () => loopStatus,
  };
}

function callTool(options: DashboardMcpServerOptions, tool: string) {
  return Effect.runSync(createDashboardMcpServer(options).handleToolCall({
    tool,
    arguments: {},
  }));
}

/** Synthetic convergence proof with zero trials so we exercise the
 *  proof-obligation reducer path without needing a real proof file. */
const emptyConvergenceProof = {
  kind: 'convergence-proof',
  version: 1,
  runAt: '2026-04-07T00:00:00.000Z',
  pipelineVersion: 'e2e-drift-ack',
  verdict: {
    converges: true,
    convergenceRate: 1,
    plateauLevel: 0.8,
    bottleneckSummary: 'none',
  },
  trials: [],
};

function inboxItem(input: {
  id: string;
  handoffChain: {
    depth: number;
    previousSemanticToken?: string | null;
    semanticCorePreserved: boolean;
    driftDetectable: boolean;
    competingCandidateCount: number;
    driftAcknowledgedBy?: { receiptId: string; resolution: string; acknowledgedAt: string } | null;
  };
}) {
  return {
    id: input.id,
    adoId: '10001',
    status: 'actionable',
    requestedParticipation: 'approve',
    handoff: {
      unresolvedIntent: 'test',
      attemptedStrategies: [],
      evidenceSlice: { artifactPaths: [], summaries: ['s'] },
      blockageType: 'knowledge-gap',
      requestedParticipation: 'approve',
      blastRadius: 'review-bound',
      epistemicStatus: 'review-required',
      semanticCore: { token: `core-${input.id}`, summary: 'test', driftStatus: 'preserved' },
      staleness: { observedAt: '2026-04-07T00:00:00.000Z', status: 'fresh' },
      nextMoves: [{ action: 'inspect', rationale: 'test' }],
      competingCandidates: [],
      tokenImpact: { payloadSizeBytes: 100, estimatedReadTokens: 25 },
      chain: input.handoffChain,
    },
  };
}

// ─── A: single-actor chain has no coherence requirement ───────────

test('single-actor chain (depth 1) does not drag coherence down', () => {
  const artifacts = {
    '.tesseract/benchmarks/convergence-proof.json': emptyConvergenceProof,
    '.tesseract/inbox/index.json': {
      items: [
        inboxItem({
          id: 'single-1',
          handoffChain: {
            depth: 1,
            previousSemanticToken: null,
            semanticCorePreserved: true,
            driftDetectable: false,
            competingCandidateCount: 0,
          },
        }),
      ],
    },
  };
  const result = callTool(mockOptions(artifacts), 'get_convergence_proof') as any;
  expect(result.isError).toBeFalsy();
  const obligations = (result.result?.proofObligations ?? []) as Array<{ obligation: string; status: string; score: number }>;
  const actorChain = obligations.find((o) => o.obligation === 'actor-chain-coherence');
  expect(actorChain).toBeDefined();
  expect(actorChain!.status).toBe('healthy');
});

// ─── B: multi-actor chain with preserved semantic core → coherent ──

test('multi-actor chain with preserved semantic core is coherent', () => {
  const artifacts = {
    '.tesseract/benchmarks/convergence-proof.json': emptyConvergenceProof,
    '.tesseract/inbox/index.json': {
      items: [
        inboxItem({
          id: 'preserved-1',
          handoffChain: {
            depth: 2,
            previousSemanticToken: 'prev-token',
            semanticCorePreserved: true, // no drift
            driftDetectable: true,
            competingCandidateCount: 0,
          },
        }),
      ],
    },
  };
  const result = callTool(mockOptions(artifacts), 'get_convergence_proof') as any;
  const obligations = (result.result?.proofObligations ?? []) as Array<{ obligation: string; status: string; score: number }>;
  const actorChain = obligations.find((o) => o.obligation === 'actor-chain-coherence');
  expect(actorChain).toBeDefined();
  expect(actorChain!.status).toBe('healthy');
  expect(actorChain!.score).toBeGreaterThanOrEqual(0.7);
});

// ─── C: detected-but-UNACKNOWLEDGED drift → Phase 1.6 invariant ────

test('multi-actor chain with UNACKNOWLEDGED drift fails coherence (Phase 1.6)', () => {
  const artifacts = {
    '.tesseract/benchmarks/convergence-proof.json': emptyConvergenceProof,
    '.tesseract/inbox/index.json': {
      items: [
        inboxItem({
          id: 'unacked-drift',
          handoffChain: {
            depth: 2,
            previousSemanticToken: 'prev-token',
            semanticCorePreserved: false, // drift happened
            driftDetectable: true,
            competingCandidateCount: 0,
            driftAcknowledgedBy: null, // NOBODY acknowledged it
          },
        }),
      ],
    },
  };
  const result = callTool(mockOptions(artifacts), 'get_convergence_proof') as any;
  const obligations = (result.result?.proofObligations ?? []) as Array<{ obligation: string; status: string; score: number }>;
  const actorChain = obligations.find((o) => o.obligation === 'actor-chain-coherence');
  expect(actorChain).toBeDefined();
  // Before Phase 1.6 this was silently healthy due to `||` tautology.
  // After Phase 1.6, unacknowledged drift drags the score down.
  expect(actorChain!.status).not.toBe('healthy');
  expect(actorChain!.score).toBeLessThan(1);
});

// ─── D: detected drift WITH acknowledgement → coherent again ───────

test('multi-actor chain with ACKNOWLEDGED drift is coherent', () => {
  const artifacts = {
    '.tesseract/benchmarks/convergence-proof.json': emptyConvergenceProof,
    '.tesseract/inbox/index.json': {
      items: [
        inboxItem({
          id: 'acked-drift',
          handoffChain: {
            depth: 2,
            previousSemanticToken: 'prev-token',
            semanticCorePreserved: false, // drift happened
            driftDetectable: true,
            competingCandidateCount: 0,
            driftAcknowledgedBy: {
              receiptId: 'ack-receipt-1',
              resolution: 'accepted',
              acknowledgedAt: '2026-04-07T00:00:00.000Z',
            },
          },
        }),
      ],
    },
  };
  const result = callTool(mockOptions(artifacts), 'get_convergence_proof') as any;
  const obligations = (result.result?.proofObligations ?? []) as Array<{ obligation: string; status: string; score: number }>;
  const actorChain = obligations.find((o) => o.obligation === 'actor-chain-coherence');
  expect(actorChain).toBeDefined();
  // Acknowledged drift rehabilitates coherence
  expect(actorChain!.status).toBe('healthy');
});

// ─── Sanity: the unacked case strictly dominates the acked case ────

test('acknowledged drift scores strictly better than unacknowledged drift', () => {
  const base = (ack: boolean) => ({
    '.tesseract/benchmarks/convergence-proof.json': emptyConvergenceProof,
    '.tesseract/inbox/index.json': {
      items: [
        inboxItem({
          id: ack ? 'acked' : 'unacked',
          handoffChain: {
            depth: 2,
            previousSemanticToken: 'prev',
            semanticCorePreserved: false,
            driftDetectable: true,
            competingCandidateCount: 0,
            driftAcknowledgedBy: ack
              ? { receiptId: 'ack', resolution: 'accepted', acknowledgedAt: '2026-04-07T00:00:00.000Z' }
              : null,
          },
        }),
      ],
    },
  });
  const acked = callTool(mockOptions(base(true)), 'get_convergence_proof') as any;
  const unacked = callTool(mockOptions(base(false)), 'get_convergence_proof') as any;
  const ackedActor = ((acked.result?.proofObligations ?? []) as any[]).find(
    (o) => o.obligation === 'actor-chain-coherence',
  );
  const unackedActor = ((unacked.result?.proofObligations ?? []) as any[]).find(
    (o) => o.obligation === 'actor-chain-coherence',
  );
  expect(ackedActor.score).toBeGreaterThan(unackedActor.score);
});
