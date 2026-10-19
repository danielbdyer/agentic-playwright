/**
 * memory/ — the facet catalog. Public API for tool handlers and other
 * components. The service functions (load, query, mint, enrich, record*)
 * take the Workspace and handle locking, evidence, gating, and the YAML;
 * the pure functions underneath are exported for tests and for components
 * that already hold a catalog (emission, run classification).
 */
export {
  // service: reading
  listScreens,
  loadScreen,
  findFacet,
  facetsByIds,
  queryMemory,
  // service: writing
  setRoute,
  saveScreen,
  mintFacet,
  enrichFacet,
  recordResolutions,
  recordTestRun,
  recordAcceptance,
  recordPreflight,
  // presentation and config
  presentFacet,
  contractRoute,
  gatingConfig,
  type LoadedScreen,
  type MemoryQueryResult,
  type MintInput,
  type MintResult,
  type EnrichInput,
  type EnrichResult,
  type ResolutionResult,
  type TestRunInput,
  type TestRunResult,
  type AcceptanceInput,
  type AcceptanceResult,
  type PreflightRecordOptions,
  type PreflightRecordResult,
} from './service.js';

export {
  checkFacetsOnPage,
  preflightEntries,
  summarizePreflight,
  screenPreflightStatus,
  type PreflightCheck,
  type PreflightSummary,
} from './preflight.js';

export {
  HEALTH_WINDOW,
  LADDER,
  ladderRank,
  orderLocators,
  bestLocator,
  facetHealth,
  facetHealthWindow,
  locatorHealth,
  healthFromCounts,
  healthString,
  nextStatus,
  applyGating,
  foldEvent,
  foldEvents,
  projectFacet,
  projectCatalog,
  reconcileHumanEdits,
  failureCountsAgainstFacet,
  emptyStats,
  type FacetStats,
  type StatsIndex,
  type LocatorHealth,
  type LocatorWindow,
  type Transition,
} from './derive.js';

export { STATUS_WEIGHT, SCORE_FLOOR, DEFAULT_QUERY_LIMIT, queryFacets, scoreFacets, rankScored, namesOf, landmarkCue } from './score.js';
export { memberNameFor, memberNames, preferredMemberName, RESERVED_MEMBERS } from './member.js';
export { facetIdFrom, parseFacetId, requireFacetId, screenOf, localIdFor, locatorKeyOf, bareLocator, isSlug, assertScreenName, type ParsedFacetId } from './ids.js';
export { summaryFromFingerprint, diffSummaries, routeDrift, normalizeRouteUrl, routeUrlRelativeTo, INTERACTIVE_ROLES, type RouteDrift } from './route.js';
export { deriveLocator, mergeAliases, MAX_ALIASES, MAX_ALIAS_LENGTH } from './draft.js';
export { evidenceFile, evidencePointer, readEvents, eventFactory, type EvidenceRead } from './evidence.js';
export { catalogFile } from './catalog-store.js';
export { parseCatalogYaml, serializeCatalog } from './catalog-yaml.js';
export { planMint, type MintDraft, type MintPlanInput } from './mint.js';
export { planEnrich, type EnrichPlanInput } from './enrich.js';
export type {
  ScreenCatalog,
  CatalogRoute,
  RouteSummary,
  EvidenceEvent,
  EvidenceKind,
  ResolveOutcome,
  ResolutionSource,
  ResolutionReport,
  StatusChange,
  StatusReason,
  DriftSignal,
  GatingConfig,
  MemoryOptions,
  MintProvenance,
  MemoryQueryInput,
} from './types.js';
