/**
 * Degraded-name resolution kernel — cycle 10 of the cold-start
 * cohort spike.
 *
 * The deterministic precedence doctrine (CLAUDE.md, "Deterministic
 * precedence" §Resolution rung 6) names "live DOM exploration and
 * safe degraded resolution" as the rung below approved knowledge
 * and above needs-human. Cycle 9's clean held-out evaluation
 * (journal Entry 36) showed the one code path that touches real
 * applications had no such rung: a strict role+name query, one
 * ad-hoc first-word fallback, and an evidence-free "0 matches"
 * when both missed.
 *
 * This module is the pure half of that rung. It owns three
 * decisions, all deterministic and law-tested:
 *
 *   1. **Phrase reduction** — given a classifier-extracted noun
 *      phrase ("English language"), produce the ordered ladder of
 *      weaker name queries worth trying ("English", "language").
 *      Generalizes the cycle-6 first-word special case.
 *   2. **Candidate scoring** — given the accessible names actually
 *      harvested from the page, score each against the phrase by
 *      token overlap. No reasoning, no fuzz: a candidate whose
 *      tokens all appear in the phrase scores high; a candidate
 *      sharing nothing (日本語 vs "Japanese language") scores 0.
 *   3. **Dominance selection** — auto-accept only a candidate that
 *      is visible, clears the score floor, and beats the best
 *      differently-named competitor by a margin. Everything else
 *      is the next rung's decision, made on harvested evidence.
 *
 * The impure half (harvesting candidates from a live page via
 * Playwright) lives with the caller; this module never touches a
 * DOM. Matches produced through this kernel remain subject to the
 * cycle-8 expectedTarget verification, so added recall cannot
 * silently buy false positives.
 *
 * Pure — no Effect imports.
 */

// ─── Candidate shapes ───────────────────────────────────────────

/** An element harvested from the page: its (approximated)
 *  accessible name and whether it is visible right now. Hidden
 *  candidates are evidence, never auto-accept targets — a link
 *  inside a collapsed menu exists, but clicking it requires
 *  opening the menu first, which is not this rung's call. */
export interface CandidateSurface {
  readonly name: string;
  readonly visible: boolean;
}

export interface ScoredCandidate extends CandidateSurface {
  readonly score: number;
}

/** Score floor for auto-acceptance. A single-token candidate fully
 *  contained in the phrase ("English" in "English language")
 *  scores 0.8; a candidate sharing half its tokens scores well
 *  below. First-principles seed pending calibration across
 *  cohort runs. */
export const DOMINANCE_THRESHOLD = 0.75;

/** Required gap between the accepted candidate and the best
 *  differently-named competitor. Two near-tied candidates mean
 *  the phrase is genuinely ambiguous on this page — a handoff,
 *  not a guess. */
export const DOMINANCE_MARGIN = 0.15;

// ─── Tokenization ───────────────────────────────────────────────

/** Words that carry no targeting signal on their own. A reduction
 *  consisting solely of these is never worth a DOM query, and they
 *  are excluded from overlap scoring so "the" matching "the"
 *  cannot prop up a candidate. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'on', 'for',
  'and', 'or', 'now', 'then', 'with', 'that', 'this',
]);

/**
 * Unicode-aware name tokens: lowercased runs of letters/digits.
 * CJK text without spaces stays a single token (日本語 → ['日本語']),
 * which is exactly the honesty we want — token overlap cannot
 * pretend "Japanese" and 日本語 are related; bridging that gap is
 * reasoning-rung work.
 */
export function normalizeNameTokens(value: string): readonly string[] {
  const matches = value.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return matches ?? [];
}

function signalTokens(value: string): readonly string[] {
  const all = normalizeNameTokens(value);
  const filtered = all.filter((t) => !STOPWORDS.has(t));
  // A name that is ALL stopwords ("The The") still deserves a
  // token set rather than a guaranteed-zero score.
  return filtered.length > 0 ? filtered : all;
}

// ─── 1. Phrase reduction ────────────────────────────────────────

/**
 * Ordered ladder of weaker name queries derived from a noun
 * phrase. Right-drops first (most phrases front-load the name:
 * "English language" → "English"), then left-drops ("toggle
 * checkbox label" → "checkbox label" → "label"), longest first
 * within each family. The original phrase is excluded (the caller
 * already tried it), as are duplicates and pure-stopword
 * reductions.
 */
