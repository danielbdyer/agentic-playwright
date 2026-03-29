/**
 * SettingsPanel — organism component for 9 configurable visualization settings.
 *
 * The settings panel provides live-preview controls for the flywheel
 * visualization. All settings are stored as pure state — the panel
 * only reads and writes through callbacks, no side effects.
 *
 * Configurable items (from spec Part VI):
 *   1. Narration enabled (boolean toggle)
 *   2. Narration verbosity (minimal / normal / verbose)
 *   3. Bloom intensity (0.0 - 2.0 slider)
 *   4. Particle density (0.25 - 2.0 slider)
 *   5. Glass pane visible (boolean toggle)
 *   6. Ambient brightness (0.1 - 1.0 slider)
 *   7. Camera speed (0.5 - 3.0 slider)
 *   8. Auto-camera (boolean toggle)
 *   9. Decision timeout (0 - 300s, 0 = infinite)
 *
 * @see docs/first-day-flywheel-visualization.md Part VI: Settings Panel
 */

// ─── Settings Types (Pure Domain) ───

import type { NarrationVerbosity } from '../hooks/use-narration-queue';

/** Complete settings state. All fields are readonly. */
export interface VisualizationSettings {
  readonly narrationEnabled: boolean;
  readonly narrationVerbosity: NarrationVerbosity;
  readonly bloomIntensity: number;     // [0.0, 2.0]
  readonly particleDensity: number;    // [0.25, 2.0]
  readonly glassPaneVisible: boolean;
  readonly ambientBrightness: number;  // [0.1, 1.0]
  readonly cameraSpeed: number;        // [0.5, 3.0]
  readonly autoCamera: boolean;
  readonly decisionTimeoutSeconds: number; // [0, 300], 0 = infinite
}

/** Default settings values. */
export const DEFAULT_SETTINGS: VisualizationSettings = {
  narrationEnabled: true,
  narrationVerbosity: 'normal',
  bloomIntensity: 1.0,
  particleDensity: 1.0,
  glassPaneVisible: true,
  ambientBrightness: 0.5,
  cameraSpeed: 1.0,
  autoCamera: true,
  decisionTimeoutSeconds: 0,
};

// ─── Setting Descriptors ───

/** Metadata for each setting — used for rendering the panel. */
export interface SettingDescriptor {
  readonly key: keyof VisualizationSettings;
  readonly label: string;
  readonly description: string;
  readonly type: 'boolean' | 'slider' | 'select';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly options?: readonly string[];
  readonly format?: (value: number) => string;
}

export const SETTING_DESCRIPTORS: readonly SettingDescriptor[] = [
  {
    key: 'narrationEnabled',
    label: 'Narration',
    description: 'Show contextual captions during the visualization',
    type: 'boolean',
  },
  {
    key: 'narrationVerbosity',
    label: 'Verbosity',
    description: 'How detailed the narration captions are',
    type: 'select',
    options: ['minimal', 'normal', 'verbose'],
  },
  {
    key: 'bloomIntensity',
    label: 'Bloom',
    description: 'Post-processing bloom glow intensity',
    type: 'slider',
    min: 0.0,
    max: 2.0,
    step: 0.1,
    format: (v) => `${v.toFixed(1)}×`,
  },
  {
    key: 'particleDensity',
    label: 'Particles',
    description: 'Particle density for transport and probe effects',
    type: 'slider',
    min: 0.25,
    max: 2.0,
    step: 0.25,
    format: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: 'glassPaneVisible',
    label: 'Glass Pane',
    description: 'Show the governance glass boundary between DOM and observatory',
    type: 'boolean',
  },
  {
    key: 'ambientBrightness',
    label: 'Ambient',
    description: 'Scene ambient light brightness',
    type: 'slider',
    min: 0.1,
    max: 1.0,
    step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'cameraSpeed',
    label: 'Camera Speed',
    description: 'How fast camera transitions between acts',
    type: 'slider',
    min: 0.5,
    max: 3.0,
    step: 0.25,
    format: (v) => `${v.toFixed(1)}×`,
  },
  {
    key: 'autoCamera',
    label: 'Auto Camera',
    description: 'Camera follows the automated choreography',
    type: 'boolean',
  },
  {
    key: 'decisionTimeoutSeconds',
    label: 'Decision Timeout',
    description: 'Auto-skip decisions after this many seconds (0 = never)',
    type: 'slider',
    min: 0,
    max: 300,
    step: 15,
    format: (v) => v === 0 ? '∞' : `${v}s`,
  },
] as const;

// ─── Validation ───

/** Validate and clamp a single setting value. Pure. */
export function validateSetting(
  key: keyof VisualizationSettings,
  value: unknown,
): unknown {
  const descriptor = SETTING_DESCRIPTORS.find((d) => d.key === key);
  if (!descriptor) return value;

  if (descriptor.type === 'boolean') {
    return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key];
  }

  if (descriptor.type === 'select') {
    return descriptor.options?.includes(value as string)
      ? value
      : DEFAULT_SETTINGS[key];
  }

  if (descriptor.type === 'slider' && typeof value === 'number') {
    const min = descriptor.min ?? 0;
    const max = descriptor.max ?? 1;
    return Math.max(min, Math.min(max, value));
  }

  return DEFAULT_SETTINGS[key];
}

/** Validate all settings — returns a new object with all values clamped/defaulted. Pure. */
export function validateAllSettings(
  settings: Partial<VisualizationSettings>,
): VisualizationSettings {
  return {
    narrationEnabled: validateSetting('narrationEnabled', settings.narrationEnabled) as boolean,
    narrationVerbosity: validateSetting('narrationVerbosity', settings.narrationVerbosity) as NarrationVerbosity,
    bloomIntensity: validateSetting('bloomIntensity', settings.bloomIntensity) as number,
    particleDensity: validateSetting('particleDensity', settings.particleDensity) as number,
    glassPaneVisible: validateSetting('glassPaneVisible', settings.glassPaneVisible) as boolean,
    ambientBrightness: validateSetting('ambientBrightness', settings.ambientBrightness) as number,
    cameraSpeed: validateSetting('cameraSpeed', settings.cameraSpeed) as number,
    autoCamera: validateSetting('autoCamera', settings.autoCamera) as boolean,
    decisionTimeoutSeconds: validateSetting('decisionTimeoutSeconds', settings.decisionTimeoutSeconds) as number,
  };
}

/**
 * Apply a single setting change, returning a new settings object.
 * The new value is validated before applying.
 */
export function applySetting<K extends keyof VisualizationSettings>(
  settings: VisualizationSettings,
  key: K,
  value: VisualizationSettings[K],
): VisualizationSettings {
  const validated = validateSetting(key, value);
  return { ...settings, [key]: validated };
}

/**
 * Reset all settings to defaults.
 */
export function resetToDefaults(): VisualizationSettings {
  return { ...DEFAULT_SETTINGS };
}

// ─── Serialization ───

/** Serialize settings to a plain JSON object for persistence. */
export function serializeSettings(settings: VisualizationSettings): string {
  return JSON.stringify(settings);
}

/** Deserialize settings from JSON, validating all values. */
export function deserializeSettings(json: string): VisualizationSettings {
  try {
    const parsed = JSON.parse(json) as Partial<VisualizationSettings>;
    return validateAllSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}
