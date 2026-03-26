import type { InterpretationDriftRecord, ResolutionGraphRecord, RunRecord } from '../domain/types';
import { compareStrings } from '../domain/collections';

function compareNumbers(left: number, right: number): number {
  return left - right;
}

export type HotspotKind = 'translation-win' | 'agentic-fallback-win' | 'degraded-locator-rung' | 'recovery-policy-win' | 'interpretation-drift' | 'resolution-graph-needs-human';

export interface HotspotSample {
  readonly adoId: string;
  readonly runId: string;
  readonly stepIndex: number;
  readonly winningSource: string;
  readonly resolutionMode: string;
  readonly locatorRung: number | null;
  readonly widgetContract: string | null;
  readonly changedFields?: readonly string[] | undefined;
  readonly recoveryStrategy?: string | undefined;
  readonly recoveryFamily?: string | undefined;
}

export interface WorkflowHotspot {
  readonly id: string;
  readonly kind: HotspotKind;
  readonly screen: string;
  readonly family: {
    readonly field: string;
    readonly action: string;
  };
  readonly occurrenceCount: number;
  readonly suggestions: ReadonlyArray<{
    readonly target: string;
    readonly reason: string;
  }>;
  readonly samples: readonly HotspotSample[];
}

interface HotspotAccumulator {
  id: string;
  kind: HotspotKind;
  screen: string;
  field: string;
  action: string;
  samples: HotspotSample[];
}

function familyKey(field: string, action: string): string {
  return `${field}|${action}`;
}

function hotspotId(kind: HotspotKind, screen: string, field: string, action: string): string {
  return `${kind}:${screen}:${field}:${action}`;
}

function sortedLatestRuns(runRecords: readonly RunRecord[]): RunRecord[] {
  const byAdo = new Map<string, RunRecord>();
  const sorted = [...runRecords].sort((left, right) => compareStrings(right.completedAt, left.completedAt));
  for (const run of sorted) {
    if (!byAdo.has(run.adoId)) {
      byAdo.set(run.adoId, run);
    }
  }
  return [...byAdo.values()].sort((left, right) => compareStrings(left.runId, right.runId));
}

function pushAccumulator(
  map: Map<string, HotspotAccumulator>,
  input: {
    kind: HotspotKind;
    screen: string;
    field: string;
    action: string;
    sample: HotspotSample;
  },
): void {
  const id = hotspotId(input.kind, input.screen, input.field, input.action);
  const existing = map.get(id);
  if (existing) {
    existing.samples.push(input.sample);
    return;
  }

  map.set(id, {
    id,
    kind: input.kind,
    screen: input.screen,
    field: input.field,
    action: input.action,
    samples: [input.sample],
  });
}

function proceduralSuggestionNeeded(action: string, samples: readonly HotspotSample[]): boolean {
  return action === 'custom' || samples.some((sample) => Boolean(sample.widgetContract));
}

