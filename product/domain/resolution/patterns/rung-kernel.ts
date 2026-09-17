/**
 * Pattern-rung kernel — Step 11 Z11a.4a.
 *
 * The type surface for DOM-shape patterns that fill the
 * `'shared-patterns'` slot (rung 4) of the canonical 11-rung
 * `resolutionPrecedencePolicy` at
 * `product/domain/resolution/precedence-policy.ts`.
 *
 * **Divide of concern with the parser and with Reasoning.select:**
 *
 *   - Intent classification ("Click Submit" → verb=click +
 *     targetShape={role: button, nameSubstring: 'submit'}) is the
 *     PARSER's job. Under the current regex parser: best-effort.
 *     Under Z11d's claude-code-session adapter: `Reasoning.select`
 *     does the linguistic interpretation. Patterns assume intent is
 *     already classified — they do not interpret ADO text.
 *
 *   - DOM resolution (classified intent → concrete surfaceId) is
 *     the pattern's job. Mechanical — role/name/aria-landmark facts
 *     are true-or-false. Hand-authorable with high confidence.
 *
 * **Specificity ladder inside a pattern:**
 *
 * A Pattern holds `matchers: readonly Matcher[]` in specific → generic
 * order. The orchestrator walks the array. The first-match-wins
 * orchestrator is the default; alternatives can walk for
 * best-confidence if ambiguity resolution is needed (rare).
 *
 * Customer specialization adds matchers at the head of the array via
 * the proposal-gated catalog flow — there is no separate
 * customer-layer directory. The generic tail stays untouched; new
 * specific rungs prepend.
 *
 * **Purity:** Matchers are pure domain functions over
 * `MatcherContext`. No Effect imports inside matchers. Effect lives
 * at the PatternRegistry + strategy boundary (Z11a.4b), not here.
 *
 * **Rungs are identifiers, not carriers of confidence.** Following
 * the precedence-policy convention at `precedence.ts:54–60`: rungs
 * are string literals; the candidate produced at a rung carries the
 * signal metadata (matcherId + matcherIndex). The
 * matcherIndex encodes specificity position within its pattern.
 */

import { Option } from 'effect';
import { brandString, type Brand } from '../../kernel/brand';

// ─── Brands ─────────────────────────────────────────────────────

export type PatternId = Brand<string, 'PatternId'>;
export type MatcherId = Brand<string, 'MatcherId'>;

export function patternId(value: string): PatternId {
  return brandString<'PatternId'>(value);
}

export function matcherId(value: string): MatcherId {
  return brandString<'MatcherId'>(value);
}

// ─── Classified intent ──────────────────────────────────────────

/** The verbs patterns operate on. Mirrors the canonical StepAction
 *  union narrowed to the verbs resolution patterns care about —
 *  `'custom'` is excluded (the parser routes it away from patterns;
 *  it can only resolve via explicit scenario fields or needs-human). */
export type PatternVerb = 'navigate' | 'click' | 'input' | 'observe' | 'select' | 'press';

/** Hints about the surface the intent refers to. Any subset may be
 *  populated depending on the parser's classification strength; a
 *  matcher reads what it needs and returns None if the hint it
 *  depends on is absent. */
export interface TargetShapeHint {
  readonly role?: string | undefined;
  /** Exact accessible name (case-sensitive match). */
  readonly name?: string | undefined;
  /** Case-insensitive substring of the accessible name. */
  readonly nameSubstring?: string | undefined;
  /** ARIA landmark role of an ancestor (e.g., 'form', 'navigation',
   *  'main') the target lives inside. */
  readonly inLandmark?: string | undefined;
  /** Text of a cell in the `row` the target lives inside ("the
   *  checkbox in the row for Aurora headset"). Reality-study §10 /
   *  handoff N10 (C7): bulk-action checkboxes carry no name at all;
   *  row context is their only handle. */
  readonly inRowWith?: string | undefined;
  /** Value to enter for `input`/`select` verbs; ignored otherwise. */
  readonly value?: string | undefined;
}

/** The output the parser produces and patterns consume. The
 *  `originalActionText` is preserved for fallback heuristics that
 *  need the raw phrasing (e.g., detecting a submit-like verb not
 *  surfaced in the structured hint). */
