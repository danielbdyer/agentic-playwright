/**
 * Shapes owned by the memory component. The facet itself is the contract's
 * `Facet`; what lives here is the screen catalog that holds facets, the
 * evidence events that justify them, and the small inputs the service API
 * takes. Evidence events are validated with zod on read (the log is a file a
 * human or a merge can touch), so their types are inferred from the schemas,
 * the same way the contract does it.
 */
import { z } from 'zod';
import {
  FacetKindSchema,
  FacetStatusSchema,
  LocatorSchema,
  ProvenanceSchema,
  type Facet,
  type FacetKind,
  type FacetStatus,
  type LandmarkRole,
  type LocatorSpec,
  type Provenance,
  type ScreenRoute,
} from '../contract/schemas.js';

// ─── Catalog ───────────────────────────────────────────────────────────────

/** The structural part of a page fingerprint, kept so preflight can say what drifted, not only that it did. */
export interface RouteSummary {
  readonly landmarks: readonly string[];
  /** Interactive role → count on the page when the route was recorded. */
  readonly interactiveRoles: Readonly<Record<string, number>>;
  readonly dataBlocks: number;
}

export interface CatalogRoute extends ScreenRoute {
  readonly summary?: RouteSummary;
}

/** One screen's facets, as stored in `.tesseract/catalog/<screen>.yaml`. Facets are kept sorted by id. */
export interface ScreenCatalog {
  readonly screen: string;
  readonly route?: CatalogRoute;
  readonly facets: readonly Facet[];
}

// ─── Evidence events ───────────────────────────────────────────────────────

export const RESOLVE_OUTCOMES = ['ok', 'not-found', 'ambiguous', 'not-visible', 'not-enabled'] as const;
export const ResolveOutcomeSchema = z.enum(RESOLVE_OUTCOMES);
export type ResolveOutcome = z.infer<typeof ResolveOutcomeSchema>;

/** Which tool or phase tried the locator. Mint and enrich verifications count as attempts. */
export const RESOLUTION_SOURCES = ['mint', 'enrich', 'act', 'assert', 'preflight', 'run', 'flow'] as const;
export const ResolutionSourceSchema = z.enum(RESOLUTION_SOURCES);
export type ResolutionSource = z.infer<typeof ResolutionSourceSchema>;

export const STATUS_REASONS = ['accepted', 'passes', 'health-floor', 'repaired', 'retired', 'human'] as const;
export const StatusReasonSchema = z.enum(STATUS_REASONS);
export type StatusReason = z.infer<typeof StatusReasonSchema>;

const RouteSummarySchema = z.object({
  landmarks: z.array(z.string()),
  interactiveRoles: z.record(z.string(), z.number()),
  dataBlocks: z.number(),
});

const base = {
  v: z.literal(1),
  eventId: z.string(),
  at: z.string(),
};

export const MintedEventSchema = z.object({
  ...base,
  kind: z.literal('minted'),
  facetId: z.string(),
  facetKind: FacetKindSchema,
  displayName: z.string(),
  provenance: ProvenanceSchema,
  locatorKeys: z.array(z.string()),
  /** The locators as minted, so the log alone can rebuild the facet if the YAML is lost. */
  locators: z.array(LocatorSchema),
  /** False when the locator was derived from the candidate rather than verified on the live page. */
  verified: z.boolean(),
});

export const EnrichedEventSchema = z.object({
  ...base,
  kind: z.literal('enriched'),
  facetId: z.string(),
  /** `mint` when an equivalent re-mint folded into an existing facet. */
  via: z.enum(['mint', 'enrich']),
  aliasesAdded: z.array(z.string()),
  locatorAdded: z.object({ key: z.string(), locator: LocatorSchema, verified: z.boolean() }).optional(),
  /** Key of a locator the facet already had that memory.enrich named, moving it first (a repair onto a known fallback). */
  locatorFirst: z.string().optional(),
  displayName: z.object({ from: z.string(), to: z.string() }).optional(),
  snapshotId: z.string(),
  candidateRef: z.string(),
});

export const ResolvedEventSchema = z.object({
  ...base,
  kind: z.literal('resolved'),
  facetId: z.string(),
  locatorKey: z.string(),
  outcome: ResolveOutcomeSchema,
  matches: z.number().int().optional(),
  source: ResolutionSourceSchema,
  runId: z.string().optional(),
  pageFingerprint: z.string().optional(),
  detail: z.string().optional(),
});

export const TestRunEventSchema = z.object({
  ...base,
  kind: z.literal('test-run'),
  facetIds: z.array(z.string()),
  testCaseId: z.string(),
  runId: z.string(),
  outcome: z.enum(['passed', 'failed']),
  failedFacet: z.string().optional(),
  failureFamily: z.string().optional(),
});

