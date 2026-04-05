/**
 * ScenarioCloud — 3D visualization of scenario cards during Acts 1 and 3.
 *
 * Act 1 (Context Intake): Scenarios materialize as translucent cards in a
 * loose cloud. Cards with shared screen references drift toward each other
 * (affinity clustering). The cloud self-organizes by the same affinity
 * signals that later drive Suite Slice selection.
 *
 * Act 3 (Suite Slicing): The cloud morphs into a ranked vertical list.
 * A selection boundary sweeps down — selected scenarios pulse green,
 * deferred scenarios fade gray and dissolve.
 *
 * Architecture:
 *   ScenarioCloudState (pure domain) — positions, affinities, selection state
 *   ScenarioCloud (R3F component) — renders InstancedMesh with per-card transforms
 *
 * This module contains the pure domain logic. The R3F component is kept thin.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 1), Part I (Act 3), Part VIII
 */

import type { FlywheelAct } from '../../../lib/domain/observation/contracts';

// ─── Domain Types ───

/** A scenario card in the cloud. */
export interface ScenarioCard {
  readonly id: string;
  readonly adoId: string;
  readonly title: string;
  readonly screenRefs: readonly string[];
  readonly priority: number;
  readonly selected: boolean;
}

/** Layout mode determines how cards are arranged. */
export type CloudLayout = 'cloud' | 'list' | 'dissolving';

/** Per-card computed position and visual state. */
export interface CardVisualState {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly opacity: number;
  readonly scale: number;
  readonly tint: 'neutral' | 'green' | 'gray';
}

/** Full cloud state snapshot. */
export interface ScenarioCloudState {
  readonly layout: CloudLayout;
  readonly cards: readonly ScenarioCard[];
  readonly visuals: readonly CardVisualState[];
  readonly cloudRadius: number;
  readonly selectionBoundaryY: number | null; // null when not slicing
}

// ─── Constants ───

/** Maximum cards rendered (performance safety). */
export const MAX_CLOUD_CARDS = 200;

/** Cloud arrangement parameters. */
const CLOUD_SPREAD_RADIUS = 2.0;
const CLOUD_CENTER: readonly [number, number, number] = [0, 0, 0];
const LIST_X = -2.5;
const LIST_Y_START = 1.5;
const LIST_Y_SPACING = 0.12;

// ─── Affinity Clustering ───

/**
 * Compute affinity score between two scenarios based on shared screen references.
 * Pure. O(n×m) where n, m are screen ref counts.
 */
export function scenarioAffinity(a: ScenarioCard, b: ScenarioCard): number {
  if (a.screenRefs.length === 0 || b.screenRefs.length === 0) return 0;
  const shared = a.screenRefs.filter((ref) => b.screenRefs.includes(ref)).length;
  const total = new Set([...a.screenRefs, ...b.screenRefs]).size;
  return total > 0 ? shared / total : 0;
}

/**
 * Assign cloud positions with affinity clustering.
 * Cards sharing screen references drift toward each other.
 *
 * Uses a simple force-directed approach:
 *   1. Start with evenly-spaced positions on a sphere
 *   2. Apply affinity attraction (cards with shared screens cluster)
 *   3. Apply repulsion (prevent overlap)
 *
 * Pure. Returns new positions array.
 */
export function computeCloudPositions(
  cards: readonly ScenarioCard[],
  radius: number = CLOUD_SPREAD_RADIUS,
): readonly (readonly [number, number, number])[] {
  const count = Math.min(cards.length, MAX_CLOUD_CARDS);
  if (count === 0) return [];

  // Golden angle spiral for even sphere distribution
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const basePositions: Array<readonly [number, number, number]> = [];

  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * i) / (count - 1 || 1); // -1 to 1
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    basePositions[i] = [
      CLOUD_CENTER[0] + x * radius,
      CLOUD_CENTER[1] + y * radius,
      CLOUD_CENTER[2] + z * radius * 0.3, // Flatten depth
    ];
  }

  // Apply single iteration of affinity attraction
  return basePositions.map((pos, i) => {
    const card = cards[i]!;
    let dx = 0, dy = 0, dz = 0;
    let affinityCount = 0;

    for (let j = 0; j < count; j++) {
      if (i === j) continue;
      const aff = scenarioAffinity(card, cards[j]!);
      if (aff > 0.3) {
        const other = basePositions[j]!;
        dx += (other[0] - pos[0]) * aff * 0.2;
        dy += (other[1] - pos[1]) * aff * 0.2;
        dz += (other[2] - pos[2]) * aff * 0.2;
        affinityCount++;
      }
    }

    if (affinityCount === 0) return pos;
    return [pos[0] + dx, pos[1] + dy, pos[2] + dz] as const;
  });
}

/**
 * Compute list positions for ranked display (Act 3).
 * Cards ordered by priority, laid out vertically.
 */
