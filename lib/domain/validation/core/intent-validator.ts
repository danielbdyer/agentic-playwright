/**
 * Intent context validators: AdoSnapshot, Scenario, BoundScenario,
 * ScenarioInterpretationSurface, ScenarioTaskPacket.
 */
import * as schemaDecode from '../../schemas/decode';
import * as schemas from '../../schemas';
import { mintApproved } from '../../governance/workflow-types';
import type {
  AdoSnapshot,
  BoundScenario,
  Scenario,
  ScenarioInterpretationSurface,
  ScenarioTaskPacket,
} from '../../types';
import { computeAdoContentHash } from '../../kernel/hash';
import { createAdoId, createCanonicalTargetRef, createEventSignatureRef, createScreenId, createSelectorRef, createStateNodeRef, createTransitionRef, ensureSafeRelativePathLike } from '../../kernel/identity';
import {
  expectArray,
  expectEnum,
  expectId,
  expectNumber,
  expectOptionalId,
  expectOptionalString,
  expectRecord,
  expectString,
  expectStringArray,
} from '../primitives';
import {
  validateBoundStep,
  validateDiagnostic,
  validateInterfaceResolutionContext,
  validateStepTask,
  validateWorkflowEnvelopeHeader,
} from './shared';
import { validateSharedPatternsArtifact } from './knowledge-validator';

export function validateAdoSnapshotArtifact(value: unknown): AdoSnapshot {
  const validated = schemaDecode.decoderFor<AdoSnapshot>(schemas.AdoSnapshotSchema)(value);
  ensureSafeRelativePathLike(validated.suitePath, 'snapshot.suitePath');
  const computedHash = computeAdoContentHash(validated);
  return validated.contentHash === computedHash
    ? validated
    : { ...validated, contentHash: computedHash };
}

export const validateScenarioArtifact: (value: unknown) => Scenario =
  schemaDecode.decoderFor<Scenario>(schemas.ScenarioSchema);

export function validateBoundScenarioArtifact(value: unknown): BoundScenario {
  const scenario = validateScenarioArtifact(value);
  const raw = expectRecord(value, 'scenario');
  const steps = expectArray(raw.steps ?? [], 'steps').map((entry, index) => validateBoundStep(entry, `steps[${index}]`));
  const diagnostics = expectArray(raw.diagnostics ?? [], 'diagnostics').map((entry, index) =>
    validateDiagnostic(entry, `diagnostics[${index}]`),
  );
  const header = validateWorkflowEnvelopeHeader(raw, 'boundScenario', {
    stage: 'preparation',
    scope: 'scenario',
    governance: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'blocked' : 'approved',
    artifactFingerprint: scenario.source.content_hash,
    ids: {
      adoId: scenario.source.ado_id,
      suite: scenario.metadata.suite,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation'],
    },
  });
  return {
    ...scenario,
    ...header,
    kind: expectEnum(raw.kind, 'kind', ['bound-scenario'] as const),
    payload: {
      source: scenario.source,
      metadata: scenario.metadata,
      preconditions: scenario.preconditions,
      steps,
      postconditions: scenario.postconditions,
      diagnostics,
    },
    steps,
    diagnostics,
  };
}

