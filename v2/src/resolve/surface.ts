/**
 * A queryable view over a snapshot's candidate list: containment by
 * landmark, rows by their text, role families.
 *
 * v1's matchers queried an `IndexedSurface` list with explicit ancestor
 * ids that no producer ever built from a real page. v2 candidates carry
 * their nearest landmark (role and name) and their row's text instead, and
 * landmark nodes carry their own enclosing landmark, so the chain of
 * enclosing landmarks is rebuilt by walking landmark nodes upward. When
 * the snapshot cap dropped a landmark node, the chain stops at the nearest
 * landmark the candidate names; nothing is invented.
 *
 * Landmark instances are identified by role and accessible name. Two
 * unnamed landmarks of the same role (an unnamed header nav and an unnamed
 * side nav) are therefore one instance here: matchers still iterate every
 * named instance of a role, and an unnamed pair is treated as one scope,
 * which over-counts matches (the safe direction: a matcher then declines).
 */
import type { Candidate } from '../contract/schemas.js';
import { lowerNorm } from './phrase.js';

/** Roles the walker reports as landmarks; dialog is included because it scopes like one. */
export const LANDMARK_ROLES: ReadonlySet<string> = new Set([
  'banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search', 'form', 'region', 'dialog',
]);

/**
 * Roles an intent hinting `textbox` may resolve to (v1 handoff N4: the
 * browser exposes type=search as searchbox and type=number as spinbutton,
 * and QA prose calls all of them "field"). v2 adds combobox: an input with
 * a datalist, or an OutSystems autocomplete, is a "field" too.
 */
export const TEXT_ENTRY_ROLES: readonly string[] = ['textbox', 'searchbox', 'spinbutton', 'combobox'];

const ADMITTED: Readonly<Record<string, readonly string[]>> = {
  textbox: TEXT_ENTRY_ROLES,
  searchbox: ['searchbox', 'textbox'],
  checkbox: ['checkbox', 'switch', 'menuitemcheckbox'],
  switch: ['switch', 'checkbox'],
  radio: ['radio', 'menuitemradio'],
  combobox: ['combobox', 'listbox'],
  listbox: ['listbox', 'combobox'],
  menuitem: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  table: ['table', 'grid', 'treegrid'],
  grid: ['grid', 'table', 'treegrid'],
  heading: ['heading'],
  status: ['status', 'log'],
};

/** The roles a hinted role admits: its family for textbox, checkbox, …; the role itself otherwise. */
export const rolesAdmittedBy = (role: string): readonly string[] => ADMITTED[role] ?? [role];

export const isAdmitted = (hint: string, role: string): boolean => rolesAdmittedBy(hint).includes(role);

/** Feedback text: alert/status/log regions and OutSystems .feedback-message nodes (a non-interactive generic). */
export const isMessage = (c: Candidate): boolean =>
  c.role === 'alert' || c.role === 'status' || c.role === 'log' || (c.role === 'generic' && !c.interactive);

/** A candidate that is itself a landmark node (not a control inside one). */
export const isLandmarkNode = (c: Candidate): boolean => LANDMARK_ROLES.has(c.role) && !c.interactive;

export interface LandmarkInstance {
  readonly role: string;
  readonly name: string;
  readonly key: string;
}

export interface IndexedCandidate {
  readonly candidate: Candidate;
  /** Document order in the snapshot. */
  readonly index: number;
  /** Enclosing landmarks, nearest first (never the candidate itself). */
  readonly landmarks: readonly LandmarkInstance[];
}

export interface RowGroup {
  /** The row's text as the snapshot reports it. */
  readonly text: string;
  /** The row node itself, when the snapshot kept it (the first, when several rows share the text). */
  readonly row: IndexedCandidate | null;
  /** Row nodes with this text; more than one means the text does not identify a row. */
  readonly rowCount: number;
  /** Candidates inside the row, in document order. */
  readonly members: readonly IndexedCandidate[];
}

export interface CandidateIndex {
  readonly all: readonly IndexedCandidate[];
  readonly byRef: ReadonlyMap<string, IndexedCandidate>;
  /** Distinct landmark instances of a role, in first-seen document order. */
  readonly landmarksOf: (role: string) => readonly LandmarkInstance[];
  /** Candidates enclosed (at any depth) by a landmark instance. */
  readonly within: (instance: LandmarkInstance) => readonly IndexedCandidate[];
  /** True when any candidate sits inside a landmark of the role. */
  readonly hasLandmark: (role: string) => boolean;
  /** True when the candidate sits inside a landmark of the role (at any depth). */
  readonly inLandmark: (entry: IndexedCandidate, role: string) => boolean;
  readonly rows: () => readonly RowGroup[];
}