export function buildWorkflowHotspots(runRecords: readonly RunRecord[], driftRecords: readonly InterpretationDriftRecord[] = [], resolutionGraphs: readonly ResolutionGraphRecord[] = []): WorkflowHotspot[] {
  const accumulators = new Map<string, HotspotAccumulator>();

  for (const run of sortedLatestRuns(runRecords)) {
    for (const step of run.steps) {
      if (step.interpretation.kind === 'needs-human') {
        continue;
      }
      const target = step.interpretation.target;
      const screen = target.screen;
      const field = target.element ?? target.posture ?? target.snapshot_template ?? 'screen';
      const action = target.action;
      const sample: HotspotSample = {
        adoId: run.adoId,
        runId: run.runId,
        stepIndex: step.stepIndex,
        winningSource: step.interpretation.winningSource,
        resolutionMode: step.interpretation.resolutionMode,
        locatorRung: step.execution.locatorRung ?? null,
        widgetContract: step.execution.widgetContract ?? null,
      };

      if (step.interpretation.winningSource === 'structured-translation' && step.execution.execution.status === 'ok') {
        pushAccumulator(accumulators, { kind: 'translation-win', screen, field, action, sample });
      }

      if (step.interpretation.resolutionMode === 'agentic'
          && step.interpretation.winningSource !== 'none'
          && step.execution.execution.status === 'ok') {
        pushAccumulator(accumulators, { kind: 'agentic-fallback-win', screen, field, action, sample });
      }

      if (step.execution.degraded) {
        pushAccumulator(accumulators, { kind: 'degraded-locator-rung', screen, field, action, sample });
      }


      const recoveredAttempt = step.execution.recovery?.attempts?.find((entry) => entry.result === 'recovered') ?? null;
      if (recoveredAttempt) {
        pushAccumulator(accumulators, {
          kind: 'recovery-policy-win',
          screen,
          field,
          action,
          sample: {
            ...sample,
            recoveryStrategy: recoveredAttempt.strategyId,
            recoveryFamily: recoveredAttempt.family,
          },
        });
      }
    }
  }


  for (const drift of driftRecords) {
    for (const step of drift.steps.filter((entry) => entry.changed)) {
      const field = step.after.target;
      pushAccumulator(accumulators, {
        kind: 'interpretation-drift',
        screen: drift.adoId,
        field,
        action: step.after.winningSource,
        sample: {
          adoId: drift.adoId,
          runId: drift.runId,
          stepIndex: step.stepIndex,
          winningSource: step.after.winningSource,
          resolutionMode: 'agentic',
          locatorRung: null,
          widgetContract: null,
          changedFields: step.changes.map((change) => change.field),
        },
      });
    }
  }


  for (const graph of resolutionGraphs) {
    for (const step of graph.steps.filter((entry) => entry.graph.winner.rung === 'needs-human')) {
      pushAccumulator(accumulators, {
        kind: 'resolution-graph-needs-human',
        screen: graph.adoId,
        field: 'winner-rung',
        action: 'needs-human',
        sample: {
          adoId: graph.adoId,
          runId: graph.runId,
          stepIndex: step.stepIndex,
          winningSource: 'none',
          resolutionMode: 'agentic',
          locatorRung: null,
          widgetContract: null,
          changedFields: ['resolution-graph'],
        },
      });
    }
  }

  const familyScreenSpread = [...accumulators.values()].reduce((acc, entry) => {
    const key = familyKey(entry.field, entry.action);
    const existing = acc.get(key);
    if (existing) {
      existing.add(entry.screen);
    } else {
      acc.set(key, new Set([entry.screen]));
    }
    return acc;
  }, new Map<string, Set<string>>());

  return [...accumulators.values()]
    .map((entry) => {
      const suggestions: Array<{ readonly target: string; readonly reason: string }> = [
        {
          target: `knowledge/screens/${entry.screen}.hints.yaml`,
          reason: 'Capture deterministic aliases/defaults so this family resolves without runtime fallback.',
        },
      ];
      const sharedScreens = familyScreenSpread.get(familyKey(entry.field, entry.action));
      if ((sharedScreens?.size ?? 0) > 1) {
        suggestions.push({
          target: 'knowledge/patterns/*.yaml',
          reason: 'This field/action family appears across screens; promote shared aliases and locator ladders.',
        });
      }
      if (proceduralSuggestionNeeded(entry.action, entry.samples)) {
        suggestions.push({
          target: 'knowledge/components/*.ts',
          reason: 'Procedural widget choreography is recurring; codify a reusable widget contract.',
        });
      }

      return {
        id: entry.id,
        kind: entry.kind,
        screen: entry.screen,
        family: {
          field: entry.field,
          action: entry.action,
        },
        occurrenceCount: entry.samples.length,
        suggestions,
        samples: [...entry.samples].sort((left, right) =>
          compareStrings(left.runId, right.runId)
          || compareNumbers(left.stepIndex, right.stepIndex)
          || compareStrings(left.adoId, right.adoId)),
      } satisfies WorkflowHotspot;
    })
    .sort((left, right) =>
      compareNumbers(right.occurrenceCount, left.occurrenceCount)
      || compareStrings(left.screen, right.screen)
      || compareStrings(left.family.field, right.family.field)
      || compareStrings(left.family.action, right.family.action)
      || compareStrings(left.kind, right.kind));
}

export function renderHotspotMarkdown(hotspots: readonly WorkflowHotspot[]): string[] {
  const lines: string[] = [];
  lines.push('## Hotspot suggestions');
  lines.push('');
  if (hotspots.length === 0) {
    lines.push('- No repeated translation/agentic/degraded wins detected in the latest run per scenario.');
    lines.push('');
    return lines;
  }

  for (const hotspot of hotspots) {
    lines.push(`### ${hotspot.kind} · ${hotspot.screen} · ${hotspot.family.field} · ${hotspot.family.action}`);
    lines.push('');
    lines.push(`- Occurrences: ${hotspot.occurrenceCount}`);
    lines.push(`- Samples: ${hotspot.samples.slice(0, 3).map((sample) => `${sample.runId}#${sample.stepIndex}`).join(', ')}`);
    lines.push('- Suggested targets:');
    for (const suggestion of hotspot.suggestions) {
      lines.push(`  - ${suggestion.target} — ${suggestion.reason}`);
    }
    lines.push('');
  }

  return lines;
}