export function validateScenarioInterpretationSurfaceArtifact(value: unknown): ScenarioInterpretationSurface {
  const surface = expectRecord(value, 'scenarioInterpretationSurface');
  const payloadRecord = surface.payload === undefined
    ? null
    : expectRecord(surface.payload, 'scenarioInterpretationSurface.payload');
  const header = validateWorkflowEnvelopeHeader(surface, 'scenarioInterpretationSurface', {
    stage: 'preparation',
    scope: 'scenario',
    governance: mintApproved(),
    artifactFingerprint: expectOptionalString(surface.surfaceFingerprint, 'scenarioInterpretationSurface.surfaceFingerprint') ?? 'scenario-interpretation-surface',
    ids: {
      adoId: expectOptionalId(surface.ids && typeof surface.ids === 'object' ? (surface.ids as Record<string, unknown>).adoId : undefined, 'scenarioInterpretationSurface.ids.adoId', createAdoId) ?? null,
      suite: expectOptionalString(surface.ids && typeof surface.ids === 'object' ? (surface.ids as Record<string, unknown>).suite : undefined, 'scenarioInterpretationSurface.ids.suite') ?? null,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation'],
    },
  });

  return {
    kind: expectEnum(surface.kind, 'scenarioInterpretationSurface.kind', ['scenario-interpretation-surface'] as const),
    ...header,
    version: 1,
    payload: (() => {
      const payload = expectRecord(payloadRecord, 'scenarioInterpretationSurface.payload');
      const adoId = expectId(payload.adoId, 'scenarioInterpretationSurface.payload.adoId', createAdoId);
      const revision = expectNumber(payload.revision, 'scenarioInterpretationSurface.payload.revision');
      const title = expectString(payload.title, 'scenarioInterpretationSurface.payload.title');
      const suite = ensureSafeRelativePathLike(expectString(payload.suite, 'scenarioInterpretationSurface.payload.suite'), 'scenarioInterpretationSurface.payload.suite');
      const knowledgeFingerprint = expectString(payload.knowledgeFingerprint, 'scenarioInterpretationSurface.payload.knowledgeFingerprint');
      const resolutionContext = validateInterfaceResolutionContext(payload.resolutionContext, 'scenarioInterpretationSurface.payload.resolutionContext', validateSharedPatternsArtifact) as ScenarioInterpretationSurface['payload']['resolutionContext'];
      return {
        adoId,
        revision,
        title,
        suite,
        knowledgeFingerprint,
        interface: (() => {
          const interfaceRecord = expectRecord(payload.interface, 'scenarioInterpretationSurface.payload.interface');
          return {
            fingerprint: expectOptionalString(interfaceRecord.fingerprint, 'scenarioInterpretationSurface.payload.interface.fingerprint') ?? null,
            artifactPath: expectOptionalString(interfaceRecord.artifactPath, 'scenarioInterpretationSurface.payload.interface.artifactPath') ?? null,
          };
        })(),
        selectors: (() => {
          const selectorRecord = expectRecord(payload.selectors, 'scenarioInterpretationSurface.payload.selectors');
          return {
            fingerprint: expectOptionalString(selectorRecord.fingerprint, 'scenarioInterpretationSurface.payload.selectors.fingerprint') ?? null,
            artifactPath: expectOptionalString(selectorRecord.artifactPath, 'scenarioInterpretationSurface.payload.selectors.artifactPath') ?? null,
          };
        })(),
        stateGraph: (() => {
          const stateGraphRecord = expectRecord(payload.stateGraph, 'scenarioInterpretationSurface.payload.stateGraph');
          return {
            fingerprint: expectOptionalString(stateGraphRecord.fingerprint, 'scenarioInterpretationSurface.payload.stateGraph.fingerprint') ?? null,
            artifactPath: expectOptionalString(stateGraphRecord.artifactPath, 'scenarioInterpretationSurface.payload.stateGraph.artifactPath') ?? null,
          };
        })(),
        knowledgeSlice: (() => {
          const slice = expectRecord(payload.knowledgeSlice ?? {
            routeRefs: [],
            routeVariantRefs: [],
            screenRefs: [],
            targetRefs: [],
            stateRefs: [],
            eventSignatureRefs: [],
            transitionRefs: [],
            evidenceRefs: [],
            controlRefs: [],
          }, 'scenarioInterpretationSurface.payload.knowledgeSlice');
          return {
            routeRefs: expectStringArray(slice.routeRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.routeRefs'),
            routeVariantRefs: expectStringArray(slice.routeVariantRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.routeVariantRefs'),
            screenRefs: expectArray(slice.screenRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.screenRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.screenRefs[${index}]`, createScreenId),
            ),
            targetRefs: expectArray(slice.targetRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.targetRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.targetRefs[${index}]`, createCanonicalTargetRef),
            ),
            stateRefs: expectArray(slice.stateRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.stateRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.stateRefs[${index}]`, createStateNodeRef),
            ),
            eventSignatureRefs: expectArray(slice.eventSignatureRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.eventSignatureRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.eventSignatureRefs[${index}]`, createEventSignatureRef),
            ),
            transitionRefs: expectArray(slice.transitionRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.transitionRefs').map((entry, index) =>
              expectId(entry, `scenarioInterpretationSurface.payload.knowledgeSlice.transitionRefs[${index}]`, createTransitionRef),
            ),
            evidenceRefs: expectStringArray(slice.evidenceRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.evidenceRefs'),
            controlRefs: expectStringArray(slice.controlRefs ?? [], 'scenarioInterpretationSurface.payload.knowledgeSlice.controlRefs'),
          };
        })(),
        steps: expectArray(payload.steps ?? [], 'scenarioInterpretationSurface.steps').map((entry, index) =>
          validateStepTask(entry, `scenarioInterpretationSurface.steps[${index}]`),
        ),
        resolutionContext,
      };
    })(),
    surfaceFingerprint: expectString(surface.surfaceFingerprint, 'scenarioInterpretationSurface.surfaceFingerprint'),
  };
}

export function validateScenarioTaskPacketArtifact(value: unknown): ScenarioTaskPacket {
  const packet = expectRecord(value, 'scenarioTaskPacket');
  const payloadRecord = packet.payload === undefined
    ? null
    : expectRecord(packet.payload, 'scenarioTaskPacket.payload');
  const header = validateWorkflowEnvelopeHeader(packet, 'scenarioTaskPacket', {
    stage: 'preparation',
    scope: 'scenario',
    governance: mintApproved(),
    artifactFingerprint: expectOptionalString(packet.taskFingerprint, 'scenarioTaskPacket.taskFingerprint') ?? 'scenario-task-packet',
    ids: {
      adoId: expectOptionalId(packet.ids && typeof packet.ids === 'object' ? (packet.ids as Record<string, unknown>).adoId : undefined, 'scenarioTaskPacket.ids.adoId', createAdoId) ?? null,
      suite: expectOptionalString(packet.ids && typeof packet.ids === 'object' ? (packet.ids as Record<string, unknown>).suite : undefined, 'scenarioTaskPacket.ids.suite') ?? null,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation'],
    },
  });
  return {
    kind: expectEnum(packet.kind, 'scenarioTaskPacket.kind', ['scenario-task-packet'] as const),
    ...header,
    version: 5,
    payload: (() => {
      const payload = expectRecord(payloadRecord, 'scenarioTaskPacket.payload');
      const adoId = expectId(payload.adoId, 'scenarioTaskPacket.payload.adoId', createAdoId);
      const revision = expectNumber(payload.revision, 'scenarioTaskPacket.payload.revision');
      const title = expectString(payload.title, 'scenarioTaskPacket.payload.title');
      const suite = ensureSafeRelativePathLike(expectString(payload.suite, 'scenarioTaskPacket.payload.suite'), 'scenarioTaskPacket.payload.suite');
      const knowledgeFingerprint = expectString(payload.knowledgeFingerprint, 'scenarioTaskPacket.payload.knowledgeFingerprint');
      return {
        adoId,
        revision,
        title,
        suite,
        knowledgeFingerprint,
        interface: (() => {
          const interfaceRecord = expectRecord(payload.interface, 'scenarioTaskPacket.payload.interface');
          return {
            fingerprint: expectOptionalString(interfaceRecord.fingerprint, 'scenarioTaskPacket.payload.interface.fingerprint') ?? null,
            artifactPath: expectOptionalString(interfaceRecord.artifactPath, 'scenarioTaskPacket.payload.interface.artifactPath') ?? null,
          };
        })(),
        selectors: (() => {
          const selectorRecord = expectRecord(payload.selectors, 'scenarioTaskPacket.payload.selectors');
          return {
            fingerprint: expectOptionalString(selectorRecord.fingerprint, 'scenarioTaskPacket.payload.selectors.fingerprint') ?? null,
            artifactPath: expectOptionalString(selectorRecord.artifactPath, 'scenarioTaskPacket.payload.selectors.artifactPath') ?? null,
          };
        })(),
        stateGraph: (() => {
          const stateGraphRecord = expectRecord(payload.stateGraph, 'scenarioTaskPacket.payload.stateGraph');
          return {
            fingerprint: expectOptionalString(stateGraphRecord.fingerprint, 'scenarioTaskPacket.payload.stateGraph.fingerprint') ?? null,
            artifactPath: expectOptionalString(stateGraphRecord.artifactPath, 'scenarioTaskPacket.payload.stateGraph.artifactPath') ?? null,
          };
        })(),
        knowledgeSlice: (() => {
          const slice = expectRecord(payload.knowledgeSlice ?? {
            routeRefs: [],
            routeVariantRefs: [],
            screenRefs: [],
            targetRefs: [],
            stateRefs: [],
            eventSignatureRefs: [],
            transitionRefs: [],
            evidenceRefs: [],
            controlRefs: [],
          }, 'scenarioTaskPacket.payload.knowledgeSlice');
          return {
            routeRefs: expectStringArray(slice.routeRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.routeRefs'),
            routeVariantRefs: expectStringArray(slice.routeVariantRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.routeVariantRefs'),
            screenRefs: expectArray(slice.screenRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.screenRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.screenRefs[${index}]`, createScreenId),
            ),
            targetRefs: expectArray(slice.targetRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.targetRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.targetRefs[${index}]`, createCanonicalTargetRef),
            ),
            stateRefs: expectArray(slice.stateRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.stateRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.stateRefs[${index}]`, createStateNodeRef),
            ),
            eventSignatureRefs: expectArray(slice.eventSignatureRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.eventSignatureRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.eventSignatureRefs[${index}]`, createEventSignatureRef),
            ),
            transitionRefs: expectArray(slice.transitionRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.transitionRefs').map((entry, index) =>
              expectId(entry, `scenarioTaskPacket.payload.knowledgeSlice.transitionRefs[${index}]`, createTransitionRef),
            ),
            evidenceRefs: expectStringArray(slice.evidenceRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.evidenceRefs'),
            controlRefs: expectStringArray(slice.controlRefs ?? [], 'scenarioTaskPacket.payload.knowledgeSlice.controlRefs'),
          };
        })(),
        steps: expectArray(payload.steps ?? [], 'scenarioTaskPacket.steps').map((entry, index) =>
          validateStepTask(entry, `scenarioTaskPacket.steps[${index}]`),
        ),
      };
    })(),
    taskFingerprint: expectString(packet.taskFingerprint, 'scenarioTaskPacket.taskFingerprint'),
  };
}