export interface ClassifiedIntent {
  readonly verb: PatternVerb;
  readonly targetShape: TargetShapeHint;
  readonly originalActionText: string;
}

// ─── Surface index (the queryable DOM canon) ───────────────────

/** A narrow handle on a rendered surface the matchers query against.
 *  The full Surface model carries more; this interface exposes only
 *  what matchers need so the MatcherContext stays minimal.
 *
 *  The 2026-09-16 reality study (`docs/v2-substrate-reality-study.md
 *  §2`) widened it by four fields, one per finding the role+name
 *  surface alone could not express:
 *
 *    placeholder — F2: real search inputs are named by placeholder
 *                  alone. `name` already carries the accname result
 *                  (placeholder is a valid accname source); the raw
 *                  placeholder is kept so a `getByPlaceholder`
 *                  strategy can be emitted (C1).
 *    text        — F2/F3: the visible text content. For content-named
 *                  controls it equals `name`; for roleless surfaces it
 *                  is the ONLY handle.
 *    interactive — F3: the element carries a click affordance (native
 *                  control, click handler, tabindex, or computed
 *                  `cursor: pointer`). ~24% of real controls are
 *                  interactive but roleless; without this bit they
 *                  are invisible to every matcher (C2).
 *    ancestors   — F4: surfaceIds of enclosing surfaces, nearest
 *                  first. Makes `surfacesWithin` a real containment
 *                  query so landmark scoping (100% reliable on
 *                  Reactive) means something (C3). */
export interface IndexedSurface {
  readonly surfaceId: string;
  /** ARIA role. `'generic'` for a roleless element (ARIA's implicit
   *  role for div/span), never null — a matcher branching on
   *  "has a role" compares against 'generic'. */
  readonly role: string;
  /** Accessible name as accname computes it (aria-label,
   *  aria-labelledby, <label>, placeholder, content), or null. */
  readonly name: string | null;
  readonly landmarkRole: string | null;
  readonly classes: readonly string[];
  readonly placeholder: string | null;
  readonly text: string | null;
  /** Which affordance channel marked the surface interactive
   *  (docs/v2-reactive-discovery-handoff.md §3.2). Discovery records
   *  the channel; `isInteractiveAffordance` says whether it counts.
   *  An inherited `cursor: pointer` never does — that descendant is
   *  decorative and the control is its handler-owning ancestor. */
  readonly affordanceSource: AffordanceSource;
  readonly ancestors: readonly string[];
}

/** Ranked affordance channels. Mirrors the workshop walker's
 *  `AffordanceSource`; product cannot import workshop, so the
 *  vocabulary is declared on both sides and pinned by a law. */
export type AffordanceSource =
  | 'native'
  | 'aria-role'
  | 'handler'
  | 'tabindex'
  | 'platform-attr'
  | 'own-cursor'
  | 'none';

export function isInteractiveAffordance(source: AffordanceSource): boolean {
  return source === 'native' || source === 'aria-role' || source === 'handler' || source === 'tabindex' || source === 'platform-attr';
}

/** ARIA's implicit role for a div/span — the marker for a roleless
 *  surface in the index. */
export const ROLELESS_SURFACE_ROLE = 'generic';

/** Roles an intent classified as `textbox` ("the X field") may
 *  resolve to (handoff N4): the browser exposes `<input type=search>`
 *  as `searchbox` and `<input type=number>` as `spinbutton`, and QA
 *  prose calls all three "field". */
export const TEXT_ENTRY_ROLES: readonly string[] = ['textbox', 'searchbox', 'spinbutton'];

/** The roles a hinted role admits: the text-entry family for
 *  `textbox`; the role itself otherwise. */
export function rolesAdmittedBy(role: string): readonly string[] {
  return role === 'textbox' ? TEXT_ENTRY_ROLES : [role];
}

/** Query port over the surface canon. Implementations (Z11a.4b) back
 *  this with either the live interface-graph projection or a test
 *  double. Pure read surface — matchers cannot mutate the index. */
