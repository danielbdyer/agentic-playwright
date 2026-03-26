import type { RuntimeScenarioMode } from '../../application/ports';
import type { ScreenId } from '../../domain/identity';
import type { ScreenRegistry, SnapshotTemplateLoader } from '../../domain/runtime-loaders';
import type { ExecutionPosture, RuntimeDomResolver, TranslationRequest, TranslationReceipt } from '../../domain/types';
import type { RecoveryPolicy } from '../../domain/execution/recovery-policy';
import { createLocalScreenRegistryLoader } from '../screen-registry/local-screen-registry-loader';
import { createLocalSnapshotTemplateLoader } from '../snapshots/local-snapshot-template-loader';

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
    fixtures: input.fixtures,
    domResolver: input.domResolver,
    recoveryPolicy: input.recoveryPolicy,
    screens: screenLoader.loadScreenRegistry(input.screenIds),
    snapshotLoader: createLocalSnapshotTemplateLoader(input.suiteRoot ?? input.rootDir),
  };
}