export function phraseReductions(phrase: string): readonly string[] {
  const words = phrase.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) return [];

  const seen = new Set<string>([phrase.trim().toLowerCase()]);
  const out: string[] = [];
  const push = (candidate: string): void => {
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const tokens = normalizeNameTokens(candidate);
    if (tokens.length === 0) return;
    if (tokens.every((t) => STOPWORDS.has(t))) return;
    out.push(candidate);
  };

  for (let k = words.length - 1; k >= 1; k -= 1) {
    push(words.slice(0, k).join(' '));
  }
  for (let k = words.length - 1; k >= 1; k -= 1) {
    push(words.slice(words.length - k).join(' '));
  }
  return out;
}

// ─── 2. Candidate scoring ───────────────────────────────────────

/**
 * Token-overlap score in [0, 1], weighted toward candidate
 * coverage: 0.6 × (overlap / candidate tokens) + 0.4 ×
 * (overlap / phrase tokens). A candidate fully contained in the
 * phrase is rewarded even when the phrase carries extra
 * descriptive words; a long candidate that merely brushes the
 * phrase is not.
 */
export function scoreNameAgainstPhrase(candidateName: string, phrase: string): number {
  const candidate = signalTokens(candidateName);
  const target = signalTokens(phrase);
  if (candidate.length === 0 || target.length === 0) return 0;
  const targetSet = new Set(target);
  const candidateSet = new Set(candidate);
  let overlap = 0;
  for (const token of candidateSet) {
    if (targetSet.has(token)) overlap += 1;
  }
  if (overlap === 0) return 0;
  return 0.6 * (overlap / candidateSet.size) + 0.4 * (overlap / targetSet.size);
}

/**
 * Score every harvested candidate against the phrase and sort:
 * score descending, then visible-first, then name ascending so
 * equal inputs always rank identically.
 */
export function rankCandidates(
  phrase: string,
  candidates: readonly CandidateSurface[],
): readonly ScoredCandidate[] {
  return candidates
    .map((c) => ({ ...c, score: scoreNameAgainstPhrase(c.name, phrase) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

// ─── 3. Dominance selection ─────────────────────────────────────

/**
 * The auto-accept rule. Returns the top candidate iff it is
 * visible, clears DOMINANCE_THRESHOLD, and beats the best
 * candidate with a DIFFERENT normalized name by DOMINANCE_MARGIN.
 * Multiple candidates sharing the accepted name are tolerated
 * here — the caller's confirmation query (which requires a unique
 * visible match) is the arbiter for same-name duplicates.
 *
 * Returns null when no candidate qualifies; the caller emits a
 * handoff that carries the ranked candidates as evidence.
 */
export function selectDominantCandidate(
  ranked: readonly ScoredCandidate[],
): ScoredCandidate | null {
  return selectDominantCandidateWith(ranked, {
    threshold: DOMINANCE_THRESHOLD,
    margin: DOMINANCE_MARGIN,
  });
}

/** Selection thresholds, surfaced so the offline calibration
 *  harness (workshop/optimization/) can sweep them. The runtime
 *  resolver always uses the committed DOMINANCE_THRESHOLD /
 *  DOMINANCE_MARGIN via `selectDominantCandidate`. */
export interface DominanceThresholds {
  readonly threshold: number;
  readonly margin: number;
}

/**
 * Parameterized form of the auto-accept rule (Cycle 11 / G6). Pure
 * over both the candidates and the thresholds, so a calibration
 * sweep can measure precision/recall across a threshold grid
 * without mutating the committed constants. `selectDominantCandidate`
 * is this with the committed thresholds.
 */
export function selectDominantCandidateWith(
  ranked: readonly ScoredCandidate[],
  thresholds: DominanceThresholds,
): ScoredCandidate | null {
  const top = ranked[0];
  if (!top || !top.visible || top.score < thresholds.threshold) return null;
  const topKey = normalizeNameTokens(top.name).join(' ');
  const rival = ranked.find(
    (c) => normalizeNameTokens(c.name).join(' ') !== topKey,
  );
  if (rival && top.score - rival.score < thresholds.margin) return null;
  return top;
}
