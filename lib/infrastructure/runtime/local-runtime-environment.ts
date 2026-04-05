import type { RuntimeScenarioMode } from '../../application/ports';
import type { ScreenId } from '../../domain/kernel/identity';
import type { ScreenRegistry, SnapshotTemplateLoader } from '../../domain/commitment/runtime-loaders';
import type { ExecutionPosture } from '../../domain/governance/workflow-types';
import type { RuntimeDomResolver, TranslationReceipt, TranslationRequest } from '../../domain/resolution/types';
import type { RecoveryPolicy } from '../../domain/commitment/recovery-policy';
import type { AgentInterpreterPort } from '../../domain/resolution/model';
import { createLocalScreenRegistryLoader } from '../screen-registry/local-screen-registry-loader';
import { createLocalSnapshotTemplateLoader } from '../snapshots/local-snapshot-template-loader';

export type LocalRuntimeAgentInterpreter = AgentInterpreterPort;

export interface LocalRuntimeEnvironment {
  mode: RuntimeScenarioMode;
  provider: string;
  posture?: ExecutionPosture | undefined;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
  translator?: ((request: TranslationRequest) => Promise<TranslationReceipt>) | undefined;
  agentInterpreter?: LocalRuntimeAgentInterpreter | undefined;
  fixtures: Record<string, unknown>;
  screens: ScreenRegistry;
  snapshotLoader: SnapshotTemplateLoader;
  domResolver?: RuntimeDomResolver | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
}

export function createLocalRuntimeEnvironment(input: {
  rootDir: string;
  suiteRoot?: string | undefined;
  screenIds: readonly ScreenId[];
  fixtures: Record<string, unknown>;
  mode: RuntimeScenarioMode;
  provider: string;
  posture?: ExecutionPosture | undefined;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
  translator?: ((request: TranslationRequest) => Promise<TranslationReceipt>) | undefined;
  agentInterpreter?: LocalRuntimeAgentInterpreter | undefined;
  domResolver?: RuntimeDomResolver | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
}): LocalRuntimeEnvironment {
  const screenLoader = createLocalScreenRegistryLoader(input.suiteRoot ?? input.rootDir);
  return {
    mode: input.mode,
    provider: input.provider,
    posture: input.posture,
    controlSelection: input.controlSelection,
    translator: input.translator,
    agentInterpreter: input.agentInterpreter,
    fixtures: input.fixtures,
    domResolver: input.domResolver,
    recoveryPolicy: input.recoveryPolicy,
    screens: screenLoader.loadScreenRegistry(input.screenIds),
    snapshotLoader: createLocalSnapshotTemplateLoader(input.suiteRoot ?? input.rootDir),
  };
}
