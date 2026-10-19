/**
 * One user action on a live page, so the next step sees the real state.
 *
 * What v1 got wrong and this fixes:
 * - v1 looked the Playwright method up by name and called it detached
 *   (`locator[action](...)`), so `this` was undefined and every real action
 *   failed with "Cannot read properties of undefined (reading '_frame')".
 *   Here an explicit switch calls each Locator method on the locator.
 * - v1 ran its pre-checks outside the try, where Playwright's strict-mode
 *   errors escaped the result type. Here every page-side failure, including
 *   the pre-checks, is caught and returned with an error family.
 * - v1 never checked "exactly one visible element". Here the target must be
 *   unique among visible matches before anything happens.
 *
 * Input mistakes (no target for a click, no value for a fill) are the
 * caller's to fix and throw ToolError('invalid-input'); everything that
 * happens on the page comes back as `{ outcome: 'failed', family, message }`.
 */
import type { Locator, Page } from '@playwright/test';
import { ToolError, type ErrorFamily } from '../core/errors.js';
import { classifyPlaywrightError } from './classify.js';
import { describeAllowedKeys, normalizeKey } from './keys.js';
import { describeLocator, resolveUnique, settleVisible, type MatchCounts } from './verify.js';

export const ACTIONS = ['click', 'fill', 'select', 'check', 'uncheck', 'press', 'hover', 'navigate'] as const;
export type Action = (typeof ACTIONS)[number];

export const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
/** Ceiling for the enabled/editable pre-checks; the element is known to exist by then. */
const PRECHECK_TIMEOUT_MS = 2_000;
/** How long a just-opened custom dropdown gets to render its options before we try typing. */
const OPTIONS_APPEAR_MS = 1_500;
/** Smallest timeout handed to Playwright: 0 would mean "wait forever". */
const MIN_STEP_TIMEOUT_MS = 250;

/**
 * How a `select` was carried out: a native `<select>` is one `selectOption`
 * call; a custom OutSystems dropdown is a click on the combobox and a click on
 * the option (with typing in between when the list only renders matches for
 * typed text). Reported in app.act's output; the emitted page-object helper
 * replays the same steps without needing this record.
 */
export interface SelectPath {
  readonly via: 'native' | 'listbox' | 'combobox';
  /** native: which attribute of the option matched the requested value. */
  readonly matchedBy?: 'label' | 'value';
  /** combobox: the value had to be typed before the option appeared. */
  readonly typed?: boolean;
  /**
   * combobox, when typed: into the combobox itself (an editable input), or
   * into whatever had focus after opening it (a DropdownSearch-style popup
   * with its own search box; the emitter replays this as keyboard typing).
   */
  readonly typedInto?: 'combobox' | 'focused';
  /** combobox: id of the popup (from aria-controls/aria-owns) the option was found in. */
  readonly listboxId?: string;
}

export interface ActionSucceeded {
  readonly outcome: 'succeeded';
  /**
   * Match counts for the target's locator. `total > visible` means hidden
   * twins exist: the action used the visible one, and an emitted locator
   * without a visibility filter would hit a strict-mode violation.
   */
  readonly matches?: MatchCounts;
  /** press: the canonical key that was pressed. */
  readonly key?: string;
  readonly select?: SelectPath;
}

export interface ActionFailed {
  readonly outcome: 'failed';
  readonly family: ErrorFamily;
  readonly message: string;
  readonly matches?: MatchCounts;
}

export type ActionResult = ActionSucceeded | ActionFailed;

export interface ActionOptions {
  readonly timeoutMs?: number;
}

/** A deadline shared by every Playwright call one action makes, so the whole action honours timeoutMs. */
interface Budget {
  readonly remaining: () => number;
}

const budgetOf = (timeoutMs: number): Budget => {
  const deadline = Date.now() + timeoutMs;
  return { remaining: () => Math.max(MIN_STEP_TIMEOUT_MS, deadline - Date.now()) };
};

const succeeded = (fields: Omit<ActionSucceeded, 'outcome'> = {}): ActionSucceeded => ({ outcome: 'succeeded', ...fields });

const failed = (family: ErrorFamily, message: string, matches?: MatchCounts): ActionFailed =>
  matches === undefined ? { outcome: 'failed', family, message } : { outcome: 'failed', family, message, matches };

const countsFromDetail = (error: unknown): MatchCounts | undefined => {
  if (!(error instanceof ToolError) || error.detail === undefined) return undefined;
  const { total, visible } = error.detail;
  return typeof total === 'number' && typeof visible === 'number' ? { total, visible } : undefined;
};

