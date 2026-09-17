/**
 * ARIA snapshot parsing — the browser's accessibility tree as the
 * ground truth for roles and names (docs/v2-reactive-discovery-
 * handoff.md §3.1).
 *
 * Playwright's `locator.ariaSnapshot()` renders the tree as an
 * indented YAML-like list:
 *
 *     - banner:
 *       - link "Home"
 *       - navigation "Main":
 *         - menuitem "Products"
 *     - main:
 *       - searchbox "Search products"
 *       - button "Filter" [pressed]
 *       - text: Some content
 *
 * `parseAriaSnapshot` turns it into flat `{ role, name }` entries;
 * `summarizeAccessibility` folds those into the counts-only
 * `AccessibilitySummary` a SnapshotRecord carries, and scores how
 * often the walker's hand-rolled accname agreed with the browser's.
 * Names are used for the comparison and then dropped — never
 * persisted (PII discipline).
 *
 * Pure. No Playwright import; the harness hands in the string.
 */

import type { AccessibilitySummary, SnapshotNode } from './snapshot-record';

export interface AriaEntry {
  readonly role: string;
  readonly name: string | null;
}

/** Roles Playwright's `getByRole` treats as interactive controls —
 *  the set the handoff's §6 table counts. Closed here so the N4 law
 *  can check every observed member is a `SurfaceRole`. */
export const AX_INTERACTIVE_ROLES: readonly string[] = [
  'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab',
  'searchbox', 'textbox', 'spinbutton', 'checkbox', 'radio', 'combobox',
  'option', 'switch', 'slider', 'treeitem',
];

const ENTRY_RE = /^\s*-\s+([a-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?/;

/** Parse the snapshot into flat entries. Lines that are not role
 *  entries (`- text: …`, `- /children: …`) are skipped. Escaped
 *  quotes inside names are unescaped. */
export function parseAriaSnapshot(snapshot: string): readonly AriaEntry[] {
  return snapshot
    .split('\n')
    .flatMap((line) => {
      const m = ENTRY_RE.exec(line);
      if (m === null || m[1] === 'text') return [];
      const role = m[1]!;
      const name = m[2] === undefined ? null : m[2].replace(/\\(.)/g, '$1');
      return [{ role, name }];
    });
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Fold entries + the walker's nodes into the counts-only summary.
 *  Agreement: over walker nodes that are interactive AND carry an
 *  accessible name, how many have a name that the AX tree produced
 *  for some interactive entry (multiset membership, case-sensitive,
 *  whitespace-collapsed). */
export function summarizeAccessibility(
  entries: readonly AriaEntry[],
  walkerNodes: readonly SnapshotNode[],
): AccessibilitySummary {
  const interactiveSet = new Set(AX_INTERACTIVE_ROLES);
  const interactive = entries.filter((e) => interactiveSet.has(e.role));
  const interactiveRoles = interactive.reduce<Record<string, number>>(
    (acc, e) => ({ ...acc, [e.role]: (acc[e.role] ?? 0) + 1 }),
    {},
  );
  const axNames = new Set(
    interactive.flatMap((e) => (e.name !== null && collapse(e.name).length > 0 ? [collapse(e.name)] : [])),
  );
  const named = walkerNodes.filter(
    (n) => n.interaction.interactive && n.ariaNaming.accessibleName !== null && collapse(n.ariaNaming.accessibleName).length > 0,
  );
  const agreed = named.filter((n) => axNames.has(collapse(n.ariaNaming.accessibleName!))).length;
  return {
    interactiveTotal: interactive.length,
    unnamedInteractive: interactive.filter((e) => e.name === null || collapse(e.name).length === 0).length,
    interactiveRoles,
    walkerNameAgreement: { compared: named.length, agreed },
  };
}
