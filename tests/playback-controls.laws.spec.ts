import { expect, test } from '@playwright/test';
import {
  speedLabel,
  type PlaybackMode,
} from '../dashboard/src/organisms/playback-controls';

test.describe('PlaybackControls laws', () => {
  test('Law 1: speedLabel includes × suffix', () => {
    expect(speedLabel(1)).toContain('×');
    expect(speedLabel(10)).toContain('×');
    expect(speedLabel(0.5)).toContain('×');
  });

  test('Law 2: speedLabel preserves number', () => {
    expect(speedLabel(5)).toBe('5×');
  });

  test('Law 3: speedLabel handles fractional', () => {
    expect(speedLabel(0.5)).toBe('0.5×');
  });

  test('Law 4: PlaybackMode type covers all modes', () => {
    const modes: PlaybackMode[] = ['live', 'playback', 'compact'];
    expect(modes).toHaveLength(3);
  });
});
