/**
 * The hands: one verified action at a time, and assertions that report what
 * they saw. Callers resolve a target to a Playwright Locator (locator/), get
 * the page from the pool (browser/), and call these.
 */
export {
  ACTIONS,
  DEFAULT_ACTION_TIMEOUT_MS,
  performAction,
  type Action,
  type ActionFailed,
  type ActionOptions,
  type ActionResult,
  type ActionSucceeded,
  type SelectPath,
} from './act.js';
export {
  DEFAULT_ASSERTION_TIMEOUT_MS,
  PAGE_ASSERTION_KINDS,
  isPageAssertion,
  parseRegexLiteral,
  runAssertion,
  titleExpectation,
  urlExpectation,
  type AssertionOptions,
  type AssertionResult,
  type Observed,
} from './assert.js';
export { classifyPlaywrightError, stripAnsi, summarizeExpectMessage, type ClassifiedError } from './classify.js';
export { MODIFIER_KEYS, NAMED_KEYS, describeAllowedKeys, isKnownKey, normalizeKey, type ModifierKey, type NamedKey } from './keys.js';
export {
  countMatches,
  describeLocator,
  requireUnique,
  resolveUnique,
  settleVisible,
  type MatchCounts,
  type UniqueTarget,
} from './verify.js';
