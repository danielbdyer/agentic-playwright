/**
 * Hotspot Detection — identifies recurring resolution patterns that
 * suggest knowledge improvements.
 *
 * Architecture: three data sources (runs, drift records, resolution graphs)
 * are flatMapped into a uniform stream of HotspotEntry records, then
 * folded into an immutable Map via a single reduce pass.
 *
 * No .push(), no mutable Map, no imperative loops.
 * Pure: data sources in, sorted hotspots out.
 */

import type { InterpretationDriftRecord, ResolutionGraphRecord, RunRecord } from '../domain/types';
import { compareStrings } from '../domain/collections';

const compareNumbers = (left: number, right: number): number => left - right;

// ─── Types ───

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
  readonly family: { readonly field: string; readonly action: string };
  readonly occurrenceCount: number;
  readonly suggestions: ReadonlyArray<{ readonly target: string; readonly reason: string }>;
  readonly samples: readonly HotspotSample[];
}

// ─── Internal: uniform entry for the fold ───

interface HotspotEntry {
  readonly kind: HotspotKind;
  readonly screen: string;
  readonly field: string;
  readonly action: string;
  readonly sample: HotspotSample;
}

// ─── Pure Helpers ───

const familyKey = (field: string, action: string): string => `${field}|${action}`;

const hotspotId = (kind: HotspotKind, screen: string, field: string, action: string): string =>
  `${kind}:${screen}:${field}:${action}`;

/** Keep only the latest run per ADO ID, sorted by runId. Pure. */
const sortedLatestRuns = (runRecords: readonly RunRecord[]): readonly RunRecord[] => {
  const sorted = [...runRecords].sort((a, b) => compareStrings(b.completedAt, a.completedAt));
  const seen = new Set<string>();
  return sorted
    .filter((run) => { if (seen.has(run.adoId)) return false; seen.add(run.adoId); return true; })
    .sort((a, b) => compareStrings(a.runId, b.runId));
};

// ─── Source Extractors: data source → HotspotEntry[] ───
// Each extractor is a pure function that flatMaps a source into entries.

/** Extract hotspot entries from run records. Pure. */
const entriesFromRuns = (runRecords: readonly RunRecord[]): readonly HotspotEntry[] =>
  sortedLatestRuns(runRecords).flatMap((run) =>
    run.steps.flatMap((step): readonly HotspotEntry[] => {
      if (step.interpretation.kind === 'needs-human') return [];
      const { screen, action } = step.interpretation.target;
      const field = step.interpretation.target.element
        ?? step.interpretation.target.posture
        ?? step.interpretation.target.snapshot_template
        ?? 'screen';
      const sample: HotspotSample = {
        adoId: run.adoId, runId: run.runId, stepIndex: step.stepIndex,
        winningSource: step.interpretation.winningSource,
        resolutionMode: step.interpretation.resolutionMode,
        locatorRung: step.execution.locatorRung ?? null,
        widgetContract: step.execution.widgetContract ?? null,
      };

      const recoveredAttempt = step.execution.recovery?.attempts?.find((e) => e.result === 'recovered') ?? null;

      return [
        ...(step.interpretation.winningSource === 'structured-translation' && step.execution.execution.status === 'ok'
          ? [{ kind: 'translation-win' as const, screen, field, action, sample }] : []),
        ...(step.interpretation.resolutionMode === 'agentic' && step.interpretation.winningSource !== 'none' && step.execution.execution.status === 'ok'
          ? [{ kind: 'agentic-fallback-win' as const, screen, field, action, sample }] : []),
        ...(step.execution.degraded
          ? [{ kind: 'degraded-locator-rung' as const, screen, field, action, sample }] : []),
        ...(recoveredAttempt
          ? [{ kind: 'recovery-policy-win' as const, screen, field, action, sample: { ...sample, recoveryStrategy: recoveredAttempt.strategyId, recoveryFamily: recoveredAttempt.family } }] : []),
      ];
    }),
  );

/** Extract hotspot entries from drift records. Pure. */
const entriesFromDrift = (driftRecords: readonly InterpretationDriftRecord[]): readonly HotspotEntry[] =>
  driftRecords.flatMap((drift) =>
    drift.steps
      .filter((entry) => entry.changed)
      .map((step): HotspotEntry => ({
        kind: 'interpretation-drift',
        screen: drift.adoId,
        field: step.after.target,
        action: step.after.winningSource,
        sample: {
          adoId: drift.adoId, runId: drift.runId, stepIndex: step.stepIndex,
          winningSource: step.after.winningSource, resolutionMode: 'agentic',
          locatorRung: null, widgetContract: null,
          changedFields: step.changes.map((c) => c.field),
        },
      })),
  );

/** Extract hotspot entries from resolution graphs. Pure. */
const entriesFromGraphs = (graphs: readonly ResolutionGraphRecord[]): readonly HotspotEntry[] =>
  graphs.flatMap((graph) =>
    graph.steps
      .filter((entry) => entry.graph.winner.rung === 'needs-human')
      .map((step): HotspotEntry => ({
        kind: 'resolution-graph-needs-human',
        screen: graph.adoId,
        field: 'winner-rung',
        action: 'needs-human',
        sample: {
          adoId: graph.adoId, runId: graph.runId, stepIndex: step.stepIndex,
          winningSource: 'none', resolutionMode: 'agentic',
          locatorRung: null, widgetContract: null,
          changedFields: ['resolution-graph'],
        },
      })),
  );

