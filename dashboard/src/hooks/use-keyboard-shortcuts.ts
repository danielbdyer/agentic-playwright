/**
 * useKeyboardShortcuts — centralized keyboard handler for flywheel visualization.
 *
 * Manages two interaction modes from the spec:
 *
 *   Autopilot mode (observation):
 *     Space         — toggle narration
 *     1-7           — jump camera to act N
 *     N             — cycle narration verbosity
 *     D             — toggle degradation auto/manual
 *     B             — add manual bookmark
 *     Escape        — release camera override
 *
 *   Playback mode (time-lapse):
 *     Space         — play/pause
 *     Left/Right    — seek ±10 seconds
 *     Shift+L/R     — seek to prev/next bookmark
 *     Up/Down       — change speed tier
 *     Ctrl+1-9      — jump to bookmarked moment
 *     Home          — seek to beginning
 *     End           — seek to end / live edge
 *     R             — toggle playback direction (not implemented yet)
 *
 * The hook attaches a single keydown listener to the document and
 * dispatches to the appropriate handler based on mode and key combo.
 * All handlers are passed in as a command map — no side effects
 * in this module beyond event listener registration.
 *
 * @see docs/first-day-flywheel-visualization.md Part VI
 */

import { useEffect, useRef } from 'react';
import type { FlywheelAct } from '../types';

// ─── Interaction Mode ───

export type InteractionMode = 'autopilot' | 'playback';

// ─── Command Map ───

/**
 * Commands the keyboard controller can dispatch.
 * All are optional — unregistered commands are silently ignored.
 */
export interface KeyboardCommands {
  // ── Autopilot ──
  readonly toggleNarration?: () => void;
  readonly jumpToAct?: (act: FlywheelAct) => void;
  readonly cycleVerbosity?: () => void;
  readonly toggleDegradation?: () => void;
  readonly addBookmark?: () => void;
  readonly releaseCameraOverride?: () => void;

  // ── Playback ──
  readonly togglePlayPause?: () => void;
  readonly seekRelative?: (deltaMs: number) => void;
  readonly seekToBookmark?: (direction: 'prev' | 'next') => void;
  readonly changeSpeedTier?: (direction: 'up' | 'down') => void;
  readonly jumpToBookmarkSlot?: (slot: number) => void;
  readonly seekToStart?: () => void;
  readonly seekToEnd?: () => void;

  // ── Both modes ──
  readonly toggleMode?: () => void;
}

// ─── Key Binding Descriptors ───

export interface KeyBinding {
  readonly key: string;
  readonly modifiers: readonly ('ctrl' | 'shift' | 'alt' | 'meta')[];
  readonly mode: InteractionMode | 'both';
  readonly label: string;
  readonly description: string;
}

