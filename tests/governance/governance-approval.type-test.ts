import { Effect } from 'effect';
import { emitApprovedScenarioArtifacts } from '../../product/application/commitment/emit';
import { executeApprovedInterventionAction, type InterventionKernel } from '../../workshop/policy/intervention-kernel';
import type { ProjectPaths } from '../../product/application/paths';
import type { ProposalBundle, RunRecord } from '../../product/domain/execution/types';
import type { InterventionCommandAction, InterventionReceipt } from '../../product/domain/handshake/intervention';
import type { BoundScenario } from '../../product/domain/intent/types';
import type { ScenarioProjectionInput } from '../../product/domain/projection/types';
import type { ScenarioInterpretationSurface } from '../../product/domain/resolution/types';
import type { Approved } from '../../product/domain/governance/workflow-types';

const kernel: InterventionKernel = {
  executeAction: () => Effect.succeed({ summary: 'ok' }),
};
const paths = {} as ProjectPaths;
const approvedAction = {} as Approved<InterventionCommandAction>;
const dependencyReceipts = [] as readonly InterventionReceipt[];

executeApprovedInterventionAction({
  kernel,
  action: approvedAction,
  paths,
  dependencyReceipts,
});

emitApprovedScenarioArtifacts({
  paths,
  boundScenario: {} as Approved<BoundScenario>,
  surface: {} as ScenarioInterpretationSurface,
  latestRun: null as RunRecord | null,
  proposalBundle: null as ProposalBundle | null,
  inboxItems: [],
  projectionInput: {} as ScenarioProjectionInput,
});

const unapprovedAction: InterventionCommandAction = {
  actionId: 'a1',
  kind: 'approve-proposal',
  summary: 'needs review',
  governance: 'review-required',
  target: { kind: 'proposal', ref: 'p1', label: 'p1' },
  prerequisites: [],
  reversible: { reversible: false, rollbackCommand: null, rollbackRef: null },
  payload: {},
};

// @ts-expect-error executable action requires Approved<InterventionCommandAction>
executeApprovedInterventionAction({ kernel, action: unapprovedAction, paths, dependencyReceipts: [] });

// @ts-expect-error executable emit boundary requires Approved<BoundScenario>
const unapprovedBoundScenario: Approved<BoundScenario> = {} as BoundScenario;

emitApprovedScenarioArtifacts({
  paths,
  boundScenario: unapprovedBoundScenario,
  surface: {} as ScenarioInterpretationSurface,
  latestRun: null as RunRecord | null,
  proposalBundle: null as ProposalBundle | null,
  inboxItems: [],
  projectionInput: {} as ScenarioProjectionInput,
});