export function computeListPositions(
  cards: readonly ScenarioCard[],
): readonly (readonly [number, number, number])[] {
  const count = Math.min(cards.length, MAX_CLOUD_CARDS);
  const sorted = [...cards].sort((a, b) => a.priority - b.priority);

  return sorted.map((_, i) => [
    LIST_X,
    LIST_Y_START - i * LIST_Y_SPACING,
    0,
  ] as const);
}

// ─── State Transitions ───

/**
 * Create initial cloud state from a set of scenario cards.
 */
export function createCloudState(cards: readonly ScenarioCard[]): ScenarioCloudState {
  const capped = cards.slice(0, MAX_CLOUD_CARDS);
  const positions = computeCloudPositions(capped);

  const visuals: readonly CardVisualState[] = capped.map((card, i) => ({
    id: card.id,
    position: positions[i] ?? [0, 0, 0],
    opacity: 1.0,
    scale: 1.0,
    tint: 'neutral' as const,
  }));

  return {
    layout: 'cloud',
    cards: capped,
    visuals,
    cloudRadius: CLOUD_SPREAD_RADIUS,
    selectionBoundaryY: null,
  };
}

/**
 * Transition cloud to list layout (Act 1 → Act 3).
 * Cards rearrange by priority; no selection yet.
 */
export function transitionToList(state: ScenarioCloudState): ScenarioCloudState {
  const sorted = [...state.cards].sort((a, b) => a.priority - b.priority);
  const positions = computeListPositions(sorted);

  const visuals: readonly CardVisualState[] = sorted.map((card, i) => ({
    id: card.id,
    position: positions[i] ?? [0, 0, 0],
    opacity: 1.0,
    scale: 1.0,
    tint: 'neutral' as const,
  }));

  return {
    ...state,
    layout: 'list',
    cards: sorted,
    visuals,
    selectionBoundaryY: LIST_Y_START + 0.1, // Just above first card
  };
}

/**
 * Apply suite-slice selection to the list.
 * Selected cards glow green, deferred fade gray.
 *
 * @param state Current cloud state in 'list' layout
 * @param selectedIds Set of ADO IDs that were selected
 * @returns Updated state with selection visuals
 */
export function applySelection(
  state: ScenarioCloudState,
  selectedIds: ReadonlySet<string>,
): ScenarioCloudState {
  const visuals: readonly CardVisualState[] = state.visuals.map((v) => {
    const card = state.cards.find((c) => c.id === v.id);
    if (!card) return v;
    const isSelected = selectedIds.has(card.adoId);
    return {
      ...v,
      tint: isSelected ? 'green' as const : 'gray' as const,
      opacity: isSelected ? 1.0 : 0.4,
      scale: isSelected ? 1.0 : 0.8,
    };
  });

  return { ...state, visuals };
}

/**
 * Transition to dissolving state — deferred scenarios fade out.
 * Called when transitioning from Act 3 → Act 4.
 *
 * @param state Current state with selection applied
 * @param progress Dissolution progress [0, 1]
 * @returns Updated state with dissolving visuals
 */
export function applyDissolution(
  state: ScenarioCloudState,
  progress: number,
): ScenarioCloudState {
  const clampedProgress = Math.max(0, Math.min(1, progress));

  const visuals: readonly CardVisualState[] = state.visuals.map((v) => {
    if (v.tint === 'gray') {
      // Deferred cards dissolve
      return {
        ...v,
        opacity: Math.max(0, 0.4 * (1 - clampedProgress)),
        scale: 0.8 * (1 - clampedProgress * 0.5),
      };
    }
    // Selected cards compress toward queue position
    return {
      ...v,
      position: [
        v.position[0] + clampedProgress * (LIST_X + 0.5 - v.position[0]),
        LIST_Y_START + 0.5,
        v.position[2],
      ] as const,
      scale: 1.0 - clampedProgress * 0.3, // Shrink into queue
    };
  });

  return {
    ...state,
    layout: 'dissolving',
    visuals,
  };
}

/**
 * Derive the appropriate cloud state for a given act.
 * Pure convenience for the choreographer.
 */
export function cloudStateForAct(
  cards: readonly ScenarioCard[],
  act: FlywheelAct,
  selectedIds?: ReadonlySet<string>,
): ScenarioCloudState {
  switch (act) {
    case 1:
    case 2:
      return createCloudState(cards);
    case 3: {
      const listState = transitionToList(createCloudState(cards));
      return selectedIds ? applySelection(listState, selectedIds) : listState;
    }
    default:
      // Acts 4+ — cloud dissolved, return empty-opacity state
      return applyDissolution(
        applySelection(
          transitionToList(createCloudState(cards)),
          selectedIds ?? new Set(),
        ),
        1.0,
      );
  }
}