const failedFrom = (error: unknown): ActionFailed => {
  const { family, message } = classifyPlaywrightError(error);
  return failed(family, message, countsFromDetail(error));
};

const requireLocator = (locator: Locator | null, action: Action): Locator => {
  if (locator === null) throw new ToolError('invalid-input', `${action} needs a target`, { action });
  return locator;
};

const requireValue = (value: string | undefined, action: Action, what: string): string => {
  if (value === undefined) throw new ToolError('invalid-input', `${action} needs ${what} in value`, { action });
  return value;
};

const requireNonEmpty = (value: string | undefined, action: Action, what: string): string => {
  const text = requireValue(value, action, what);
  if (text.length === 0) throw new ToolError('invalid-input', `${action} needs a non-empty ${what}`, { action });
  return text;
};

interface Prechecks {
  readonly enabled: boolean;
  readonly editable?: boolean;
}

type Run = () => Promise<ActionResult>;

/**
 * Settle, require exactly one visible match, run the pre-checks, then act on
 * the visible-filtered locator. The pre-checks turn "Playwright would retry a
 * disabled button until the timeout" into an immediate, named failure.
 */
const onUniqueTarget = (
  locator: Locator,
  budget: Budget,
  prechecks: Prechecks,
  act: (target: Locator, matches: MatchCounts) => Promise<ActionResult>,
): Run => async () => {
  const description = describeLocator(locator);
  await settleVisible(locator, budget.remaining());
  const { locator: target, matches } = await resolveUnique(locator, description);
  const precheckTimeout = Math.min(PRECHECK_TIMEOUT_MS, budget.remaining());
  if (prechecks.enabled && !(await target.isEnabled({ timeout: precheckTimeout }))) {
    return failed('not-enabled', `${description} is disabled`, matches);
  }
  if (prechecks.editable === true && !(await target.isEditable({ timeout: precheckTimeout }))) {
    return failed('not-enabled', `${description} is read-only`, matches);
  }
  return act(target, matches);
};

// ─── select ────────────────────────────────────────────────────────────────

interface NativeOption {
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
}

/** The options of a native <select> (or of the select a <label> points at); null for anything else. */
const nativeOptions = (target: Locator, timeout: number): Promise<readonly NativeOption[] | null> =>
  target.evaluate(
    (element) => {
      const select =
        element instanceof HTMLSelectElement
          ? element
          : element instanceof HTMLLabelElement && element.control instanceof HTMLSelectElement
            ? element.control
            : null;
      if (select === null) return null;
      return Array.from(select.options).map((option) => ({ label: option.label, value: option.value, disabled: option.disabled }));
    },
    undefined,
    { timeout },
  );

const listOptions = (labels: readonly string[]): string => {
  const shown = labels.slice(0, 12).map((label) => JSON.stringify(label)).join(', ');
  return labels.length > 12 ? `${shown}, … (${labels.length} in all)` : shown;
};

const selectNative = async (
  target: Locator,
  options: readonly NativeOption[],
  choice: string,
  matches: MatchCounts,
  budget: Budget,
): Promise<ActionResult> => {
  const description = describeLocator(target);
  // Label first: the ADO step names what the user sees, not the stored value.
  const byLabel = options.find((option) => option.label === choice);
  const byValue = byLabel === undefined ? options.find((option) => option.value === choice) : undefined;
  const chosen = byLabel ?? byValue;
  if (chosen === undefined) {
    return failed('assertion-like', `${description} has no option labelled or valued ${JSON.stringify(choice)}; options: ${listOptions(options.map((o) => o.label))}`, matches);
  }
  if (chosen.disabled) {
    return failed('not-enabled', `option ${JSON.stringify(choice)} of ${description} is disabled`, matches);
  }
  await target.selectOption(byLabel !== undefined ? { label: choice } : { value: choice }, { timeout: budget.remaining() });
  return succeeded({ matches, select: { via: 'native', matchedBy: byLabel !== undefined ? 'label' : 'value' } });
};

const optionNamed = (root: Page | Locator, choice: string): Locator => root.getByRole('option', { name: choice, exact: true });

/** True when some visible match appears within the budget. */
const appears = async (locator: Locator, timeoutMs: number): Promise<boolean> => {
  await settleVisible(locator, timeoutMs);
  return (await locator.filter({ visible: true }).count()) > 0;
};

