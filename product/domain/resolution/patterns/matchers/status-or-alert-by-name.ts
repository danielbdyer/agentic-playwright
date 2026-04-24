/**
 * status-or-alert-by-name — matcher for observe intents that imply
 * a status or alert role based on semantic cues in the original
 * action text ("success message", "error alert", "warning status").
 *
 * Tries role=status first (less intrusive, for successes/notices),
 * then role=alert (for errors/warnings). Single-match required per
 * role; otherwise falls through.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { IndexedSurface, Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('status-or-alert-by-name');

const SUCCESS_RE = /\b(success|confirmed|saved|completed|ok)\b/i;
const ERROR_RE = /\b(error|fail(?:ed|ure)?|invalid|warning|denied|problem|issue)\b/i;

function matchName(s: IndexedSurface, target: string): boolean {
  if (s.name === null) return false;
  return s.name.toLowerCase().includes(target.toLowerCase());
}

export const statusOrAlertByNameMatcher: Matcher = (ctx) => {
  if (ctx.intent.verb !== 'observe') return Option.none();

  // Semantic cue detection: the action text (or nameSubstring) carries
  // a success/error/warning word → translate to role=status / alert.
  const haystack = `${ctx.intent.originalActionText} ${ctx.intent.targetShape.nameSubstring ?? ''}`;
  const implyStatus = SUCCESS_RE.test(haystack);
  const implyAlert = ERROR_RE.test(haystack);

  if (!implyStatus && !implyAlert) return Option.none();

  // Role inference: try the implied role first, pick the single
  // surface with that role. If the intent also carries an explicit
  // nameSubstring that's NOT the cue word, use it to disambiguate
  // among multiple same-role surfaces. Otherwise single-of-role is
  // the signal.
  const targetName = ctx.intent.targetShape.nameSubstring ?? ctx.intent.targetShape.name;
  const isCueWordOnly = targetName !== undefined && (SUCCESS_RE.test(targetName) || ERROR_RE.test(targetName));

  const tryRole = (role: 'status' | 'alert'): Option.Option<MatcherResult> => {
    const all = ctx.surfaceIndex.findByRole(role);
    // If the intent's name hint is a real surface name (not the cue word itself),
    // filter by it. Otherwise, single-of-role wins.
    const candidates = targetName && !isCueWordOnly
      ? all.filter((s) => matchName(s, targetName))
      : all;
    if (candidates.length !== 1) return Option.none();
    const surface = candidates[0]!;
    return Option.some<MatcherResult>({
      targetSurfaceId: surface.surfaceId,
      matcherId: MATCHER_ID,
      rationale: `observe intent inferred role=${role} from semantic cue`,
    });
  };

  if (implyStatus) {
    const status = tryRole('status');
    if (Option.isSome(status)) return status;
  }
  if (implyAlert) {
    const alert = tryRole('alert');
    if (Option.isSome(alert)) return alert;
  }
  return Option.none();
};