/** Complete catalog of keyboard shortcuts from the spec. */
export const KEY_BINDINGS: readonly KeyBinding[] = [
  // Autopilot
  { key: 'Space',    modifiers: [],        mode: 'autopilot', label: 'Space',    description: 'Toggle narration' },
  { key: '1',        modifiers: [],        mode: 'autopilot', label: '1',        description: 'Jump camera to Act 1' },
  { key: '2',        modifiers: [],        mode: 'autopilot', label: '2',        description: 'Jump camera to Act 2' },
  { key: '3',        modifiers: [],        mode: 'autopilot', label: '3',        description: 'Jump camera to Act 3' },
  { key: '4',        modifiers: [],        mode: 'autopilot', label: '4',        description: 'Jump camera to Act 4' },
  { key: '5',        modifiers: [],        mode: 'autopilot', label: '5',        description: 'Jump camera to Act 5' },
  { key: '6',        modifiers: [],        mode: 'autopilot', label: '6',        description: 'Jump camera to Act 6' },
  { key: '7',        modifiers: [],        mode: 'autopilot', label: '7',        description: 'Jump camera to Act 7' },
  { key: 'n',        modifiers: [],        mode: 'autopilot', label: 'N',        description: 'Cycle narration verbosity' },
  { key: 'd',        modifiers: [],        mode: 'autopilot', label: 'D',        description: 'Toggle degradation auto/manual' },
  { key: 'b',        modifiers: [],        mode: 'autopilot', label: 'B',        description: 'Add manual bookmark' },
  { key: 'Escape',   modifiers: [],        mode: 'autopilot', label: 'Esc',      description: 'Release camera override' },

  // Playback
  { key: 'Space',    modifiers: [],        mode: 'playback',  label: 'Space',    description: 'Play/Pause' },
  { key: 'ArrowLeft',  modifiers: [],      mode: 'playback',  label: '←',        description: 'Seek back 10 seconds' },
  { key: 'ArrowRight', modifiers: [],      mode: 'playback',  label: '→',        description: 'Seek forward 10 seconds' },
  { key: 'ArrowLeft',  modifiers: ['shift'], mode: 'playback', label: 'Shift+←',  description: 'Seek to previous bookmark' },
  { key: 'ArrowRight', modifiers: ['shift'], mode: 'playback', label: 'Shift+→',  description: 'Seek to next bookmark' },
  { key: 'ArrowUp',    modifiers: [],      mode: 'playback',  label: '↑',        description: 'Increase speed tier' },
  { key: 'ArrowDown',  modifiers: [],      mode: 'playback',  label: '↓',        description: 'Decrease speed tier' },
  { key: '1',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+1',   description: 'Jump to bookmark slot 1' },
  { key: '2',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+2',   description: 'Jump to bookmark slot 2' },
  { key: '3',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+3',   description: 'Jump to bookmark slot 3' },
  { key: '4',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+4',   description: 'Jump to bookmark slot 4' },
  { key: '5',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+5',   description: 'Jump to bookmark slot 5' },
  { key: '6',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+6',   description: 'Jump to bookmark slot 6' },
  { key: '7',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+7',   description: 'Jump to bookmark slot 7' },
  { key: '8',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+8',   description: 'Jump to bookmark slot 8' },
  { key: '9',        modifiers: ['ctrl'],  mode: 'playback',  label: 'Ctrl+9',   description: 'Jump to bookmark slot 9' },
  { key: 'Home',     modifiers: [],        mode: 'playback',  label: 'Home',     description: 'Seek to beginning' },
  { key: 'End',      modifiers: [],        mode: 'playback',  label: 'End',      description: 'Seek to end / live edge' },

  // Both
  { key: 'm',        modifiers: [],        mode: 'both',      label: 'M',        description: 'Toggle autopilot/playback mode' },
] as const;

// ─── Key Matching ───

/** Check if a keyboard event matches a key binding. Pure. */
export function matchesBinding(event: KeyboardEvent, binding: KeyBinding): boolean {
  // Normalize key comparison
  const eventKey = event.key === ' ' ? 'Space' : event.key;
  if (eventKey !== binding.key) return false;

  // Check modifiers
  const needsCtrl = binding.modifiers.includes('ctrl');
  const needsShift = binding.modifiers.includes('shift');
  const needsAlt = binding.modifiers.includes('alt');
  const needsMeta = binding.modifiers.includes('meta');

  return (
    event.ctrlKey === needsCtrl &&
    event.shiftKey === needsShift &&
    event.altKey === needsAlt &&
    event.metaKey === needsMeta
  );
}

/** Get all bindings that apply in a given mode. Pure. */
export function getBindingsForMode(mode: InteractionMode): readonly KeyBinding[] {
  return KEY_BINDINGS.filter((b) => b.mode === mode || b.mode === 'both');
}

// ─── Seek delta constant ───
const SEEK_DELTA_MS = 10_000; // 10 seconds

// ─── Hook ───

export interface KeyboardShortcutOptions {
  /** Current interaction mode. */
  readonly mode: InteractionMode;
  /** Whether keyboard shortcuts are enabled. */
  readonly enabled?: boolean;
  /** Command handlers to dispatch to. */
  readonly commands: KeyboardCommands;
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions): void {
  const { mode, enabled = true, commands } = options;
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const cmds = commandsRef.current;
      const currentMode = modeRef.current;

      // Find matching bindings for current mode
      const bindings = getBindingsForMode(currentMode);

      for (const binding of bindings) {
        if (!matchesBinding(event, binding)) continue;

        event.preventDefault();
        dispatchBinding(binding, cmds, currentMode);
        return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}

// ─── Command Dispatch ───

function dispatchBinding(
  binding: KeyBinding,
  commands: KeyboardCommands,
  mode: InteractionMode,
): void {
  // Both-mode commands
  if (binding.key === 'm' && binding.modifiers.length === 0) {
    commands.toggleMode?.();
    return;
  }

  if (mode === 'autopilot') {
    dispatchAutopilot(binding, commands);
  } else {
    dispatchPlayback(binding, commands);
  }
}

function dispatchAutopilot(binding: KeyBinding, commands: KeyboardCommands): void {
  if (binding.key === 'Space') {
    commands.toggleNarration?.();
    return;
  }

  // Number keys 1-7 for act jump
  const actNum = parseInt(binding.key, 10);
  if (actNum >= 1 && actNum <= 7 && binding.modifiers.length === 0) {
    commands.jumpToAct?.(actNum as FlywheelAct);
    return;
  }

  if (binding.key === 'n') {
    commands.cycleVerbosity?.();
    return;
  }

  if (binding.key === 'd') {
    commands.toggleDegradation?.();
    return;
  }

  if (binding.key === 'b') {
    commands.addBookmark?.();
    return;
  }

  if (binding.key === 'Escape') {
    commands.releaseCameraOverride?.();
    return;
  }
}

function dispatchPlayback(binding: KeyBinding, commands: KeyboardCommands): void {
  if (binding.key === 'Space') {
    commands.togglePlayPause?.();
    return;
  }

  if (binding.key === 'ArrowLeft' && binding.modifiers.includes('shift')) {
    commands.seekToBookmark?.('prev');
    return;
  }

  if (binding.key === 'ArrowRight' && binding.modifiers.includes('shift')) {
    commands.seekToBookmark?.('next');
    return;
  }

  if (binding.key === 'ArrowLeft') {
    commands.seekRelative?.(-SEEK_DELTA_MS);
    return;
  }

  if (binding.key === 'ArrowRight') {
    commands.seekRelative?.(SEEK_DELTA_MS);
    return;
  }

  if (binding.key === 'ArrowUp') {
    commands.changeSpeedTier?.('up');
    return;
  }

  if (binding.key === 'ArrowDown') {
    commands.changeSpeedTier?.('down');
    return;
  }

  // Ctrl+1-9 for bookmark slots
  if (binding.modifiers.includes('ctrl')) {
    const slot = parseInt(binding.key, 10);
    if (slot >= 1 && slot <= 9) {
      commands.jumpToBookmarkSlot?.(slot);
      return;
    }
  }

  if (binding.key === 'Home') {
    commands.seekToStart?.();
    return;
  }

  if (binding.key === 'End') {
    commands.seekToEnd?.();
    return;
  }
}
