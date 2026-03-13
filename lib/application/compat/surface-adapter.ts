import type { InterfaceResolutionContext, ScenarioInterpretationSurface, ScenarioTaskPacket } from '../../domain/types';

export function surfaceFromTaskPacket(
  packet: ScenarioTaskPacket,
  resolutionContext: InterfaceResolutionContext,
): ScenarioInterpretationSurface {
  return {
    kind: 'scenario-interpretation-surface',
    version: 1,
    stage: packet.stage,
    scope: packet.scope,
    ids: packet.ids,
    fingerprints: packet.fingerprints,
    lineage: packet.lineage,
    governance: packet.governance,
    payload: {
      ...packet.payload,
      resolutionContext,
    },
    surfaceFingerprint: packet.taskFingerprint,
  };
}

export function taskPacketFromSurface(
  surface: ScenarioInterpretationSurface,
): ScenarioTaskPacket {
  return {
    kind: 'scenario-task-packet',
    version: 5,
    stage: surface.stage,
    scope: surface.scope,
    ids: surface.ids,
    fingerprints: surface.fingerprints,
    lineage: surface.lineage,
    governance: surface.governance,
    payload: {
      adoId: surface.payload.adoId,
      revision: surface.payload.revision,
      title: surface.payload.title,
      suite: surface.payload.suite,
      knowledgeFingerprint: surface.payload.knowledgeFingerprint,
      interface: surface.payload.interface,
      selectors: surface.payload.selectors,
      stateGraph: surface.payload.stateGraph,
      knowledgeSlice: surface.payload.knowledgeSlice,
      steps: surface.payload.steps.map((step) => ({
        ...step,
        taskFingerprint: step.taskFingerprint ?? step.stepFingerprint,
      })),
    },
    taskFingerprint: surface.surfaceFingerprint,
  };
}