/**
 * Where a combobox renders its options: the element named by aria-controls
 * or aria-owns when it exists (popups are often portalled to <body>), else
 * the whole page.
 */
const popupOf = async (page: Page, combobox: Locator, timeout: number): Promise<{ readonly root: Page | Locator; readonly id?: string }> => {
  // Some dropdowns swap the trigger for a search box when opened; if the
  // trigger is gone, fall back to searching the whole page.
  const ids = await combobox
    .evaluate(
      (element) => `${element.getAttribute('aria-controls') ?? ''} ${element.getAttribute('aria-owns') ?? ''}`.split(/\s+/).filter((id) => id.length > 0),
      undefined,
      { timeout },
    )
    .catch((): readonly string[] => []);
  for (const id of ids) {
    const popup = page.locator(`[id=${JSON.stringify(id)}]`);
    if ((await popup.count()) === 1) return { root: popup, id };
  }
  return { root: page };
};

/**
 * Whether an element takes typed text. Not Playwright's isEditable: that is
 * true for any element whose role allows aria-readonly, including a
 * `div[role=combobox]`, which fill() then rejects.
 */
const acceptsText = (locator: Locator, timeout: number): Promise<boolean> =>
  locator
    .evaluate(
      (element) => {
        if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
        if (element instanceof HTMLInputElement) {
          const nonText = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'hidden', 'range', 'color'];
          return !element.readOnly && !element.disabled && !nonText.includes(element.type);
        }
        return element instanceof HTMLElement && element.isContentEditable;
      },
      undefined,
      { timeout },
    )
    .catch(() => false);

/**
 * Type the value so a filtering dropdown renders the option: into the
 * combobox when it is a text field, else into whatever opening it focused
 * (DropdownSearch puts the caret in a search box inside the popup).
 */
const typeToFilter = async (page: Page, combobox: Locator, choice: string, budget: Budget): Promise<'combobox' | 'focused' | undefined> => {
  const timeout = Math.min(PRECHECK_TIMEOUT_MS, budget.remaining());
  if (await acceptsText(combobox, timeout)) {
    await combobox.fill(choice, { timeout: budget.remaining() });
    return 'combobox';
  }
  const focused = page.locator('*:focus');
  if ((await focused.count()) === 1 && (await acceptsText(focused, timeout))) {
    await focused.fill(choice, { timeout: budget.remaining() });
    return 'focused';
  }
  return undefined;
};

/**
 * Custom dropdowns (OutSystems Dropdown / DropdownSearch, ARIA comboboxes,
 * listboxes): pick an option by its accessible name. If the target already
 * contains the option (an open listbox), click it; otherwise open the target
 * and click the option in its popup, typing the value first when the list
 * only renders options that match typed text (virtualized search lists).
 */
const selectCustom = async (page: Page, target: Locator, choice: string, matches: MatchCounts, budget: Budget): Promise<ActionResult> => {
  const description = describeLocator(target);
  const inside = optionNamed(target, choice).filter({ visible: true });
  if ((await inside.count()) === 1) {
    await inside.click({ timeout: budget.remaining() });
    return succeeded({ matches, select: { via: 'listbox' } });
  }
  await target.click({ timeout: budget.remaining() });
  const popup = await popupOf(page, target, Math.min(PRECHECK_TIMEOUT_MS, budget.remaining()));
  const listboxId = popup.id;
  let found = await appears(optionNamed(popup.root, choice), Math.min(OPTIONS_APPEAR_MS, budget.remaining()));
  const typedInto = found ? undefined : await typeToFilter(page, target, choice, budget);
  if (typedInto !== undefined) found = await appears(optionNamed(popup.root, choice), budget.remaining());
  if (!found) {
    const visible = await popup.root.getByRole('option').filter({ visible: true }).allInnerTexts();
    const names = visible.map((text) => text.replace(/\s+/g, ' ').trim()).filter((text) => text.length > 0);
    return names.length === 0
      ? failed('not-found', `opening ${description} showed no options (is it a dropdown?); wanted ${JSON.stringify(choice)}`, matches)
      : failed('assertion-like', `no option named ${JSON.stringify(choice)} after opening ${description}; visible options: ${listOptions(names)}`, matches);
  }
  const option = await resolveUnique(optionNamed(popup.root, choice), `option ${JSON.stringify(choice)}`);
  await option.locator.click({ timeout: budget.remaining() });
  return succeeded({
    matches,
    select: {
      via: 'combobox',
      typed: typedInto !== undefined,
      ...(typedInto !== undefined ? { typedInto } : {}),
      ...(listboxId !== undefined ? { listboxId } : {}),
    },
  });
};

