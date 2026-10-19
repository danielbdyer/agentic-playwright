/**
 * The keys `press` accepts. v1 pressed whatever word the step text left
 * behind ("Submit"), which Playwright rejects only after the fact; here a key
 * is checked before anything touches the page, and the common spellings a
 * test author writes ("esc", "return", "page down", "ctrl+a") are normalized
 * to Playwright's names so the emitted test uses the canonical form.
 */

/** Named keys a QA test plausibly presses. Single characters are accepted separately. */
export const NAMED_KEYS = [
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Insert', 'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
] as const;

/** Modifiers may stand alone or prefix a key ("Shift+Tab"). ControlOrMeta is Playwright's portable Ctrl/Cmd. */
export const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'ControlOrMeta'] as const;

export type NamedKey = (typeof NAMED_KEYS)[number];
export type ModifierKey = (typeof MODIFIER_KEYS)[number];

/** Spellings authors use, keyed by the folded form (lowercase, no spaces, hyphens, or underscores). */
const ALIASES: Readonly<Record<string, string>> = {
  esc: 'Escape',
  return: 'Enter',
  del: 'Delete',
  ins: 'Insert',
  spacebar: 'Space',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  uparrow: 'ArrowUp',
  downarrow: 'ArrowDown',
  leftarrow: 'ArrowLeft',
  rightarrow: 'ArrowRight',
  pgup: 'PageUp',
  pgdn: 'PageDown',
  pgdown: 'PageDown',
  ctrl: 'Control',
  cmd: 'Meta',
  command: 'Meta',
  win: 'Meta',
  windows: 'Meta',
  option: 'Alt',
  mod: 'ControlOrMeta',
  ctrlormeta: 'ControlOrMeta',
  ctrlorcmd: 'ControlOrMeta',
};

const fold = (text: string): string => text.toLowerCase().replace(/[\s_-]+/g, '');

const CANONICAL: ReadonlyMap<string, string> = new Map(
  [...NAMED_KEYS, ...MODIFIER_KEYS].map((key) => [fold(key), key] as const),
);

const MODIFIERS: ReadonlySet<string> = new Set(MODIFIER_KEYS);

/**
 * Split a combination the way Playwright does: "+" separates keys, except
 * that a "+" with nothing before it is the plus key itself ("Shift++").
 */
const splitCombination = (keyString: string): readonly string[] => {
  const parts: string[] = [];
  let building = '';
  for (const char of keyString) {
    if (char === '+' && building.length > 0) {
      parts.push(building);
      building = '';
    } else {
      building += char;
    }
  }
  parts.push(building);
  return parts;
};

/**
 * One printable character: Playwright types any single UTF-16 unit it does
 * not know by name, so "a", "A", "1", "/" and "+" are all valid keys.
 */
const isSingleCharacter = (part: string): boolean => part.length === 1 && !/[\u0000-\u001f\u007f]/.test(part);

const canonicalPart = (part: string): string | null => {
  if (isSingleCharacter(part)) return part;
  const folded = fold(part);
  if (folded.length === 0) return null;
  return ALIASES[folded] ?? CANONICAL.get(folded) ?? null;
};

/**
 * The canonical Playwright key string for an author's spelling, or null when
 * it is not a key: "enter" → "Enter", "ctrl+a" → "Control+a",
 * "Shift + Tab" → "Shift+Tab", "Submit" → null.
 */
export const normalizeKey = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return raw === ' ' ? ' ' : null;
  // Spaces around "+" are author noise ("Shift + Tab"); a lone "+" is the plus key.
  const compact = trimmed === '+' ? '+' : trimmed.replace(/\s*\+\s*/g, '+');
  const parts = splitCombination(compact);
  const canonical = parts.map(canonicalPart);
  if (canonical.some((part) => part === null)) return null;
  const keys = canonical as readonly string[];
  // Every part before the last must be a modifier: "a+b" is not a chord.
  if (keys.slice(0, -1).some((key) => !MODIFIERS.has(key))) return null;
  return keys.join('+');
};

export const isKnownKey = (raw: string): boolean => normalizeKey(raw) !== null;

/** For error messages: what the caller could have said instead. */
export const describeAllowedKeys = (): string =>
  `${[...NAMED_KEYS.filter((key) => !/^F\d+$/.test(key)), 'F1-F12', ...MODIFIER_KEYS].join(', ')}, a single character, or a chord such as "Control+a" or "Shift+Tab"`;
