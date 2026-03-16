import type {
  BoundScenario,
  DatasetControl,
  EvidenceRecord,
  PatternDocument,
  ResolutionControl,
  RunbookControl,
  Scenario,
  ScenarioInterpretationSurface,
  ApplicationInterfaceGraph,
  SelectorCanon,
  ScreenElements,
  ScreenHints,
  StateTransitionGraph,
  TrustPolicy,
} from '../../domain/types';
import type { ArtifactEnvelope, WorkspaceCatalog } from './types';

export interface ResolutionReadModel {
  screenElements: ArtifactEnvelope<ScreenElements>[];
  screenHints: ArtifactEnvelope<ScreenHints>[];
  patternDocuments: ArtifactEnvelope<PatternDocument>[];
  evidenceRecords: ArtifactEnvelope<EvidenceRecord>[];
}

export interface ControlReadModel {
  runbooks: ArtifactEnvelope<RunbookControl>[];
  datasets: ArtifactEnvelope<DatasetControl>[];
  resolutionControls: ArtifactEnvelope<ResolutionControl>[];
}

export interface ProposalReadModel extends ControlReadModel {
  trustPolicy: ArtifactEnvelope<TrustPolicy>;
  evidenceRecords: ArtifactEnvelope<EvidenceRecord>[];
}

export interface EmissionReadModel {
  scenarios: ArtifactEnvelope<Scenario>[];
  boundScenarios: ArtifactEnvelope<BoundScenario>[];
  interpretationSurfaces: ArtifactEnvelope<ScenarioInterpretationSurface>[];
  interfaceGraph: ArtifactEnvelope<ApplicationInterfaceGraph> | null;
  selectorCanon: ArtifactEnvelope<SelectorCanon> | null;
  stateGraph: ArtifactEnvelope<StateTransitionGraph> | null;
}

export function toResolutionReadModel(catalog: WorkspaceCatalog): ResolutionReadModel {
  return {
    screenElements: catalog.screenElements,
    screenHints: catalog.screenHints,
    patternDocuments: catalog.patternDocuments,
    evidenceRecords: catalog.evidenceRecords,
  };
}

export function toControlReadModel(catalog: WorkspaceCatalog): ControlReadModel {
  return {
    runbooks: catalog.runbooks,
    datasets: catalog.datasets,
    resolutionControls: catalog.resolutionControls,
  };
}

export function toProposalReadModel(catalog: WorkspaceCatalog): ProposalReadModel {
  return {
    runbooks: catalog.runbooks,
    datasets: catalog.datasets,
    resolutionControls: catalog.resolutionControls,
    trustPolicy: catalog.trustPolicy,
    evidenceRecords: catalog.evidenceRecords,
  };
}

export function toEmissionReadModel(catalog: WorkspaceCatalog): EmissionReadModel {
  return {
    scenarios: catalog.scenarios,
    boundScenarios: catalog.boundScenarios,
    interpretationSurfaces: catalog.interpretationSurfaces,
    interfaceGraph: catalog.interfaceGraph,
    selectorCanon: catalog.selectorCanon,
    stateGraph: catalog.stateGraph,
  };
}
