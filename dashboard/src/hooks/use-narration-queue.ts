/**
 * useNarrationQueue — manages a queue of narration captions that overlay the
 * Three.js canvas with contextual descriptions of what the system is doing.
 *
 * Captions flow through a lifecycle: fade-in → visible → fade-out → removed.
 * At most `maxVisible` captions (default 2) are rendered simultaneously.
 * Uses requestAnimationFrame for smooth opacity animation.
 */

import { useState, useEffect, useRef } from 'react';

/** Caption position on screen. */
export type CaptionPosition =
  | 'top-center' | 'center' | 'bottom-center'
  | 'screen-plane-top' | 'screen-plane-bottom' | 'screen-plane-center'
  | 'observatory' | 'glass-pane' | 'pipeline-timeline' | 'workbench';

/** Emphasis level determines font size and visual treatment. */
export type CaptionEmphasis = 'normal' | 'highlight' | 'milestone';

/** Narration verbosity setting. */
export type NarrationVerbosity = 'minimal' | 'normal' | 'verbose';

export interface NarrationCaption {
  readonly id: string;
  readonly text: string;
  readonly position: CaptionPosition;
  readonly durationMs: number;
  readonly emphasis: CaptionEmphasis;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

/** A caption in flight with its current animation phase and opacity. */
export type ActiveCaption = NarrationCaption & {
  readonly phase: 'fade-in' | 'visible' | 'fade-out';
  readonly opacity: number;
};

export interface NarrationQueueState {
  /** Currently visible captions (max 2 at once). */
  readonly activeCaptions: readonly ActiveCaption[];
  /** Queue a new caption for display. */
  readonly queueCaption: (caption: Omit<NarrationCaption, 'id'>) => void;
  /** Queue a caption with default settings. */
  readonly narrate: (text: string, position?: CaptionPosition, emphasis?: CaptionEmphasis) => void;
  /** Clear all active captions immediately. */
  readonly clearAll: () => void;
  /** Whether narration is enabled. */
  readonly enabled: boolean;
  /** Toggle narration on/off. */
  readonly toggleEnabled: () => void;
}

interface InternalCaption {
  readonly id: string;
  readonly text: string;
  readonly position: CaptionPosition;
  readonly durationMs: number;
  readonly emphasis: CaptionEmphasis;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly startTime: number;
}

const DEFAULT_DURATIONS: Record<CaptionEmphasis, number> = {
  normal: 4000,
  highlight: 5000,
  milestone: 8000,
};

const DEFAULT_FADE_IN: Record<CaptionEmphasis, number> = {
  normal: 300,
  highlight: 300,
  milestone: 500,
};

const DEFAULT_FADE_OUT: Record<CaptionEmphasis, number> = {
  normal: 500,
  highlight: 500,
  milestone: 800,
};

const computePhaseAndOpacity = (
  caption: InternalCaption,
  now: number,
): { readonly phase: 'fade-in' | 'visible' | 'fade-out' | 'done'; readonly opacity: number } => {
  const elapsed = now - caption.startTime;

  if (elapsed < caption.fadeInMs) {
    return { phase: 'fade-in', opacity: elapsed / caption.fadeInMs };
  }

  const visibleEnd = caption.fadeInMs + caption.durationMs;
  if (elapsed < visibleEnd) {
    return { phase: 'visible', opacity: 1 };
  }

  const fadeOutEnd = visibleEnd + caption.fadeOutMs;
  if (elapsed < fadeOutEnd) {
    const fadeOutElapsed = elapsed - visibleEnd;
    return { phase: 'fade-out', opacity: 1 - fadeOutElapsed / caption.fadeOutMs };
  }

  return { phase: 'done', opacity: 0 };
};

export function useNarrationQueue(options?: {
  readonly enabled?: boolean;
  readonly verbosity?: NarrationVerbosity;
  readonly maxVisible?: number;
}): NarrationQueueState {
  const maxVisible = options?.maxVisible ?? 2;

  const [enabled, setEnabled] = useState(options?.enabled ?? true);
  const [activeCaptions, setActiveCaptions] = useState<readonly ActiveCaption[]>([]);

  const internalsRef = useRef<readonly InternalCaption[]>([]);
  const counterRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const animate = () => {
    const now = performance.now();
    const internals = internalsRef.current;

    const projected: readonly ActiveCaption[] = internals.reduce<readonly ActiveCaption[]>(
      (acc, caption) => {
        const { phase, opacity } = computePhaseAndOpacity(caption, now);
        return phase === 'done'
          ? acc
          : [
              ...acc,
              {
                id: caption.id,
                text: caption.text,
                position: caption.position,
                durationMs: caption.durationMs,
                emphasis: caption.emphasis,
                fadeInMs: caption.fadeInMs,
                fadeOutMs: caption.fadeOutMs,
                phase: phase as 'fade-in' | 'visible' | 'fade-out',
                opacity,
              },
            ];
      },
      [],
    );

    // Prune completed captions from the internal list
    const surviving = internals.filter((c) => {
      const { phase } = computePhaseAndOpacity(c, now);
      return phase !== 'done';
    });
    internalsRef.current = surviving;

    setActiveCaptions(projected);

    if (surviving.length > 0) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      rafRef.current = null;
    }
  };

  const startLoop = () => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(animate);
    }
  };

  const queueCaption = (caption: Omit<NarrationCaption, 'id'>) => {
      if (!enabled) return;

      counterRef.current += 1;
      const id = `narration-${counterRef.current}`;
      const now = performance.now();

      const internal: InternalCaption = {
        id,
        text: caption.text,
        position: caption.position,
        durationMs: caption.durationMs,
        emphasis: caption.emphasis,
        fadeInMs: caption.fadeInMs,
        fadeOutMs: caption.fadeOutMs,
        startTime: now,
      };

      // Enforce maxVisible: if adding would exceed limit, force-expire oldest
      const current = internalsRef.current.filter((c) => {
        const { phase } = computePhaseAndOpacity(c, now);
        return phase !== 'done';
      });

      const trimmed =
        current.length >= maxVisible ? current.slice(current.length - maxVisible + 1) : current;

      internalsRef.current = [...trimmed, internal];
      startLoop();
    };

  const narrate = (text: string, position: CaptionPosition = 'bottom-center', emphasis: CaptionEmphasis = 'normal') => {
      queueCaption({
        text,
        position,
        emphasis,
        durationMs: DEFAULT_DURATIONS[emphasis],
        fadeInMs: DEFAULT_FADE_IN[emphasis],
        fadeOutMs: DEFAULT_FADE_OUT[emphasis],
      });
    };

  const clearAll = () => {
    internalsRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setActiveCaptions([]);
  };

  const toggleEnabled = () => {
    setEnabled((prev) => {
      if (prev) {
        // Disabling — clear everything
        internalsRef.current = [];
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setActiveCaptions([]);
      }
      return !prev;
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return { activeCaptions, queueCaption, narrate, clearAll, enabled, toggleEnabled };
}
