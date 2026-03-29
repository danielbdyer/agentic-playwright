import { expect, test } from '@playwright/test';
import {
  KEY_BINDINGS,
  matchesBinding,
  getBindingsForMode,
  type InteractionMode,
  type KeyBinding,
} from '../dashboard/src/hooks/use-keyboard-shortcuts';

// ─── Helpers ───

/** Simulate a KeyboardEvent for testing matchesBinding. */
function fakeKeyEvent(
  key: string,
  opts?: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean },
): KeyboardEvent {
  return {
    key,
    ctrlKey: opts?.ctrlKey ?? false,
    shiftKey: opts?.shiftKey ?? false,
    altKey: opts?.altKey ?? false,
    metaKey: opts?.metaKey ?? false,
    preventDefault: () => {},
    target: { tagName: 'DIV', isContentEditable: false },
  } as unknown as KeyboardEvent;
}

test.describe('Keyboard shortcut controller laws', () => {

  test('Law 1: KEY_BINDINGS is non-empty and covers both modes', () => {
    expect(KEY_BINDINGS.length).toBeGreaterThan(0);
    const modes = new Set(KEY_BINDINGS.map((b) => b.mode));
    expect(modes.has('autopilot')).toBe(true);
    expect(modes.has('playback')).toBe(true);
    expect(modes.has('both')).toBe(true);
  });

  test('Law 2: all bindings have non-empty labels and descriptions', () => {
    KEY_BINDINGS.forEach((binding) => {
      expect(binding.label.length).toBeGreaterThan(0);
      expect(binding.description.length).toBeGreaterThan(0);
    });
  });

  test('Law 3: autopilot mode has act-jump keys 1-7', () => {
    const autopilotBindings = getBindingsForMode('autopilot');
    for (let i = 1; i <= 7; i++) {
      const actBinding = autopilotBindings.find((b) => b.key === String(i) && b.modifiers.length === 0);
      expect(actBinding, `Act ${i} binding should exist`).toBeDefined();
    }
  });

  test('Law 4: playback mode has Ctrl+1-9 bookmark slots', () => {
    const playbackBindings = getBindingsForMode('playback');
    for (let i = 1; i <= 9; i++) {
      const slotBinding = playbackBindings.find((b) =>
        b.key === String(i) && b.modifiers.includes('ctrl'));
      expect(slotBinding, `Bookmark slot ${i} binding should exist`).toBeDefined();
    }
  });

  test('Law 5: Space is bound in both autopilot and playback (but with different effects)', () => {
    const autopilot = getBindingsForMode('autopilot').filter((b) => b.key === 'Space');
    const playback = getBindingsForMode('playback').filter((b) => b.key === 'Space');
    expect(autopilot.length).toBeGreaterThan(0);
    expect(playback.length).toBeGreaterThan(0);
    // Different descriptions
    expect(autopilot[0]!.description).not.toBe(playback[0]!.description);
  });

  test('Law 6: M key toggles mode (bound in "both" mode)', () => {
    const mBinding = KEY_BINDINGS.find((b) => b.key === 'm' && b.mode === 'both');
    expect(mBinding).toBeDefined();
    expect(mBinding!.description).toContain('mode');
  });

  test('Law 7: matchesBinding correctly matches simple keys', () => {
    const binding: KeyBinding = { key: 'Space', modifiers: [], mode: 'autopilot', label: 'Space', description: 'test' };
    expect(matchesBinding(fakeKeyEvent(' '), binding)).toBe(true);
    expect(matchesBinding(fakeKeyEvent('a'), binding)).toBe(false);
  });

  test('Law 8: matchesBinding correctly matches modifier combinations', () => {
    const ctrlBinding: KeyBinding = { key: '1', modifiers: ['ctrl'], mode: 'playback', label: 'Ctrl+1', description: 'test' };
    expect(matchesBinding(fakeKeyEvent('1', { ctrlKey: true }), ctrlBinding)).toBe(true);
    expect(matchesBinding(fakeKeyEvent('1'), ctrlBinding)).toBe(false);
    expect(matchesBinding(fakeKeyEvent('1', { ctrlKey: true, shiftKey: true }), ctrlBinding)).toBe(false);
  });

  test('Law 9: matchesBinding rejects extra modifiers', () => {
    const plainBinding: KeyBinding = { key: '1', modifiers: [], mode: 'autopilot', label: '1', description: 'test' };
    expect(matchesBinding(fakeKeyEvent('1'), plainBinding)).toBe(true);
    expect(matchesBinding(fakeKeyEvent('1', { ctrlKey: true }), plainBinding)).toBe(false);
  });

  test('Law 10: matchesBinding handles Shift+Arrow for bookmark navigation', () => {
    const shiftLeftBinding: KeyBinding = { key: 'ArrowLeft', modifiers: ['shift'], mode: 'playback', label: 'Shift+←', description: 'test' };
    expect(matchesBinding(fakeKeyEvent('ArrowLeft', { shiftKey: true }), shiftLeftBinding)).toBe(true);
    expect(matchesBinding(fakeKeyEvent('ArrowLeft'), shiftLeftBinding)).toBe(false);
  });

  test('Law 11: getBindingsForMode includes "both" mode bindings', () => {
    const autopilotBindings = getBindingsForMode('autopilot');
    const playbackBindings = getBindingsForMode('playback');

    // The 'M' key (mode toggle) should be in both
    expect(autopilotBindings.some((b) => b.key === 'm')).toBe(true);
    expect(playbackBindings.some((b) => b.key === 'm')).toBe(true);
  });

  test('Law 12: playback mode has Home and End for seek-to-start/end', () => {
    const bindings = getBindingsForMode('playback');
    expect(bindings.some((b) => b.key === 'Home')).toBe(true);
    expect(bindings.some((b) => b.key === 'End')).toBe(true);
  });

  test('Law 13: autopilot mode has Escape for camera override release', () => {
    const bindings = getBindingsForMode('autopilot');
    const escBinding = bindings.find((b) => b.key === 'Escape');
    expect(escBinding).toBeDefined();
    expect(escBinding!.description).toContain('camera');
  });

  test('Law 14: playback mode has arrow keys for speed tier control', () => {
    const bindings = getBindingsForMode('playback');
    expect(bindings.some((b) => b.key === 'ArrowUp' && b.description.includes('speed'))).toBe(true);
    expect(bindings.some((b) => b.key === 'ArrowDown' && b.description.includes('speed'))).toBe(true);
  });

  test('Law 15: no duplicate key+modifier combinations within the same mode', () => {
    const modes: readonly InteractionMode[] = ['autopilot', 'playback'];
    modes.forEach((mode) => {
      const bindings = getBindingsForMode(mode);
      const seen = new Set<string>();
      bindings.forEach((b) => {
        const signature = `${b.key}+${b.modifiers.sort().join(',')}`;
        expect(seen.has(signature), `Duplicate binding in ${mode}: ${signature}`).toBe(false);
        seen.add(signature);
      });
    });
  });

  test('Law 16: autopilot has B for manual bookmark', () => {
    const bindings = getBindingsForMode('autopilot');
    const bBinding = bindings.find((b) => b.key === 'b');
    expect(bBinding).toBeDefined();
    expect(bBinding!.description).toContain('bookmark');
  });
});
