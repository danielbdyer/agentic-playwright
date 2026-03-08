import type { ScreenElements, ScreenHints, ScreenPostures, SurfaceGraph } from '../types';

export interface ScreenBundle {
  screen: SurfaceGraph['screen'];
  surfaceGraph: SurfaceGraph;
  elements: ScreenElements;
  hints: ScreenHints | null;
  postures: ScreenPostures | null;
  mergedElements: ScreenElements['elements'];
}

export function mergeScreenElementsWithHints(elements: ScreenElements, hints: ScreenHints | null): ScreenElements['elements'] {
  if (!hints) {
    return elements.elements;
  }

  return Object.fromEntries(
    Object.entries(elements.elements).map(([elementId, element]) => {
      const hint = hints.elements[elementId];
      return [elementId, {
        ...element,
        affordance: element.affordance ?? hint?.affordance ?? null,
      }];
    }),
  );
}

export function createScreenBundle(input: {
  surfaceGraph: SurfaceGraph;
  elements: ScreenElements;
  hints?: ScreenHints | null | undefined;
  postures?: ScreenPostures | null | undefined;
}): ScreenBundle {
  const hints = input.hints ?? null;
  const postures = input.postures ?? null;
  return {
    screen: input.surfaceGraph.screen,
    surfaceGraph: input.surfaceGraph,
    elements: input.elements,
    hints,
    postures,
    mergedElements: mergeScreenElementsWithHints(input.elements, hints),
  };
}
