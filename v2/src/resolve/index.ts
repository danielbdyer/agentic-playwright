/**
 * resolve/: step understanding and the heuristic pre-filter. Pure
 * functions only: an ADO step becomes a StepIntent, a snapshot's
 * candidates are ranked against it (with the OutSystems-aware pattern
 * library as evidence), and, when no model is present, a decider commits
 * to a target only when one clearly wins.
 */
export type { ProposedAssertion, StepContext, StepIntent } from './types.js';

export { classifyStep, intentForAssertion, needsTarget, valuesUsedBy } from './intent.js';

export { proposeAssertions, parseClause, splitClauses } from './assertions.js';
export type { StatementContext } from './assertions.js';

export { analyzeTarget, landmarkForCue, splitRoleSuffix } from './target.js';
export type { TargetAnalysis, TargetMode } from './target.js';

export { readValue, referent, matchParameter, isParamRef, paramRef } from './values.js';
export type { ValueContext, ValueReading, RefContext } from './values.js';

export { canonicalKey, readKey } from './keys.js';

export { plainText, nameSimilarity, namesEqual } from './phrase.js';

export { indexCandidates, rolesAdmittedBy, TEXT_ENTRY_ROLES, LANDMARK_ROLES } from './surface.js';
export type { CandidateIndex, IndexedCandidate, LandmarkInstance, RowGroup } from './surface.js';

export {
  PATTERNS,
  matchPatterns,
  matchContext,
  runPattern,
  substituteParams,
  roleAndNameExact,
  roleAndNameSubstring,
  roleAndNameInLandmark,
  linkInNavLandmark,
  dialogButtonByName,
  formContextSubmit,
  singleTextboxInForm,
  textboxByPlaceholder,
  statusOrAlertByName,
  controlInRowByCellText,
  interactiveByContent,
} from './patterns.js';
export type { Matcher, MatcherHit, MatchContext, MatchOptions, Pattern, PatternMatch } from './patterns.js';

export { rankCandidates, scoreCandidates } from './rank.js';
export type { RankOptions, ScoredCandidate } from './rank.js';

export { decideTarget, facetIdFor, screenNameFromUrl } from './decide.js';
export type { DecideOptions, TargetDecision } from './decide.js';
