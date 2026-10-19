/**
 * driver/: the batch author (vision §5.11). It loops a decider over a suite
 * with the same sixteen tools an interactive host uses, through the same
 * runtime, so every decision is receipted the same way.
 *
 *   authorSuite(runtime, options, log)   ado.fetch → per case: open, author, emit → test.run → ado.publish
 *   createHeuristicDecider()             resolve's pre-filter and decideTarget; no model
 *   createAnthropicDecider()             Claude over the Messages API (fetch, no SDK)
 */
export type {
  AuthorSuiteOptions,
  Budgets,
  CaseRun,
  CaseSummary,
  Decider,
  DeciderInput,
  Decision,
  DecisionPurpose,
  HandoffCandidate,
  HandoffSummary,
  HostUsage,
  PublishOptions,
  StepStatus,
  StepSummary,
  SuiteSummary,
} from './types.js';
export { DEFAULT_BUDGETS } from './types.js';
export { authorSuite } from './suite.js';
export { authorSteps, type AuthoredCase, type CaseEnv } from './case.js';
export { createHeuristicDecider, heuristicDecision, rankFor } from './heuristic.js';
export {
  createAnthropicDecider,
  buildUserPrompt,
  candidateTable,
  orderCandidates,
  toDecision,
  DECIDE_TOOL,
  DEFAULT_ANTHROPIC_MODEL,
  SYSTEM_PROMPT,
  type AnthropicDeciderOptions,
  type ContextLevel,
  type Effort,
} from './anthropic.js';
export { BudgetExhausted, createCaller, type Caller, type CallInput, type Outcome } from './calls.js';
export {
  aliasesFor,
  bindValue,
  displayNameFor,
  facetDraft,
  paramName,
  paramWords,
  parameterizeLocator,
  relativeRoute,
  routeFromSnapshot,
  rowLocator,
  screenSegment,
} from './naming.js';
