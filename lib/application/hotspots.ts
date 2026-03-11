import type { InterpretationDriftRecord, RunRecord } from '../domain/types';
import { compareStrings } from '../domain/collections';

function compareNumbers(left: number, right: number): number {
  return left - right;
}

export type HotspotKind = 'translation-win' | 'agentic-fallback-win' | 'degraded-locator-rung' | 'interpretation-drift';

export interface HotspotSample {
  adoId: string;
  runId: string;
  stepIndex: number;
  winningSource: string;
  resolutionMode: string;
  locatorRung: number | null;
  widgetContract: string | null;
  changedFields?: string[] | undefined;
}

export interface WorkflowHotspot {
  id: string;
  kind: HotspotKind;
  screen: string;
  family: {
    field: string;
    action: string;
  };
  occurrenceCount: number;
  suggestions: Array<{
    target: string;
    reason: string;
  }>;
  samples: HotspotSample[];
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

export function buildWorkflowHotspots(runRecords: readonly RunRecord[], driftRecords: readonly InterpretationDriftRecord[] = []): WorkflowHotspot[] {
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

  const familyScreenSpread = new Map<string, Set<string>>();
  for (const entry of accumulators.values()) {
    const key = familyKey(entry.field, entry.action);
    const screens = familyScreenSpread.get(key) ?? new Set<string>();
    screens.add(entry.screen);
    familyScreenSpread.set(key, screens);
  }

  return [...accumulators.values()]
    .map((entry) => {
      const suggestions: WorkflowHotspot['suggestions'] = [
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
