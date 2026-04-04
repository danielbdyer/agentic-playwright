/**
 * Execution context validators: RunRecord, BenchmarkContext, ResolutionGraphRecord,
 * InterpretationDriftRecord, BenchmarkScorecard, BenchmarkImprovementProjection, DogfoodRun.
 */
import * as schemaDecode from '../../schemas/decode';
import * as schemas from '../../schemas';
import type { InterpretationDriftRecord, ResolutionGraphRecord, RunRecord } from '../../execution/types';
import type {
  BenchmarkContext,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  DogfoodRun,
} from '../../projection/types';
import type { StepResolutionGraph } from '../../resolution/types';
import { createAdoId, ensureSafeRelativePathLike } from '../../kernel/identity';
import {
  expectArray,
  expectBoolean,
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
  governanceStates,
  validateResolutionReceipt,
  validateStepExecutionReceipt,
  validateWorkflowEnvelopeHeader,
} from './shared';

export function validateRunRecordArtifact(value: unknown): RunRecord {
  const record = expectRecord(value, 'runRecord');
  const steps = expectArray(record.steps ?? [], 'runRecord.steps').map((entry, index) => {
    const step = expectRecord(entry, `runRecord.steps[${index}]`);
    return {
      stepIndex: expectNumber(step.stepIndex, `runRecord.steps[${index}].stepIndex`),
      interpretation: validateResolutionReceipt(step.interpretation, `runRecord.steps[${index}].interpretation`),
      execution: validateStepExecutionReceipt(step.execution, `runRecord.steps[${index}].execution`),
      evidenceIds: expectStringArray(step.evidenceIds ?? [], `runRecord.steps[${index}].evidenceIds`),
    };
  });
  const evidenceIds = expectStringArray(record.evidenceIds ?? [], 'runRecord.evidenceIds');
  const translationMetrics = (() => {
    const metrics = expectRecord(record.translationMetrics ?? {}, 'runRecord.translationMetrics');
    return {
      total: expectNumber(metrics.total ?? 0, 'runRecord.translationMetrics.total'),
      hits: expectNumber(metrics.hits ?? 0, 'runRecord.translationMetrics.hits'),
      misses: expectNumber(metrics.misses ?? 0, 'runRecord.translationMetrics.misses'),
      disabled: expectNumber(metrics.disabled ?? 0, 'runRecord.translationMetrics.disabled'),
      hitRate: expectNumber(metrics.hitRate ?? 0, 'runRecord.translationMetrics.hitRate'),
      missReasons: Object.fromEntries(Object.entries(expectRecord(metrics.missReasons ?? {}, 'runRecord.translationMetrics.missReasons')).map(([key, value]) => [key, expectNumber(value, `runRecord.translationMetrics.missReasons.${key}`)])),
      failureClasses: Object.fromEntries(Object.entries(expectRecord(metrics.failureClasses ?? {}, 'runRecord.translationMetrics.failureClasses')).map(([key, value]) => [key, expectNumber(value, `runRecord.translationMetrics.failureClasses.${key}`)])),
    };
  })();
  const executionMetrics = (() => {
    const metrics = expectRecord(record.executionMetrics ?? {}, 'runRecord.executionMetrics');
    const timingTotals = expectRecord(metrics.timingTotals ?? {}, 'runRecord.executionMetrics.timingTotals');
    const costTotals = expectRecord(metrics.costTotals ?? {}, 'runRecord.executionMetrics.costTotals');
    return {
      timingTotals: {
        setupMs: expectNumber(timingTotals.setupMs ?? 0, 'runRecord.executionMetrics.timingTotals.setupMs'),
        resolutionMs: expectNumber(timingTotals.resolutionMs ?? 0, 'runRecord.executionMetrics.timingTotals.resolutionMs'),
        actionMs: expectNumber(timingTotals.actionMs ?? 0, 'runRecord.executionMetrics.timingTotals.actionMs'),
        assertionMs: expectNumber(timingTotals.assertionMs ?? 0, 'runRecord.executionMetrics.timingTotals.assertionMs'),
        retriesMs: expectNumber(timingTotals.retriesMs ?? 0, 'runRecord.executionMetrics.timingTotals.retriesMs'),
        teardownMs: expectNumber(timingTotals.teardownMs ?? 0, 'runRecord.executionMetrics.timingTotals.teardownMs'),
        totalMs: expectNumber(timingTotals.totalMs ?? 0, 'runRecord.executionMetrics.timingTotals.totalMs'),
      },
      costTotals: {
        instructionCount: expectNumber(costTotals.instructionCount ?? 0, 'runRecord.executionMetrics.costTotals.instructionCount'),
        diagnosticCount: expectNumber(costTotals.diagnosticCount ?? 0, 'runRecord.executionMetrics.costTotals.diagnosticCount'),
      },
      budgetBreaches: expectNumber(metrics.budgetBreaches ?? 0, 'runRecord.executionMetrics.budgetBreaches'),
      failureFamilies: (() => {
        const families = expectRecord(metrics.failureFamilies ?? {}, 'runRecord.executionMetrics.failureFamilies');
        return {
          none: expectNumber(families.none ?? 0, 'runRecord.executionMetrics.failureFamilies.none'),
          'precondition-failure': expectNumber(families['precondition-failure'] ?? 0, 'runRecord.executionMetrics.failureFamilies.precondition-failure'),
          'locator-degradation-failure': expectNumber(families['locator-degradation-failure'] ?? 0, 'runRecord.executionMetrics.failureFamilies.locator-degradation-failure'),
          'environment-runtime-failure': expectNumber(families['environment-runtime-failure'] ?? 0, 'runRecord.executionMetrics.failureFamilies.environment-runtime-failure'),
        };
      })(),
      recoveryFamilies: (() => {
        const families = expectRecord(metrics.recoveryFamilies ?? {}, 'runRecord.executionMetrics.recoveryFamilies');
        return {
          'precondition-failure': expectNumber(families['precondition-failure'] ?? 0, 'runRecord.executionMetrics.recoveryFamilies.precondition-failure'),
          'locator-degradation-failure': expectNumber(families['locator-degradation-failure'] ?? 0, 'runRecord.executionMetrics.recoveryFamilies.locator-degradation-failure'),
          'environment-runtime-failure': expectNumber(families['environment-runtime-failure'] ?? 0, 'runRecord.executionMetrics.recoveryFamilies.environment-runtime-failure'),
        };
      })(),
      recoveryStrategies: (() => {
        const strategies = expectRecord(metrics.recoveryStrategies ?? {}, 'runRecord.executionMetrics.recoveryStrategies');
        return {
          'verify-prerequisites': expectNumber(strategies['verify-prerequisites'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.verify-prerequisites'),
          'execute-prerequisite-actions': expectNumber(strategies['execute-prerequisite-actions'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.execute-prerequisite-actions'),
          'force-alternate-locator-rungs': expectNumber(strategies['force-alternate-locator-rungs'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.force-alternate-locator-rungs'),
          'snapshot-guided-reresolution': expectNumber(strategies['snapshot-guided-reresolution'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.snapshot-guided-reresolution'),
          'bounded-retry-with-backoff': expectNumber(strategies['bounded-retry-with-backoff'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.bounded-retry-with-backoff'),
          'refresh-runtime': expectNumber(strategies['refresh-runtime'] ?? 0, 'runRecord.executionMetrics.recoveryStrategies.refresh-runtime'),
        };
      })(),
    };
  })();
  const header = validateWorkflowEnvelopeHeader(record, 'runRecord', {
    stage: 'execution',
    scope: 'run',
    governance: steps.some((step) => step.interpretation.kind === 'needs-human' || step.execution.execution.status === 'failed')
      ? 'blocked'
      : 'approved',
    artifactFingerprint: expectOptionalString(record.runId, 'runRecord.runId') ?? 'scenario-run-record',
    ids: {
      adoId: expectOptionalId(record.adoId, 'runRecord.adoId', createAdoId) ?? null,
      suite: expectOptionalString(record.suite, 'runRecord.suite') ?? null,
      runId: expectOptionalString(record.runId, 'runRecord.runId') ?? null,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence'],
    },
  });
  return {
    kind: expectEnum(record.kind, 'runRecord.kind', ['scenario-run-record'] as const),
    ...header,
    payload: {
      runId: expectString(record.runId, 'runRecord.runId'),
      adoId: expectId(record.adoId, 'runRecord.adoId', createAdoId),
      revision: expectNumber(record.revision, 'runRecord.revision'),
      title: expectString(record.title, 'runRecord.title'),
      suite: ensureSafeRelativePathLike(expectString(record.suite, 'runRecord.suite'), 'runRecord.suite'),
      taskFingerprint: expectString(record.taskFingerprint, 'runRecord.taskFingerprint'),
      knowledgeFingerprint: expectString(record.knowledgeFingerprint, 'runRecord.knowledgeFingerprint'),
      provider: expectString(record.provider, 'runRecord.provider'),
      mode: expectString(record.mode, 'runRecord.mode'),
      startedAt: expectString(record.startedAt, 'runRecord.startedAt'),
      completedAt: expectString(record.completedAt, 'runRecord.completedAt'),
      steps,
      evidenceIds,
      translationMetrics,
      executionMetrics,
    },
    runId: expectString(record.runId, 'runRecord.runId'),
    adoId: expectId(record.adoId, 'runRecord.adoId', createAdoId),
    revision: expectNumber(record.revision, 'runRecord.revision'),
    title: expectString(record.title, 'runRecord.title'),
    suite: ensureSafeRelativePathLike(expectString(record.suite, 'runRecord.suite'), 'runRecord.suite'),
    taskFingerprint: expectString(record.taskFingerprint, 'runRecord.taskFingerprint'),
    knowledgeFingerprint: expectString(record.knowledgeFingerprint, 'runRecord.knowledgeFingerprint'),
    provider: expectString(record.provider, 'runRecord.provider'),
    mode: expectString(record.mode, 'runRecord.mode'),
    startedAt: expectString(record.startedAt, 'runRecord.startedAt'),
    completedAt: expectString(record.completedAt, 'runRecord.completedAt'),
    steps,
    evidenceIds,
    translationMetrics,
    executionMetrics,
  };
}

export function validateBenchmarkContextArtifact(value: unknown): BenchmarkContext {
  const benchmark = expectRecord(value, 'benchmarkContext');
  return {
    kind: expectEnum(benchmark.kind, 'benchmarkContext.kind', ['benchmark-context'] as const),
    version: expectNumber(benchmark.version, 'benchmarkContext.version') as 1,
    name: expectString(benchmark.name, 'benchmarkContext.name'),
    suite: ensureSafeRelativePathLike(expectString(benchmark.suite, 'benchmarkContext.suite'), 'benchmarkContext.suite'),
    appRoute: expectString(benchmark.appRoute, 'benchmarkContext.appRoute'),
    fieldCatalog: expectArray(benchmark.fieldCatalog ?? [], 'benchmarkContext.fieldCatalog').map((entry, index) => {
      const field = expectRecord(entry, `benchmarkContext.fieldCatalog[${index}]`);
      return {
        id: expectString(field.id, `benchmarkContext.fieldCatalog[${index}].id`),
        screen: expectString(field.screen, `benchmarkContext.fieldCatalog[${index}].screen`),
        element: expectString(field.element, `benchmarkContext.fieldCatalog[${index}].element`),
        label: expectString(field.label, `benchmarkContext.fieldCatalog[${index}].label`),
        category: expectString(field.category, `benchmarkContext.fieldCatalog[${index}].category`),
        required: expectBoolean(field.required, `benchmarkContext.fieldCatalog[${index}].required`),
        postures: expectStringArray(field.postures ?? [], `benchmarkContext.fieldCatalog[${index}].postures`),
      };
    }),
    flows: expectArray(benchmark.flows ?? [], 'benchmarkContext.flows').map((entry, index) => {
      const flow = expectRecord(entry, `benchmarkContext.flows[${index}]`);
      return {
        id: expectString(flow.id, `benchmarkContext.flows[${index}].id`),
        title: expectString(flow.title, `benchmarkContext.flows[${index}].title`),
        route: expectString(flow.route, `benchmarkContext.flows[${index}].route`),
        screens: expectStringArray(flow.screens ?? [], `benchmarkContext.flows[${index}].screens`),
        fieldIds: expectStringArray(flow.fieldIds ?? [], `benchmarkContext.flows[${index}].fieldIds`),
      };
    }),
    driftEvents: expectArray(benchmark.driftEvents ?? [], 'benchmarkContext.driftEvents').map((entry, index) => {
      const event = expectRecord(entry, `benchmarkContext.driftEvents[${index}]`);
      return {
        id: expectString(event.id, `benchmarkContext.driftEvents[${index}].id`),
        kind: expectEnum(event.kind, `benchmarkContext.driftEvents[${index}].kind`, ['label-change', 'locator-degradation', 'widget-swap', 'validation-copy-change', 'section-structure-drift'] as const),
        screen: expectString(event.screen, `benchmarkContext.driftEvents[${index}].screen`),
        fieldId: expectOptionalString(event.fieldId, `benchmarkContext.driftEvents[${index}].fieldId`) ?? null,
        severity: expectEnum(event.severity, `benchmarkContext.driftEvents[${index}].severity`, ['low', 'medium', 'high'] as const),
        description: expectString(event.description, `benchmarkContext.driftEvents[${index}].description`),
      };
    }),
    fieldAwarenessThresholds: (() => {
      const thresholds = expectRecord(benchmark.fieldAwarenessThresholds ?? {}, 'benchmarkContext.fieldAwarenessThresholds');
      return {
        minFieldAwarenessCount: expectNumber(thresholds.minFieldAwarenessCount, 'benchmarkContext.fieldAwarenessThresholds.minFieldAwarenessCount'),
        minFirstPassScreenResolutionRate: expectNumber(thresholds.minFirstPassScreenResolutionRate, 'benchmarkContext.fieldAwarenessThresholds.minFirstPassScreenResolutionRate'),
        minFirstPassElementResolutionRate: expectNumber(thresholds.minFirstPassElementResolutionRate, 'benchmarkContext.fieldAwarenessThresholds.minFirstPassElementResolutionRate'),
        maxDegradedLocatorRate: expectNumber(thresholds.maxDegradedLocatorRate, 'benchmarkContext.fieldAwarenessThresholds.maxDegradedLocatorRate'),
      };
    })(),
    benchmarkRunbooks: expectArray(benchmark.benchmarkRunbooks ?? [], 'benchmarkContext.benchmarkRunbooks').map((entry, index) => {
      const runbook = expectRecord(entry, `benchmarkContext.benchmarkRunbooks[${index}]`);
      return {
        name: expectString(runbook.name, `benchmarkContext.benchmarkRunbooks[${index}].name`),
        runbook: expectString(runbook.runbook, `benchmarkContext.benchmarkRunbooks[${index}].runbook`),
        tag: expectOptionalString(runbook.tag, `benchmarkContext.benchmarkRunbooks[${index}].tag`) ?? null,
      };
    }),
    expansionRules: expectArray(benchmark.expansionRules ?? [], 'benchmarkContext.expansionRules').map((entry, index) => {
      const rule = expectRecord(entry, `benchmarkContext.expansionRules[${index}]`);
      return {
        fieldIds: expectStringArray(rule.fieldIds ?? [], `benchmarkContext.expansionRules[${index}].fieldIds`),
        postures: expectStringArray(rule.postures ?? [], `benchmarkContext.expansionRules[${index}].postures`),
        variantsPerField: expectNumber(rule.variantsPerField, `benchmarkContext.expansionRules[${index}].variantsPerField`),
      };
    }),
  };
}

export function validateResolutionGraphRecordArtifact(value: unknown): ResolutionGraphRecord {
  const record = expectRecord(value, 'resolutionGraphRecord');
  const header = validateWorkflowEnvelopeHeader(record, 'resolutionGraphRecord', {
    stage: 'resolution',
    scope: 'run',
    governance: expectEnum(record.governance ?? 'approved', 'resolutionGraphRecord.governance', governanceStates),
    artifactFingerprint: expectOptionalString(record.runId, 'resolutionGraphRecord.runId') ?? 'resolution-graph-record',
    ids: { runId: expectOptionalString(record.runId, 'resolutionGraphRecord.runId') ?? null, stepIndex: null },
    lineage: { sources: [], parents: [], handshakes: ['preparation', 'resolution'] },
  });
  const steps = expectArray(record.steps, 'resolutionGraphRecord.steps').map((entry, index) => {
    const step = expectRecord(entry, `resolutionGraphRecord.steps[${index}]`);
    return {
      stepIndex: expectNumber(step.stepIndex, `resolutionGraphRecord.steps[${index}].stepIndex`),
      graph: step.graph as StepResolutionGraph,
    };
  });
  return {
    ...header,
    kind: expectEnum(record.kind, 'resolutionGraphRecord.kind', ['resolution-graph-record'] as const),
    version: expectNumber(record.version, 'resolutionGraphRecord.version') as 1,
    stage: 'resolution',
    scope: 'run',
    governance: expectEnum(record.governance ?? 'approved', 'resolutionGraphRecord.governance', governanceStates),
    adoId: expectString(record.adoId, 'resolutionGraphRecord.adoId') as ResolutionGraphRecord['adoId'],
    runId: expectString(record.runId, 'resolutionGraphRecord.runId'),
    providerId: expectString(record.providerId, 'resolutionGraphRecord.providerId'),
    mode: expectString(record.mode, 'resolutionGraphRecord.mode'),
    generatedAt: expectString(record.generatedAt, 'resolutionGraphRecord.generatedAt'),
    steps,
  };
}

export function validateInterpretationDriftRecordArtifact(value: unknown): InterpretationDriftRecord {
  const record = expectRecord(value, 'interpretationDriftRecord');
  const steps = expectArray(record.steps ?? [], 'interpretationDriftRecord.steps').map((entry, index) => {
    const step = expectRecord(entry, `interpretationDriftRecord.steps[${index}]`);
    const changes = expectArray(step.changes ?? [], `interpretationDriftRecord.steps[${index}].changes`).map((changeEntry, changeIndex) => {
      const change = expectRecord(changeEntry, `interpretationDriftRecord.steps[${index}].changes[${changeIndex}]`);
      return {
        field: expectEnum(change.field, `interpretationDriftRecord.steps[${index}].changes[${changeIndex}].field`, ['winningSource', 'target', 'governance', 'confidence', 'exhaustion-path', 'resolution-graph'] as const),
        before: change.before,
        after: change.after,
      };
    });
    const before = expectRecord(step.before ?? {}, `interpretationDriftRecord.steps[${index}].before`);
    const after = expectRecord(step.after ?? {}, `interpretationDriftRecord.steps[${index}].after`);
    return {
      stepIndex: expectNumber(step.stepIndex, `interpretationDriftRecord.steps[${index}].stepIndex`),
      changed: expectBoolean(step.changed, `interpretationDriftRecord.steps[${index}].changed`),
      changes,
      before: {
        winningSource: expectString(before.winningSource ?? 'none', `interpretationDriftRecord.steps[${index}].before.winningSource`),
        target: expectString(before.target ?? 'none', `interpretationDriftRecord.steps[${index}].before.target`),
        governance: expectEnum(before.governance ?? 'approved', `interpretationDriftRecord.steps[${index}].before.governance`, governanceStates),
        confidence: expectString(before.confidence ?? 'unbound', `interpretationDriftRecord.steps[${index}].before.confidence`),
        exhaustionPath: expectStringArray(before.exhaustionPath ?? [], `interpretationDriftRecord.steps[${index}].before.exhaustionPath`),
        resolutionGraphDigest: expectString(before.resolutionGraphDigest ?? 'none', `interpretationDriftRecord.steps[${index}].before.resolutionGraphDigest`),
      },
      after: {
        winningSource: expectString(after.winningSource ?? 'none', `interpretationDriftRecord.steps[${index}].after.winningSource`),
        target: expectString(after.target ?? 'none', `interpretationDriftRecord.steps[${index}].after.target`),
        governance: expectEnum(after.governance ?? 'approved', `interpretationDriftRecord.steps[${index}].after.governance`, governanceStates),
        confidence: expectString(after.confidence ?? 'unbound', `interpretationDriftRecord.steps[${index}].after.confidence`),
        exhaustionPath: expectStringArray(after.exhaustionPath ?? [], `interpretationDriftRecord.steps[${index}].after.exhaustionPath`),
        resolutionGraphDigest: expectString(after.resolutionGraphDigest ?? 'none', `interpretationDriftRecord.steps[${index}].after.resolutionGraphDigest`),
      },
      resolutionGraphDrift: {
        traversalPathChanged: expectBoolean(expectRecord(step.resolutionGraphDrift ?? {}, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift`).traversalPathChanged ?? false, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift.traversalPathChanged`),
        winnerRungChanged: expectBoolean(expectRecord(step.resolutionGraphDrift ?? {}, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift`).winnerRungChanged ?? false, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift.winnerRungChanged`),
        winnerRationaleChanged: expectBoolean(expectRecord(step.resolutionGraphDrift ?? {}, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift`).winnerRationaleChanged ?? false, `interpretationDriftRecord.steps[${index}].resolutionGraphDrift.winnerRationaleChanged`),
      },
    };
  });
  const header = validateWorkflowEnvelopeHeader(record, 'interpretationDriftRecord', {
    stage: 'resolution',
    scope: 'run',
    governance: expectEnum(record.governance ?? 'approved', 'interpretationDriftRecord.governance', governanceStates),
    artifactFingerprint: expectOptionalString(record.runId, 'interpretationDriftRecord.runId') ?? 'interpretation-drift-record',
    ids: {
      adoId: expectOptionalId(record.adoId, 'interpretationDriftRecord.adoId', createAdoId) ?? null,
      runId: expectOptionalString(record.runId, 'interpretationDriftRecord.runId') ?? null,
      suite: null,
    },
    lineage: {
      sources: expectStringArray(expectRecord(record.lineage ?? {}, 'interpretationDriftRecord.lineage').sources ?? [], 'interpretationDriftRecord.lineage.sources'),
      parents: expectStringArray(expectRecord(record.lineage ?? {}, 'interpretationDriftRecord.lineage').parents ?? [], 'interpretationDriftRecord.lineage.parents'),
      handshakes: ['preparation', 'resolution'],
    },
  });
  const provenance = expectRecord(record.provenance ?? {}, 'interpretationDriftRecord.provenance');
  return {
    kind: expectEnum(record.kind, 'interpretationDriftRecord.kind', ['interpretation-drift-record'] as const),
    ...header,
    adoId: expectId(record.adoId, 'interpretationDriftRecord.adoId', createAdoId),
    runId: expectString(record.runId, 'interpretationDriftRecord.runId'),
    comparedRunId: expectOptionalString(record.comparedRunId, 'interpretationDriftRecord.comparedRunId') ?? null,
    providerId: expectString(record.providerId, 'interpretationDriftRecord.providerId'),
    mode: expectString(record.mode, 'interpretationDriftRecord.mode'),
    comparedAt: expectString(record.comparedAt, 'interpretationDriftRecord.comparedAt'),
    changedStepCount: expectNumber(record.changedStepCount, 'interpretationDriftRecord.changedStepCount'),
    unchangedStepCount: expectNumber(record.unchangedStepCount, 'interpretationDriftRecord.unchangedStepCount'),
    totalStepCount: expectNumber(record.totalStepCount, 'interpretationDriftRecord.totalStepCount'),
    hasDrift: expectBoolean(record.hasDrift, 'interpretationDriftRecord.hasDrift'),
    provenance: {
      taskFingerprint: expectString(provenance.taskFingerprint, 'interpretationDriftRecord.provenance.taskFingerprint'),
      knowledgeFingerprint: expectString(provenance.knowledgeFingerprint, 'interpretationDriftRecord.provenance.knowledgeFingerprint'),
      controlsFingerprint: expectOptionalString(provenance.controlsFingerprint, 'interpretationDriftRecord.provenance.controlsFingerprint') ?? null,
      comparedTaskFingerprint: expectOptionalString(provenance.comparedTaskFingerprint, 'interpretationDriftRecord.provenance.comparedTaskFingerprint') ?? null,
      comparedKnowledgeFingerprint: expectOptionalString(provenance.comparedKnowledgeFingerprint, 'interpretationDriftRecord.provenance.comparedKnowledgeFingerprint') ?? null,
      comparedControlsFingerprint: expectOptionalString(provenance.comparedControlsFingerprint, 'interpretationDriftRecord.provenance.comparedControlsFingerprint') ?? null,
    },
    explainableByFingerprintDelta: expectBoolean(record.explainableByFingerprintDelta, 'interpretationDriftRecord.explainableByFingerprintDelta'),
    steps,
  };
}

export const validateBenchmarkScorecardArtifact: (value: unknown) => BenchmarkScorecard =
  schemaDecode.decoderFor<BenchmarkScorecard>(schemas.BenchmarkScorecardSchema);

export const validateBenchmarkImprovementProjectionArtifact: (value: unknown) => BenchmarkImprovementProjection =
  schemaDecode.decoderFor<BenchmarkImprovementProjection>(schemas.BenchmarkImprovementProjectionSchema);

export const validateDogfoodRunArtifact: (value: unknown) => DogfoodRun =
  schemaDecode.decoderFor<DogfoodRun>(schemas.DogfoodRunSchema);
