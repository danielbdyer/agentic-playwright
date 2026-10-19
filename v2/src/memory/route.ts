/**
 * A screen's route: where it lives (relative to the profile baseURL) and the
 * structural summary of the page fingerprint its facets were minted against,
 * so memory.preflight can say what drifted — "landmark search missing",
 * "button 3 → 1" — instead of only that the hash changed.
 */
import { ToolError } from '../core/errors.js';
import type { PageFingerprint } from '../contract/schemas.js';
import type { RouteSummary } from './types.js';

/** ARIA widget roles: the ones a test acts on. A summary counts only these, so content churn does not read as drift. */
export const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'option', 'slider', 'spinbutton', 'treeitem',
]);

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Route URLs are stored relative to the profile baseURL with no leading
 * slash: Playwright resolves `goto('/X')` against the origin and drops the
 * baseURL's path, and OutSystems apps live under `/<Module>/`.
 */
export const normalizeRouteUrl = (url: string): string => {
  const trimmed = url.trim();
  if (trimmed.length === 0) throw new ToolError('invalid-input', 'route url must not be empty');
  return ABSOLUTE.test(trimmed) ? trimmed : trimmed.replace(/^\/+/, '');
};

/** Make an absolute page URL relative to a baseURL when it lives under it; otherwise keep it absolute. */
export const routeUrlRelativeTo = (absoluteUrl: string, baseURL: string): string => {
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  if (absoluteUrl === baseURL || absoluteUrl === base) return '';
  return absoluteUrl.startsWith(base) ? absoluteUrl.slice(base.length) : absoluteUrl;
};

export const summaryFromFingerprint = (fingerprint: Pick<PageFingerprint, 'landmarks' | 'roleCounts' | 'dataBlocks'>): RouteSummary => ({
  landmarks: [...new Set(fingerprint.landmarks)].sort(),
  interactiveRoles: Object.fromEntries(
    Object.entries(fingerprint.roleCounts)
      .filter(([role, count]) => INTERACTIVE_ROLES.has(role) && count > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ),
  dataBlocks: fingerprint.dataBlocks,
});

export interface RouteDrift {
  readonly changed: boolean;
  readonly diff: readonly string[];
}

/**
 * Has the screen drifted from the fingerprint its facets were recorded
 * against? With a stored summary, drift means a structural difference
 * (landmarks, interactive role counts, data-block count), so copy and
 * content changes that move the hash do not mark every screen stale; with
 * only a stored hash, any hash change is drift. No stored fingerprint, no drift.
 */
export const routeDrift = (
  route: { readonly fingerprint?: string; readonly summary?: RouteSummary } | undefined,
  current: Pick<PageFingerprint, 'hash' | 'landmarks' | 'roleCounts' | 'dataBlocks'>,
): RouteDrift => {
  if (route === undefined) return { changed: false, diff: [] };
  if (route.summary !== undefined) {
    const diff = diffSummaries(route.summary, summaryFromFingerprint(current));
    return { changed: diff.length > 0, diff };
  }
  if (route.fingerprint === undefined || route.fingerprint === current.hash) return { changed: false, diff: [] };
  return { changed: true, diff: ['page fingerprint hash changed (no structural summary was recorded to compare)'] };
};

/** Human-readable differences from the recorded summary to the current one; empty when they agree. */
export const diffSummaries = (before: RouteSummary, after: RouteSummary): string[] => {
  const beforeLandmarks = new Set(before.landmarks);
  const afterLandmarks = new Set(after.landmarks);
  const roles = [...new Set([...Object.keys(before.interactiveRoles), ...Object.keys(after.interactiveRoles)])].sort();
  return [
    ...[...beforeLandmarks].filter((l) => !afterLandmarks.has(l)).sort().map((l) => `landmark ${l} missing`),
    ...[...afterLandmarks].filter((l) => !beforeLandmarks.has(l)).sort().map((l) => `landmark ${l} added`),
    ...roles.flatMap((role) => {
      const was = before.interactiveRoles[role] ?? 0;
      const now = after.interactiveRoles[role] ?? 0;
      return was === now ? [] : [`${role} ${was} → ${now}`];
    }),
    ...(before.dataBlocks === after.dataBlocks ? [] : [`data-blocks ${before.dataBlocks} → ${after.dataBlocks}`]),
  ];
};
