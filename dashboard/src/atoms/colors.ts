/**
 * Shared color constants for the dashboard.
 * RUNG_COLORS lives in spatial/types.ts (used by both Three.js and HTML).
 * KIND_COLORS is work-item-kind specific.
 */

export const KIND_COLORS: Readonly<Record<string, string>> = {
  'interpret-step': '#f85149',
  'approve-proposal': '#58a6ff',
  'author-knowledge': '#3fb950',
  'investigate-hotspot': '#d29922',
  'validate-calibration': '#bc8cff',
  'request-rerun': '#79c0ff',
};