export interface SurfaceIndex {
  readonly findByRoleAndName: (role: string, name: string) => readonly IndexedSurface[];
  readonly findByRole: (role: string) => readonly IndexedSurface[];
  readonly findLandmarkByRole: (role: string) => Option.Option<IndexedSurface>;
  /** Surfaces contained (at any depth) by `ancestor`. */
  readonly surfacesWithin: (ancestor: IndexedSurface) => readonly IndexedSurface[];
  /** Surfaces whose `placeholder` equals the argument exactly
   *  (case-sensitive; the matcher relaxes as it needs). */
  readonly findByPlaceholder: (placeholder: string) => readonly IndexedSurface[];
  /** Every surface whose affordance channel counts as interactive
   *  (`isInteractiveAffordance`), role-bearing or not. */
  readonly findInteractive: () => readonly IndexedSurface[];
}

// ─── Matcher + orchestration ────────────────────────────────────

/** What a matcher returns when it matches. The surrounding pattern
 *  orchestrator wraps this into a full PatternCandidate by stamping
 *  patternId + matcherIndex. Matchers stay unaware of which pattern
 *  owns them — they're reusable across patterns. */
export interface MatcherResult {
  readonly targetSurfaceId: string;
  readonly matcherId: MatcherId;
  readonly rationale: string;
}

/** A pure matcher: returns Some(result) if it produced a binding,
 *  None if its preconditions were not met or no unique surface
 *  matched. Matchers never throw. */
export type Matcher = (ctx: MatcherContext) => Option.Option<MatcherResult>;

/** Everything a matcher needs, and nothing else. */
export interface MatcherContext {
  readonly intent: ClassifiedIntent;
  readonly surfaceIndex: SurfaceIndex;
}

/** The fully-attributed candidate emitted by a pattern's
 *  orchestrator. `matcherIndex` encodes specificity position within
 *  the pattern — 0 is the most specific matcher; higher indexes are
 *  more generic fallbacks. */
export interface PatternCandidate {
  readonly targetSurfaceId: string;
  readonly patternId: PatternId;
  readonly matcherId: MatcherId;
  readonly matcherIndex: number;
  readonly rationale: string;
}

/** Result of walking a pattern's matcher ladder. Closed two-variant
 *  union so `foldPatternRungResult` can dispatch exhaustively. */
export type PatternRungResult =
  | { readonly kind: 'matched'; readonly candidate: PatternCandidate }
  | { readonly kind: 'no-match'; readonly patternId: PatternId };

export function foldPatternRungResult<R>(
  result: PatternRungResult,
  cases: {
    readonly matched: (r: Extract<PatternRungResult, { kind: 'matched' }>) => R;
    readonly noMatch: (r: Extract<PatternRungResult, { kind: 'no-match' }>) => R;
  },
): R {
  switch (result.kind) {
    case 'matched':  return cases.matched(result);
    case 'no-match': return cases.noMatch(result);
  }
}

// ─── Pattern + orchestrator ─────────────────────────────────────

/** A Pattern is a self-contained resolution concept (form-submission,
 *  locator-by-role-and-name, etc.) with:
 *
 *  - `id`: stable identifier; appears on candidate provenance for
 *    compounding-engine aggregation.
 *  - `description`: one-line summary for operator reports.
 *  - `applicabilityGuard`: cheap predicate deciding whether this
 *    pattern is even relevant to the current intent. Patterns whose
 *    guard returns false are skipped without walking any matcher.
 *  - `matchers`: specific → generic ordered list.
 *  - `orchestrator`: how to walk the matcher list. Default:
 *    `firstMatchWins`.
 */
export interface Pattern {
  readonly id: PatternId;
  readonly description: string;
  readonly applicabilityGuard: (ctx: MatcherContext) => boolean;
  readonly matchers: readonly Matcher[];
  readonly orchestrator: Orchestrator;
}

/** Walks a pattern's matcher ladder against a context. Returns
 *  `{ kind: 'matched' }` on first success (or best-of-walk, depending
 *  on orchestrator strategy), `{ kind: 'no-match' }` otherwise. */
export type Orchestrator = (
  pattern: Pattern,
  ctx: MatcherContext,
) => PatternRungResult;
