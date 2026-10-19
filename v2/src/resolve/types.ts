/**
 * What step understanding produces. A StepIntent is the heuristic reading
 * of one ADO step: the verb, the words that name the target, the value,
 * and the scoping cues the wording carries. It is a pre-filter and a
 * fallback, never the judge: an agent with the page in front of it may
 * overrule every field.
 */
import type { AssertionKind, LandmarkRole, Verb } from '../contract/schemas.js';

/**
 * An assertion the step's wording suggests, in the vocabulary app.assert
 * takes. Proposals are conservative: a clause whose shape is not
 * recognized proposes nothing (a wrong proposal turns into a false
 * text-mismatch handoff downstream).
 */
export interface ProposedAssertion {
  readonly kind: AssertionKind;
  /** Literal text, "@param", a number for count, or null when the wording gives none (a paraphrase). */
  readonly expected: string | number | null;
  /** Words naming what to assert on; null when the role or row cue carries the identity. */
  readonly targetPhrase: string | null;
  readonly roleHint: string | null;
  readonly landmarkCue: LandmarkRole | null;
  /** Text of the table/grid row the target sits in, or "@param". */
  readonly rowCue: string | null;
  /** 0..1: how sure the reading is. Below 0.5, treat the proposal as a suggestion to check by observing. */
  readonly confidence: number;
  /** Plain-words caveat, e.g. that the ADO text is a paraphrase of what the page shows. */
  readonly note: string | null;
  /** The clause the proposal was read from. */
  readonly source: string;
}

export interface StepIntent {
  readonly verb: Verb;
  /** The words naming the target, quotes stripped, articles, prepositions and the role word dropped. */
  readonly targetPhrase: string | null;
  /** The target as the author wrote it, role word included ("search field"); good facet alias material. */
  readonly targetMention: string | null;
  /** The author quoted the name, so it is meant literally. */
  readonly exactName: boolean;
  /** ARIA role the wording implies ("button", "textbox", …). */
  readonly roleHint: string | null;
  /** Literal value, or "@param" for an ADO parameter. */
  readonly value: string | null;
  /** Playwright key name for press. */
  readonly key: string | null;
  readonly landmarkCue: LandmarkRole | null;
  /** Text identifying the row the target sits in, or "@param". */
  readonly rowCue: string | null;
  readonly assertions: readonly ProposedAssertion[];
  /** 0..1. */
  readonly confidence: number;
  readonly notes: readonly string[];
  /** The action text as plain text (HTML stripped, entities decoded). */
  readonly actionText: string;
  /** The expected-result text as plain text. */
  readonly expectedText: string;
}

/** What earlier steps of the same test case supply. */
export interface StepContext {
  /**
   * Values earlier steps used, oldest first: "@param" references or
   * literals. "Matching policy appears in Search Results" and "next to
   * the todo" refer back to them.
   */
  readonly priorValues?: readonly string[];
  /** The data row the case runs with: a literal equal to one of its values becomes that "@param". */
  readonly dataRow?: Readonly<Record<string, string>>;
}