const instance = (role: string, name: string | undefined): LandmarkInstance => {
  const n = name ?? '';
  return { role, name: n, key: `${role}\u0001${lowerNorm(n)}` };
};

/** Names are capped differently on landmark nodes and on their children, so a prefix counts as equal. */
const sameName = (a: string, b: string): boolean => {
  const x = lowerNorm(a);
  const y = lowerNorm(b);
  return x === y || (x.length >= 12 && y.length >= 12 && (x.startsWith(y) || y.startsWith(x)));
};

export const indexCandidates = (candidates: readonly Candidate[]): CandidateIndex => {
  const landmarkNodes = candidates.filter(isLandmarkNode);

  const nodeFor = (role: string, name: string): Candidate | null =>
    landmarkNodes.find((n) => n.role === role && sameName(n.name, name)) ??
    (name.length === 0 ? landmarkNodes.find((n) => n.role === role && n.name.length === 0) ?? null : null);

  const chainOf = (c: Candidate): readonly LandmarkInstance[] => {
    const chain: LandmarkInstance[] = [];
    const seen = new Set<string>();
    let role = c.landmark as string | undefined;
    let name = c.landmarkName;
    for (let depth = 0; role !== undefined && depth < 12; depth += 1) {
      const inst = instance(role, name);
      if (seen.has(inst.key)) break;
      seen.add(inst.key);
      chain.push(inst);
      const node = nodeFor(role, name ?? '');
      if (node === null || node === c) break;
      role = node.landmark;
      name = node.landmarkName;
    }
    return chain;
  };

  const all: IndexedCandidate[] = candidates.map((candidate, index) => ({ candidate, index, landmarks: chainOf(candidate) }));
  const byRef = new Map(all.map((entry) => [entry.candidate.ref, entry] as const));

  const landmarksOf = (role: string): readonly LandmarkInstance[] => {
    const found = new Map<string, LandmarkInstance>();
    for (const entry of all) {
      if (isLandmarkNode(entry.candidate) && entry.candidate.role === role) {
        const own = instance(role, entry.candidate.name);
        if (!found.has(own.key)) found.set(own.key, own);
      }
      for (const inst of entry.landmarks) {
        if (inst.role === role && !found.has(inst.key)) found.set(inst.key, inst);
      }
    }
    return [...found.values()];
  };

  const within = (inst: LandmarkInstance): readonly IndexedCandidate[] =>
    all.filter((entry) => entry.landmarks.some((l) => l.role === inst.role && (l.key === inst.key || sameName(l.name, inst.name))));

  const hasLandmark = (role: string): boolean => all.some((entry) => entry.landmarks.some((l) => l.role === role));

  const inLandmark = (entry: IndexedCandidate, role: string): boolean => entry.landmarks.some((l) => l.role === role);

  /**
   * Rows by text. A row node's name and its members' rowText are capped at
   * different lengths, so texts that agree on a long prefix are one row.
   * Two rows with identical text stay one group: indistinguishable by text,
   * they make any row-scoped match ambiguous, which is the honest answer.
   */
  const rowGroups: readonly RowGroup[] = (() => {
    type Group = { text: string; row: IndexedCandidate | null; rowCount: number; members: IndexedCandidate[] };
    const groups: Group[] = [];
    const groupFor = (text: string): Group => {
      const existing = groups.find((g) => sameName(g.text, text));
      if (existing !== undefined) return existing;
      const created: Group = { text, row: null, rowCount: 0, members: [] };
      groups.push(created);
      return created;
    };
    for (const entry of all) {
      const c = entry.candidate;
      if (c.role === 'row') {
        if (lowerNorm(c.name).length === 0) continue;
        const group = groupFor(c.name);
        if (group.row === null) group.row = entry;
        group.rowCount += 1;
      } else if (c.rowText !== undefined && c.rowText.length > 0) {
        groupFor(c.rowText).members.push(entry);
      }
    }
    return groups;
  })();

  const rows = (): readonly RowGroup[] => rowGroups;

  return { all, byRef, landmarksOf, within, hasLandmark, inLandmark, rows };
};

/** Form-like containers: named forms, the search landmark, and dialogs (an unnamed <form> is no landmark). */
export const FORM_LIKE_ROLES: readonly string[] = ['form', 'search', 'dialog'];
