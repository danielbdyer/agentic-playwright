import { expect, test } from '@playwright/test';
import {
  DEFAULT_SETTINGS,
  SETTING_DESCRIPTORS,
  validateSetting,
  validateAllSettings,
  applySetting,
  resetToDefaults,
  serializeSettings,
  deserializeSettings,
  type VisualizationSettings,
} from '../dashboard/src/organisms/settings-panel';

test.describe('SettingsPanel laws', () => {

  test('Law 1: exactly 9 setting descriptors defined', () => {
    expect(SETTING_DESCRIPTORS).toHaveLength(9);
  });

  test('Law 2: all descriptor keys exist in DEFAULT_SETTINGS', () => {
    SETTING_DESCRIPTORS.forEach((d) => {
      expect(d.key in DEFAULT_SETTINGS).toBe(true);
    });
  });

  test('Law 3: DEFAULT_SETTINGS has narration enabled', () => {
    expect(DEFAULT_SETTINGS.narrationEnabled).toBe(true);
  });

  test('Law 4: DEFAULT_SETTINGS has autoCamera enabled', () => {
    expect(DEFAULT_SETTINGS.autoCamera).toBe(true);
  });

  test('Law 5: validateSetting clamps slider values', () => {
    expect(validateSetting('bloomIntensity', 5.0)).toBe(2.0);
    expect(validateSetting('bloomIntensity', -1.0)).toBe(0.0);
    expect(validateSetting('bloomIntensity', 1.5)).toBe(1.5);
  });

  test('Law 6: validateSetting returns default for invalid boolean', () => {
    expect(validateSetting('narrationEnabled', 'not-a-bool')).toBe(true); // default
  });

  test('Law 7: validateSetting validates select options', () => {
    expect(validateSetting('narrationVerbosity', 'minimal')).toBe('minimal');
    expect(validateSetting('narrationVerbosity', 'invalid')).toBe('normal'); // default
  });

  test('Law 8: validateAllSettings produces valid settings from partial', () => {
    const partial = { bloomIntensity: 1.5 };
    const validated = validateAllSettings(partial);
    expect(validated.bloomIntensity).toBe(1.5);
    expect(validated.narrationEnabled).toBe(true); // default
    expect(validated.cameraSpeed).toBe(1.0); // default
  });

  test('Law 9: validateAllSettings handles empty object', () => {
    const validated = validateAllSettings({});
    expect(validated).toEqual(DEFAULT_SETTINGS);
  });

  test('Law 10: applySetting returns new object with updated value', () => {
    const updated = applySetting(DEFAULT_SETTINGS, 'bloomIntensity', 1.8);
    expect(updated.bloomIntensity).toBe(1.8);
    expect(updated.narrationEnabled).toBe(true); // Unchanged
    expect(updated).not.toBe(DEFAULT_SETTINGS); // New object
  });

  test('Law 11: applySetting validates the new value', () => {
    const updated = applySetting(DEFAULT_SETTINGS, 'bloomIntensity', 99);
    expect(updated.bloomIntensity).toBe(2.0); // Clamped
  });

  test('Law 12: resetToDefaults returns DEFAULT_SETTINGS copy', () => {
    const reset = resetToDefaults();
    expect(reset).toEqual(DEFAULT_SETTINGS);
    expect(reset).not.toBe(DEFAULT_SETTINGS); // New object
  });

  test('Law 13: serialize/deserialize round-trips', () => {
    const custom: VisualizationSettings = {
      ...DEFAULT_SETTINGS,
      bloomIntensity: 1.5,
      narrationVerbosity: 'verbose',
      decisionTimeoutSeconds: 60,
    };
    const json = serializeSettings(custom);
    const deserialized = deserializeSettings(json);
    expect(deserialized).toEqual(custom);
  });

  test('Law 14: deserializeSettings returns defaults for invalid JSON', () => {
    const result = deserializeSettings('not-json');
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  test('Law 15: decision timeout range is 0-300', () => {
    expect(validateSetting('decisionTimeoutSeconds', -10)).toBe(0);
    expect(validateSetting('decisionTimeoutSeconds', 500)).toBe(300);
    expect(validateSetting('decisionTimeoutSeconds', 120)).toBe(120);
  });

  test('Law 16: each descriptor has a label and description', () => {
    SETTING_DESCRIPTORS.forEach((d) => {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
    });
  });
});