// ─── Immutable Fold: entries → accumulated Map ───

interface AccEntry {
  readonly id: string;
  readonly kind: HotspotKind;
  readonly screen: string;
  readonly field: string;
  readonly action: string;
  readonly samples: readonly HotspotSample[];
}

/** Fold entries into an accumulated map. O(N) — mutable build, frozen at boundary. */
const foldEntries = (entries: readonly HotspotEntry[]): ReadonlyMap<string, AccEntry> => {
  const map = new Map<string, AccEntry>();
  for (const entry of entries) {
    const id = hotspotId(entry.kind, entry.screen, entry.field, entry.action);
    const existing = map.get(id);
    map.set(id, existing
      ? { ...existing, samples: [...existing.samples, entry.sample] }
      : { id, kind: entry.kind, screen: entry.screen, field: entry.field, action: entry.action, samples: [entry.sample] });
  }
  return map;
};

// ─── Suggestion Derivation: pure function of accumulator entry ───

const proceduralSuggestionNeeded = (action: string, samples: readonly HotspotSample[]): boolean =>
  action === 'custom' || samples.some((s) => Boolean(s.widgetContract));

const deriveSuggestions = (
  entry: AccEntry,
  familyScreenSpread: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlyArray<{ readonly target: string; readonly reason: string }> => [
  { target: `knowledge/screens/${entry.screen}.hints.yaml`, reason: 'Capture deterministic aliases/defaults so this family resolves without runtime fallback.' },
  ...((familyScreenSpread.get(familyKey(entry.field, entry.action))?.size ?? 0) > 1
    ? [{ target: 'knowledge/patterns/*.yaml', reason: 'This field/action family appears across screens; promote shared aliases and locator ladders.' }] : []),
  ...(proceduralSuggestionNeeded(entry.action, entry.samples)
    ? [{ target: 'knowledge/components/*.ts', reason: 'Procedural widget choreography is recurring; codify a reusable widget contract.' }] : []),
];

// ─── Public API ───

export function buildWorkflowHotspots(
  runRecords: readonly RunRecord[],
  driftRecords: readonly InterpretationDriftRecord[] = [],
  resolutionGraphs: readonly ResolutionGraphRecord[] = [],
): WorkflowHotspot[] {
  // 1. Flatten all sources into uniform entry stream
  const entries = [
    ...entriesFromRuns(runRecords),
    ...entriesFromDrift(driftRecords),
    ...entriesFromGraphs(resolutionGraphs),
  ];

  // 2. Fold into immutable accumulator map
  const accumulated = foldEntries(entries);

  // 3. Derive family screen spread — O(N) mutable build, frozen at boundary
  const familyScreenSpread: ReadonlyMap<string, ReadonlySet<string>> = (() => {
    const map = new Map<string, Set<string>>();
    for (const entry of accumulated.values()) {
      const key = familyKey(entry.field, entry.action);
      const existing = map.get(key);
      if (existing) existing.add(entry.screen);
      else map.set(key, new Set([entry.screen]));
    }
    return map;
  })();

  // 4. Project into sorted WorkflowHotspot[]
  return [...accumulated.values()]
    .map((entry): WorkflowHotspot => ({
      id: entry.id,
      kind: entry.kind,
      screen: entry.screen,
      family: { field: entry.field, action: entry.action },
      occurrenceCount: entry.samples.length,
      suggestions: deriveSuggestions(entry, familyScreenSpread),
      samples: [...entry.samples].sort((a, b) =>
        compareStrings(a.runId, b.runId) || compareNumbers(a.stepIndex, b.stepIndex) || compareStrings(a.adoId, b.adoId)),
    }))
    .sort((a, b) =>
      compareNumbers(b.occurrenceCount, a.occurrenceCount) || compareStrings(a.screen, b.screen)
      || compareStrings(a.family.field, b.family.field) || compareStrings(a.family.action, b.family.action)
      || compareStrings(a.kind, b.kind));
}

export const renderHotspotMarkdown = (hotspots: readonly WorkflowHotspot[]): readonly string[] =>
  hotspots.length === 0
    ? ['## Hotspot suggestions', '', '- No repeated translation/agentic/degraded wins detected in the latest run per scenario.', '']
    : [
        '## Hotspot suggestions', '',
        ...hotspots.flatMap((h) => [
          `### ${h.kind} · ${h.screen} · ${h.family.field} · ${h.family.action}`, '',
          `- Occurrences: ${h.occurrenceCount}`,
          `- Samples: ${h.samples.slice(0, 3).map((s) => `${s.runId}#${s.stepIndex}`).join(', ')}`,
          '- Suggested targets:',
          ...h.suggestions.map((s) => `  - ${s.target} — ${s.reason}`),
          '',
        ]),
      ];
