/**
 * Key names for "press" steps. v1 pressed whatever word followed "press"
 * ("Press the Submit button" became keyboard.press('Submit'), which
 * Playwright rejects). Here a step is a key press only when the words name
 * a real key; anything else is a click on a control with that name.
 */

const NAMED_KEYS = [
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Insert', 'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
] as const;

const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'ControlOrMeta'] as const;

const fold = (text: string): string => text.toLowerCase().replace(/[\s_-]+/g, '');

/** Spellings authors use, keyed by the folded form. */
const ALIASES: Readonly<Record<string, string>> = {
  esc: 'Escape',
  return: 'Enter',
  enterkey: 'Enter',
  del: 'Delete',
  ins: 'Insert',
  spacebar: 'Space',
  bksp: 'Backspace',
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
  ctrlorcmd: 'ControlOrMeta',
};

const CANONICAL: ReadonlyMap<string, string> = new Map(
  [...NAMED_KEYS, ...MODIFIER_KEYS].map((key) => [fold(key), key] as const),
);

const MODIFIERS: ReadonlySet<string> = new Set(MODIFIER_KEYS);

/** One key word (or a two-word spelling such as "page down") to Playwright's name, or null. */
export const canonicalKey = (word: string): string | null => {
  const folded = fold(word);
  if (folded.length === 0) return null;
  return CANONICAL.get(folded) ?? ALIASES[folded] ?? null;
};

/** "Ctrl+S", "Shift + Tab" → "Control+s"-style combinations; null unless every part is a key. */
const parseCombination = (text: string): string | null => {
  const parts = text.split(/\s*\+\s*/).filter((part) => part.length > 0);
  if (parts.length < 2) return null;
  const keys = parts.map((part, index) => {
    const named = canonicalKey(part);
    if (named !== null) return named;
    // The last part may be a single printable character ("Ctrl+A").
    return index === parts.length - 1 && [...part].length === 1 ? part : null;
  });
  if (keys.some((key) => key === null)) return null;
  const resolved = keys as string[];
  // Every part but the last must be a modifier.
  if (resolved.slice(0, -1).some((key) => !MODIFIERS.has(key))) return null;
  return resolved.join('+');
};

export interface KeyReading {
  readonly key: string;
  /** What followed the key words ("to submit the form", "in the search field"). */
  readonly rest: string;
}

/**
 * Read a key from the words after "press" / "hit". Returns null when the
 * words do not name a key, or when they name a control ("the Enter
 * button"), in which case the step is a click.
 */
export const readKey = (words: string): KeyReading | null => {
  const text = words.trim().replace(/^(?:the|a|an)\s+/i, '');
  const combo = /^([A-Za-z0-9]+(?:\s*\+\s*[A-Za-z0-9]+)+)(?:\s+(?:keys?|combination|shortcut))?\b\s*(.*)$/i.exec(text);
  if (combo !== null) {
    const key = parseCombination(combo[1] ?? '');
    // "Ctrl+Submit" is not a key and not a single key followed by words either.
    return key === null ? null : { key, rest: (combo[2] ?? '').trim() };
  }
  const match = /^([A-Za-z0-9]+)(?:[\s-]+([A-Za-z0-9]+))?(.*)$/.exec(text);
  if (match === null) return null;
  const first = match[1] ?? '';
  const second = match[2];
  const tail = match[3] ?? '';
  const twoWord = second === undefined ? null : canonicalKey(`${first}${second}`);
  const key = twoWord ?? canonicalKey(first) ?? ([...first].length === 1 ? first : null);
  if (key === null) return null;
  const rest = (twoWord !== null ? tail : `${second === undefined ? '' : ` ${second}`}${tail}`).trim();
  // "the Enter key", "Enter on the keyboard" are keys; "the Enter button" is a control named Enter.
  if (/^(?:button|btn|link|tab|icon|option|menu|item|field)\b/i.test(rest)) return null;
  const afterKeyWord = rest.replace(/^(?:keys?|button\s+on\s+the\s+keyboard)\b\s*/i, '').replace(/^on\s+(?:the\s+|your\s+)?keyboard\b\s*/i, '');
  return { key, rest: afterKeyWord.trim() };
};
