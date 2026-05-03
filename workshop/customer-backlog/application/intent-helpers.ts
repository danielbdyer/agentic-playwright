/**
 * Shared text-normalization + verb-extraction helpers used by the
 * customer-backlog heuristic classifier and the public-AUT runner.
 *
 * Extracted in cycle 3 of the cold-start cohort spike to remove the
 * `stripHtml` + `inferAllowedActions` duplication that grew organically
 * across the two consumers in cycles 1 and 2.
 *
 * Pure — no Effect imports, no I/O, no allocations beyond the immediate
 * result.
 */

import type { StepAction } from '../../../product/domain/governance/workflow-types';

const STRIP_HTML_RE = /<[^>]+>/g;

/**
 * Strip HTML tags and collapse whitespace. Used to lift ADO action
 * text (which is HTML-wrapped per the AzureDevOps storage convention)
 * into plain text the regex classifiers can consume.
 */
export function stripHtml(s: string): string {
  return s.replace(STRIP_HTML_RE, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Best-effort verb extraction from a step's plain-text action string,
 * returning the union of plausible `StepAction`s the parser would
 * narrow to. Used to seed the intent classifier's `allowedActions`
 * argument when no parser-narrowed list is available (i.e., when the
 * pipeline is being driven directly from an `AdoSnapshot` without
 * traversing parse → bind first).
 *
 * The classification is union-valued (multiple verbs may match) and
 * intentionally permissive — the downstream intent classifier's
 * regex matchers prefer text-shape detection over allowedAction
 * narrowing per `intent-classifier.ts:55-67`.
 */
export function inferAllowedActions(plain: string): readonly StepAction[] {
  const lower = plain.toLowerCase();
  const actions: StepAction[] = [];
  if (/\bnavigate|\bgo\s+to|\bopen\s+/.test(lower)) actions.push('navigate');
  if (/\bclick|\btap|\bpress|\bselect\s+the/.test(lower)) actions.push('click');
  if (/\benter|\btype|\bfill|\binput|\bpopulate|\bselect\s+\w+\s+from/.test(lower)) actions.push('input');
  if (/\bverify|\bobserve|\bcheck|\bconfirm\s+that|\bensure\b/.test(lower)) actions.push('assert-snapshot');
  return actions.length > 0 ? actions : ['custom'];
}
