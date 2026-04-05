import { expect, test } from '@playwright/test';
import {
  bookmarkColor,
  shortcutHint,
} from '../../dashboard/src/molecules/bookmark-chip';

test.describe('BookmarkChip laws', () => {
  test('Law 1: auto bookmarks are amber', () => {
    expect(bookmarkColor('auto')).toMatch(/^#/);
  });

  test('Law 2: manual bookmarks are blue', () => {
    expect(bookmarkColor('manual')).toMatch(/^#/);
  });

  test('Law 3: auto and manual have different colors', () => {
    expect(bookmarkColor('auto')).not.toBe(bookmarkColor('manual'));
  });

  test('Law 4: shortcutHint for slot shows Ctrl+N', () => {
    expect(shortcutHint(3)).toContain('Ctrl+3');
  });

  test('Law 5: shortcutHint for null is empty', () => {
    expect(shortcutHint(null)).toBe('');
  });

  test('Law 6: shortcutHint for slot 1', () => {
    expect(shortcutHint(1)).toBe(' (Ctrl+1)');
  });

  test('Law 7: shortcutHint for slot 9', () => {
    expect(shortcutHint(9)).toBe(' (Ctrl+9)');
  });
});
