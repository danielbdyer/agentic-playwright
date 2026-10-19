/**
 * observe/: the product's eyes. Open-page hydration, the DOM walk the way
 * the accessibility tree sees it, OutSystems variant, page fingerprint,
 * PII-gated snapshots on disk, and the locator ladder that turns a
 * snapshot candidate into a verified Playwright locator.
 */
export { navigate, awaitHydration, settle, classifyNavigationError } from './hydration.js';
export type { NavigationResult, NavigateOptions, HydrationOptions } from './hydration.js';

export { classifyVariant } from './variant.js';
export type { VariantVerdict, VariantSignals } from './variant.js';

export { buildFingerprint, fingerprintBasis, fingerprintHash, diffFingerprints, pathOf } from './fingerprint.js';
export type { FingerprintBasis, FingerprintInputs } from './fingerprint.js';

export { captureAria, capAriaText, redactAriaText, parseAriaSnapshot, nameAgreement } from './aria.js';
export type { AriaCapture, AriaEntry, CaptureAriaOptions, NameAgreement, ObserveScope } from './aria.js';

export {
  observePage,
  parseScope,
  scopeLabel,
  toCandidate,
  capCandidates,
  dropTier,
  audit,
  diffSnapshots,
  snapshotFromRecord,
  pageVariant,
  SNAPSHOT_RECORD_VERSION,
} from './observe.js';
export type { ObserveOptions, ObserveResult, SnapshotRecord, NodeCategory } from './observe.js';

export { saveSnapshot, saveSnapshotRecord, loadSnapshot, pruneSnapshots, snapshotPath, screenshotPathFor } from './store.js';
export type { SavedSnapshot } from './store.js';

export {
  resolveCandidateLocator,
  describeCandidate,
  generateRungs,
  scopeVariants,
  countMatches,
  nameForLocator,
  cssForId,
  descriptionFromCandidate,
  proposeLocator,
} from './ladder.js';
export type { MatchCount, RefDescription } from './ladder.js';

export { inPage, inElement, inElements, inPageExpression } from './in-page/runtime.js';
export type { PageFunction, ElementFunction, ElementsFunction } from './in-page/runtime.js';
export { IN_PAGE_BUNDLE, IN_PAGE_BUNDLE_HASH } from './in-page/bundle.generated.js';
export type { WalkNode, WalkResult, WalkOptions, WalkScope, WalkStats, PageSignals, RefStatus } from './in-page/walker.js';
