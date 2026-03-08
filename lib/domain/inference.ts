import { normalizeHtmlText } from './hash';
import type { ScreenElements, ScreenHints, ScreenPostures, SharedPatterns, SurfaceGraph } from './types';

export interface InferenceKnowledge {
  surfaceGraphs: Record<string, SurfaceGraph>;
  screenElements: Record<string, ScreenElements>;
  screenHints: Record<string, ScreenHints>;
  screenPostures: Record<string, ScreenPostures>;
  sharedPatterns: SharedPatterns;
}

export function normalizeIntentText(value: string): string {
  return normalizeHtmlText(value).toLowerCase();
}