const selectOption = async (page: Page, target: Locator, choice: string, matches: MatchCounts, budget: Budget): Promise<ActionResult> => {
  const options = await nativeOptions(target, Math.min(PRECHECK_TIMEOUT_MS, budget.remaining()));
  return options !== null ? selectNative(target, options, choice, matches, budget) : selectCustom(page, target, choice, matches, budget);
};

// ─── dispatch ──────────────────────────────────────────────────────────────

/**
 * Validate the request (throwing invalid-input) and return the work to do.
 * Splitting validation from execution keeps caller mistakes out of the
 * page-failure families.
 */
const plan = (page: Page, locator: Locator | null, action: Action, value: string | undefined, budget: Budget): Run => {
  switch (action) {
    case 'navigate': {
      const url = requireNonEmpty(value, action, 'a url');
      return async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: budget.remaining() });
        return succeeded();
      };
    }
    case 'click': {
      const target = requireLocator(locator, action);
      return onUniqueTarget(target, budget, { enabled: true }, async (unique, matches) => {
        await unique.click({ timeout: budget.remaining() });
        return succeeded({ matches });
      });
    }
    case 'fill': {
      const target = requireLocator(locator, action);
      const text = requireValue(value, action, 'the text to enter');
      // fill() replaces the whole value (select-all, then insert), so it is
      // the clear. A separate clear() would fire an extra input event that
      // the emitted test, which calls fill() alone, never fires.
      return onUniqueTarget(target, budget, { enabled: true, editable: true }, async (unique, matches) => {
        await unique.fill(text, { timeout: budget.remaining() });
        return succeeded({ matches });
      });
    }
    case 'select': {
      const target = requireLocator(locator, action);
      const choice = requireNonEmpty(value, action, 'the option label or value');
      return onUniqueTarget(target, budget, { enabled: true }, (unique, matches) => selectOption(page, unique, choice, matches, budget));
    }
    case 'check': {
      const target = requireLocator(locator, action);
      return onUniqueTarget(target, budget, { enabled: true }, async (unique, matches) => {
        await unique.check({ timeout: budget.remaining() });
        return succeeded({ matches });
      });
    }
    case 'uncheck': {
      const target = requireLocator(locator, action);
      return onUniqueTarget(target, budget, { enabled: true }, async (unique, matches) => {
        await unique.uncheck({ timeout: budget.remaining() });
        return succeeded({ matches });
      });
    }
    case 'hover': {
      const target = requireLocator(locator, action);
      // Hovering a disabled control is legitimate (its tooltip says why it is disabled).
      return onUniqueTarget(target, budget, { enabled: false }, async (unique, matches) => {
        await unique.hover({ timeout: budget.remaining() });
        return succeeded({ matches });
      });
    }
    case 'press': {
      const raw = requireNonEmpty(value, action, 'a key');
      const key = normalizeKey(raw);
      if (key === null) {
        return async () => failed('assertion-like', `unknown key ${JSON.stringify(raw)}; press takes ${describeAllowedKeys()}`);
      }
      if (locator === null) {
        return async () => {
          await page.keyboard.press(key);
          return succeeded({ key });
        };
      }
      return onUniqueTarget(locator, budget, { enabled: true }, async (unique, matches) => {
        // Locator.press focuses the element first, then sends the key.
        await unique.press(key, { timeout: budget.remaining() });
        return succeeded({ matches, key });
      });
    }
    default: {
      const never: never = action;
      throw new ToolError('invalid-input', `unknown action ${String(never)}`);
    }
  }
};

/**
 * Perform one action. Throws ToolError('invalid-input') for a malformed
 * request; never throws for anything that happens on the page.
 *
 * `locator` is the raw locator the caller resolved (from a facet, a
 * candidate, or an explicit spec); the action runs on its visible-filtered
 * form after the uniqueness check. Ignored for navigate; optional for press
 * (without one, the key goes to whatever has focus).
 */
export const performAction = async (
  page: Page,
  locator: Locator | null,
  action: Action,
  value: string | undefined,
  options: ActionOptions = {},
): Promise<ActionResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ToolError('invalid-input', `timeoutMs must be a positive number, got ${timeoutMs}`);
  }
  const run = plan(page, locator, action, value, budgetOf(timeoutMs));
  try {
    return await run();
  } catch (error) {
    return failedFrom(error);
  }
};
