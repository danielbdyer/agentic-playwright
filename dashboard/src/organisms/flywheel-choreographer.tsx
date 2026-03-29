/**
 * FlywheelChoreographer — thin composition shell that conditionally renders
 * flywheel-specific overlay components when flywheel mode is active.
 *
 * Intentionally minimal for now — it will grow as more spatial components
 * (PlaybackControls, ActIndicator, etc.) are built.
 */

import React from 'react';
import { useFlywheelContext } from './flywheel-provider';
import { NarrationOverlay } from './narration-overlay';

export interface FlywheelChoreographerProps {
  readonly children: React.ReactNode;
}

export function FlywheelChoreographer({ children }: FlywheelChoreographerProps) {
  const ctx = useFlywheelContext();

  if (!ctx.enabled) return <>{children}</>;

  return (
    <div className="relative w-full h-full">
      {children}
      <NarrationOverlay captions={ctx.narration.activeCaptions} />
      {/* Future: PlaybackControls, ActIndicator, etc. */}
    </div>
  );
}
