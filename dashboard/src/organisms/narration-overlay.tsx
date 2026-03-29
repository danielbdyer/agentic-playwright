/** NarrationOverlay — renders narration captions as HTML overlays above the Three.js canvas. */

import { memo } from 'react';
import type { NarrationCaption } from '../hooks/use-narration-queue';

interface CaptionWithPhase extends NarrationCaption {
  readonly phase: string;
  readonly opacity: number;
}

export interface NarrationOverlayProps {
  readonly captions: readonly CaptionWithPhase[];
}

const POSITION_CLASSES: Record<string, string> = {
  'top-center': 'top-[5%] left-1/2 -translate-x-1/2',
  'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'bottom-center': 'bottom-[10%] left-1/2 -translate-x-1/2',
  'screen-plane-top': 'top-[10%] left-1/4',
  'screen-plane-bottom': 'bottom-[20%] left-1/4',
  'screen-plane-center': 'top-1/2 left-1/4 -translate-y-1/2',
  'observatory': 'top-[30%] right-[10%]',
  'glass-pane': 'top-[40%] left-[48%]',
  'pipeline-timeline': 'bottom-[15%] left-1/2 -translate-x-1/2',
  'workbench': 'bottom-[10%] left-1/2 -translate-x-1/2',
};

const EMPHASIS_CLASSES: Record<string, string> = {
  normal: 'text-sm bg-black/60 text-white rounded-md px-4 py-2',
  highlight: 'text-base font-medium bg-black/70 text-white rounded-md px-5 py-3',
  milestone: 'text-lg font-bold bg-black/80 text-emerald-300 rounded-lg px-6 py-4 shadow-lg shadow-emerald-500/20',
};

export const NarrationOverlay = memo(function NarrationOverlay({ captions }: NarrationOverlayProps) {
  if (captions.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {captions.map((caption) => (
        <div
          key={caption.id}
          className={`absolute transition-opacity ${POSITION_CLASSES[caption.position] ?? ''} ${EMPHASIS_CLASSES[caption.emphasis] ?? EMPHASIS_CLASSES.normal}`}
          style={{ opacity: caption.opacity }}
        >
          {caption.text}
        </div>
      ))}
    </div>
  );
});