export const AcceptedEventSchema = z.object({
  ...base,
  kind: z.literal('accepted'),
  facetIds: z.array(z.string()),
  testCaseId: z.string(),
  reviewer: z.string(),
  decision: z.enum(['accept', 'accept-with-edit']),
});

export const StatusEventSchema = z.object({
  ...base,
  kind: z.literal('status'),
  facetId: z.string(),
  from: FacetStatusSchema,
  to: FacetStatusSchema,
  reason: StatusReasonSchema,
  by: z.enum(['tool', 'human']),
  /**
   * Tool changes only: sha256 of the catalog YAML text the committing call
   * read. The YAML is written after the event is appended; if that write
   * fails, the file still has exactly this text, which tells the next read
   * the file's status is not a human edit (see restoreUnsavedStatuses).
   */
  fileBefore: z.string().optional(),
});

export const RouteEventSchema = z.object({
  ...base,
  kind: z.literal('route'),
  url: z.string(),
  fingerprint: z.string().optional(),
  summary: RouteSummarySchema.optional(),
});

/** Lifted from v1 `FacetIdMigration`: a rename is an evidence event, never an edit. */
export const IdMigrationEventSchema = z.object({
  ...base,
  kind: z.literal('id-migration'),
  from: z.string(),
  to: z.string(),
  reason: z.enum(['element-renamed-upstream', 'disambiguation', 'taxonomy-revision']),
  rationale: z.string(),
  by: z.enum(['human', 'agent']),
});

export const EvidenceEventSchema = z.discriminatedUnion('kind', [
  MintedEventSchema,
  EnrichedEventSchema,
  ResolvedEventSchema,
  TestRunEventSchema,
  AcceptedEventSchema,
  StatusEventSchema,
  RouteEventSchema,
  IdMigrationEventSchema,
]);

export type MintedEvent = z.infer<typeof MintedEventSchema>;
export type EnrichedEvent = z.infer<typeof EnrichedEventSchema>;
export type ResolvedEvent = z.infer<typeof ResolvedEventSchema>;
export type TestRunEvent = z.infer<typeof TestRunEventSchema>;
export type AcceptedEvent = z.infer<typeof AcceptedEventSchema>;
export type StatusEvent = z.infer<typeof StatusEventSchema>;
export type RouteEvent = z.infer<typeof RouteEventSchema>;
export type IdMigrationEvent = z.infer<typeof IdMigrationEventSchema>;
export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;
export type EvidenceKind = EvidenceEvent['kind'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before it is stamped with `v`, `eventId`, and `at`. */
export type EventBody = DistributiveOmit<EvidenceEvent, 'v' | 'eventId' | 'at'>;

/** Stamps an event body with an id and a time. Injected so the planners stay pure and tests stay deterministic. */
export type EventFactory = <B extends EventBody>(body: B) => Extract<EvidenceEvent, { kind: B['kind'] }>;

// ─── Status transitions ────────────────────────────────────────────────────

export interface StatusChange {
  readonly facetId: string;
  readonly from: FacetStatus;
  readonly to: FacetStatus;
  readonly reason: StatusReason;
}

/** Thresholds from the workspace config that drive promotion and staleness. */
export interface GatingConfig {
  readonly promoteAfterPasses: number;
  readonly staleHealthFloor: number;
  readonly staleMinAttempts: number;
}

// ─── Service inputs ────────────────────────────────────────────────────────

/** Common options for every call that writes: the clock (tests and the tool context inject it). */
export interface MemoryOptions {
  readonly now?: () => Date;
}

/** What the caller knows about who minted a facet; snapshotId and candidateRef come from the evidence. */
export interface MintProvenance {
  readonly instrument: Provenance['instrument'];
  readonly mintedAt?: string;
  readonly session?: string;
  readonly model?: string;
  readonly testCase?: string;
  readonly flow?: string;
}

export interface MemoryQueryInput {
  /** Omit to search every screen. */
  readonly screen?: string;
  readonly phrase: string;
  readonly kind?: FacetKind;
  readonly landmark?: LandmarkRole;
  /** Default 8. */
  readonly limit?: number;
}

/** A resolution attempt against a facet's locator, reported by act, assert, run, flow, or preflight. */
export interface ResolutionReport {
  readonly facetId: string;
  /** The locator that was tried; defaults to the facet's best locator. */
  readonly locator?: LocatorSpec;
  readonly outcome: ResolveOutcome;
  readonly matches?: number;
  readonly source: ResolutionSource;
  readonly runId?: string;
  readonly pageFingerprint?: string;
  readonly detail?: string;
}

/** A trusted facet whose locator stopped resolving: the drift signal test.run and app.act surface. */
export interface DriftSignal {
  readonly facetId: string;
  readonly outcome: ResolveOutcome;
  readonly locator: string;
}
