import { describe, expect, it } from 'vitest';
import { classifyStep, intentForAssertion, needsTarget, valuesUsedBy } from '../../../src/resolve/index.js';
import type { StepContext, StepIntent } from '../../../src/resolve/index.js';
import { VerbSchema } from '../../../src/contract/schemas.js';

type Want = Partial<Pick<StepIntent, 'verb' | 'targetPhrase' | 'roleHint' | 'value' | 'key' | 'landmarkCue' | 'rowCue' | 'exactName'>>;

interface Row {
  readonly action: string;
  readonly expected?: string;
  readonly params?: readonly string[];
  readonly context?: StepContext;
  readonly want: Want;
  /** Why the row exists, when it pins a v1 misclassification (resolution map §1). */
  readonly fixes?: string;
}

const ROWS: readonly Row[] = [
  // ─── v1 misclassifications (resolution map §1), each with its fixed reading ───
  {
    action: 'Click the toggle checkbox next to the todo',
    context: { priorValues: ['Buy milk'] },
    want: { verb: 'click', targetPhrase: 'toggle', roleHint: 'checkbox', rowCue: 'Buy milk' },
    fixes: 'v1 targeted checkbox "toggle" with no row; "next to the todo" names the row of the value just entered',
  },
  {
    action: 'Click the toggle checkbox next to the todo',
    want: { verb: 'click', targetPhrase: 'toggle', roleHint: 'checkbox', rowCue: 'todo' },
  },
  {
    action: 'Click the Active filter link in the footer',
    want: { verb: 'click', targetPhrase: 'Active filter', roleHint: 'link', landmarkCue: 'contentinfo' },
  },
  {
    action: 'Verify the items-left count decreases by one',
    want: { verb: 'assert', targetPhrase: 'items-left', roleHint: null },
    fixes: 'v1 captured "items-left count decreases by" as a name',
  },
  {
    action: 'Verify the field shows the entered name',
    params: ['customerName'],
    context: { priorValues: ['@customerName'] },
    want: { verb: 'assert', targetPhrase: null, roleHint: 'textbox' },
    fixes: 'v1 captured "field shows the entered" as a name',
  },
  { action: 'Click on the Save button', want: { verb: 'click', targetPhrase: 'Save', roleHint: 'button' }, fixes: 'v1: "on the Save"' },
  { action: 'Click on Save', want: { verb: 'click', targetPhrase: 'Save', roleHint: null }, fixes: 'v1: "on"' },
  { action: 'Click the "Save" button', want: { verb: 'click', targetPhrase: 'Save', roleHint: 'button', exactName: true }, fixes: 'v1: "the"' },
  { action: 'Press the Submit button', want: { verb: 'click', targetPhrase: 'Submit', roleHint: 'button', key: null }, fixes: 'v1 pressed key "Submit"' },
  { action: 'Check the Terms checkbox', want: { verb: 'check', targetPhrase: 'Terms', roleHint: 'checkbox' }, fixes: 'v1 read verify' },
  { action: 'Tap the Save button', want: { verb: 'click', targetPhrase: 'Save', roleHint: 'button' }, fixes: 'v1: empty target' },
  { action: 'Select the Active tab', want: { verb: 'click', targetPhrase: 'Active', roleHint: 'tab' }, fixes: 'v1: empty target' },
  {
    action: 'Select Ohio from the State dropdown',
    want: { verb: 'select', targetPhrase: 'State', roleHint: 'combobox', value: 'Ohio' },
    fixes: 'v1: input with an empty target',
  },
  {
    action: 'Choose Ohio in the State field',
    want: { verb: 'select', targetPhrase: 'State', roleHint: 'combobox', value: 'Ohio' },
    fixes: 'v1: null',
  },
  { action: 'Enter John as the first name', want: { verb: 'fill', targetPhrase: 'first name', value: 'John' }, fixes: 'v1: no "field" suffix, empty target' },
  {
    action: 'Click the Search button in the header',
    want: { verb: 'click', targetPhrase: 'Search', roleHint: 'button', landmarkCue: 'banner' },
    fixes: 'v1 mapped header to navigation',
  },
  { action: 'Click Search button', want: { verb: 'click', targetPhrase: 'Search', roleHint: 'button', landmarkCue: null }, fixes: 'v1: search landmark' },
  {
    action: 'Navigate to Policy Search screen',
    want: { verb: 'navigate', targetPhrase: 'Policy Search', landmarkCue: null },
    fixes: 'v1: search landmark from the word "Search"',
  },
  { action: 'Click the Save & Close button', want: { verb: 'click', targetPhrase: 'Save & Close', roleHint: 'button' }, fixes: 'v1: exact name "Save"' },
  { action: 'Click the Save &amp; Close button', want: { verb: 'click', targetPhrase: 'Save & Close', roleHint: 'button' }, fixes: 'v1 did not decode entities' },
  {
    action: 'Enter @policyNumber in search field',
    params: ['policyNumber'],
    want: { verb: 'fill', value: '@policyNumber', targetPhrase: 'search', roleHint: 'textbox', landmarkCue: 'search' },
    fixes: 'v1 never populated value',
  },

  // ─── press ───
  { action: 'Press Enter', want: { verb: 'press', key: 'Enter', targetPhrase: null } },
  { action: 'Press Enter to submit the new todo', want: { verb: 'press', key: 'Enter' } },
  { action: 'Press the Tab key', want: { verb: 'press', key: 'Tab' } },
  { action: 'Press Escape to cancel', want: { verb: 'press', key: 'Escape' } },
  { action: 'Hit Ctrl+S', want: { verb: 'press', key: 'Control+S' } },
  { action: 'Press Shift + Tab', want: { verb: 'press', key: 'Shift+Tab' } },
  { action: 'Press the down arrow key', want: { verb: 'press', key: 'ArrowDown' } },
  { action: 'Press Page Down', want: { verb: 'press', key: 'PageDown' } },
  { action: 'Press Enter in the search field', want: { verb: 'press', key: 'Enter', targetPhrase: 'search', roleHint: 'textbox', landmarkCue: 'search' } },
  { action: 'Press the Enter button', want: { verb: 'click', targetPhrase: 'Enter', roleHint: 'button', key: null } },

  // ─── fill and values ───
  { action: 'Enter policy number in search field', params: ['policyNumber'], want: { verb: 'fill', value: '@policyNumber', targetPhrase: 'search' } },
  { action: 'Enter the Policy Number', params: ['policyNumber'], want: { verb: 'fill', value: '@policyNumber', targetPhrase: 'Policy Number' } },
  { action: 'Enter Alice in the Customer Name field', want: { verb: 'fill', value: 'Alice', targetPhrase: 'Customer Name', roleHint: 'textbox' } },
  {
    action: 'Enter Alice in the Customer Name field',
    params: ['customerName'],
    context: { dataRow: { customerName: 'Alice' } },
    want: { verb: 'fill', value: '@customerName', targetPhrase: 'Customer Name' },
  },
  { action: 'Type "hello world" into the search box', want: { verb: 'fill', value: 'hello world', targetPhrase: 'search', landmarkCue: 'search' } },
  { action: 'Fill in the Name field with Alice', want: { verb: 'fill', value: 'Alice', targetPhrase: 'Name', roleHint: 'textbox' } },
  { action: 'Populate the Email field with "a.b@example.com"', want: { verb: 'fill', value: 'a.b@example.com', targetPhrase: 'Email' } },
  {
    action: 'Enter the todo description in the new-todo input field',
    params: ['todoText'],
    want: { verb: 'fill', value: '@todoText', targetPhrase: 'new-todo', roleHint: 'textbox' },
  },
  {
    action: 'Enter a valid policy number in the Policy Number field',
    params: ['policyNumber', 'lastName'],
    want: { verb: 'fill', value: '@policyNumber', targetPhrase: 'Policy Number' },
  },
  { action: 'Enter a value in the Notes field', params: ['first', 'second'], want: { verb: 'fill', value: null, targetPhrase: 'Notes' } },
  { action: 'Enter {policyNumber} in the Policy field', params: ['policyNumber'], want: { verb: 'fill', value: '@policyNumber', targetPhrase: 'Policy' } },
  { action: 'Set the State dropdown to Ohio', want: { verb: 'select', value: 'Ohio', targetPhrase: 'State', roleHint: 'combobox' } },
  { action: 'Set the Quantity field to 5', want: { verb: 'fill', value: '5', targetPhrase: 'Quantity' } },
  { action: 'Set the Notifications switch to on', want: { verb: 'check', targetPhrase: 'Notifications', roleHint: 'switch' } },
  { action: 'Clear the Search Policy field', want: { verb: 'fill', value: '', targetPhrase: 'Search Policy' } },
  { action: 'Search for @policyNumber', params: ['policyNumber'], want: { verb: 'fill', value: '@policyNumber', targetPhrase: 'search', landmarkCue: 'search' } },
  { action: 'Enter @username and @password and click Login', params: ['username', 'password'], want: { verb: 'fill', value: '@username', targetPhrase: null } },

  // ─── select ───
  { action: 'Select Policy Search from the menu', want: { verb: 'click', targetPhrase: 'Policy Search', landmarkCue: 'navigation' } },
  { action: 'Select "Gold" from the Membership list', want: { verb: 'select', value: 'Gold', targetPhrase: 'Membership', roleHint: 'combobox' } },
  { action: 'Pick @state from State', params: ['state'], want: { verb: 'select', value: '@state', targetPhrase: 'State', roleHint: 'combobox' } },
  { action: 'Select the Remember me checkbox', want: { verb: 'check', targetPhrase: 'Remember me', roleHint: 'checkbox' } },

  // ─── check, uncheck, toggle ───
  { action: 'Uncheck the Remember me checkbox', want: { verb: 'uncheck', targetPhrase: 'Remember me', roleHint: 'checkbox' } },
  { action: "Tick 'I agree'", want: { verb: 'check', targetPhrase: 'I agree', roleHint: 'checkbox', exactName: true } },
  { action: 'Toggle the Dark mode switch', want: { verb: 'click', targetPhrase: 'Dark mode', roleHint: 'switch' } },
  { action: 'Toggle Notifications', want: { verb: 'click', targetPhrase: 'Notifications', roleHint: 'switch' } },
  { action: 'Check Remember me', expected: 'Remember me is checked', want: { verb: 'check', targetPhrase: 'Remember me', roleHint: 'checkbox' } },
  { action: 'Check that the total is 100', want: { verb: 'assert', targetPhrase: 'total' } },
  { action: 'Check the Settings link appears', want: { verb: 'assert', targetPhrase: 'Settings', roleHint: 'link' } },

  // ─── hover, navigate, wait ───
  { action: 'Hover over the Help icon', want: { verb: 'hover', targetPhrase: 'Help', roleHint: 'img' } },
  { action: 'Go to https://example.com/app/PolicySearch', want: { verb: 'navigate', value: 'https://example.com/app/PolicySearch', targetPhrase: null } },
  { action: 'Open the customer order form', want: { verb: 'navigate', targetPhrase: 'customer order form' } },
  { action: 'Open the Account menu', want: { verb: 'click', targetPhrase: 'Account', roleHint: 'menuitem' } },
  { action: 'Return to the Home page', want: { verb: 'navigate', targetPhrase: 'home' } },
  { action: 'Go back', want: { verb: 'navigate', targetPhrase: null, value: null } },
  { action: 'Navigate to the TodoMVC application with at least one todo in the list', want: { verb: 'navigate', targetPhrase: 'TodoMVC' } },
  { action: 'Go to the Settings tab', want: { verb: 'click', targetPhrase: 'Settings', roleHint: 'tab' } },
  { action: 'Wait for the results to load', want: { verb: 'wait', targetPhrase: 'results' } },
  { action: 'Wait until the spinner disappears', want: { verb: 'wait', targetPhrase: 'spinner' } },
  { action: 'Wait 2 seconds', want: { verb: 'wait', value: '2000' } },

  // ─── rows and landmarks ───
  { action: 'Click the checkbox in the row for Aurora headset', want: { verb: 'click', targetPhrase: null, roleHint: 'checkbox', rowCue: 'Aurora headset' } },
  { action: 'Click Edit in the POL-001 row', want: { verb: 'click', targetPhrase: 'Edit', rowCue: 'POL-001' } },
  { action: 'Click View for @policyNumber', params: ['policyNumber'], want: { verb: 'click', targetPhrase: 'View', rowCue: '@policyNumber' } },
  { action: 'Double-click the row for POL-001', want: { verb: 'click', targetPhrase: null, roleHint: 'row', rowCue: 'POL-001' } },
  { action: 'Click OK in the confirmation dialog', want: { verb: 'click', targetPhrase: 'OK', landmarkCue: 'dialog' } },
  { action: 'Click the Logout link in the side nav', want: { verb: 'click', targetPhrase: 'Logout', roleHint: 'link', landmarkCue: 'navigation' } },
  { action: 'Click Save in the main content', want: { verb: 'click', targetPhrase: 'Save', landmarkCue: 'main' } },
  { action: 'Click the Search button in the search panel', want: { verb: 'click', targetPhrase: 'Search', roleHint: 'button', landmarkCue: 'search' } },
  { action: 'Close the dialog', want: { verb: 'click', targetPhrase: 'Close', roleHint: 'button', landmarkCue: 'dialog' } },

  // ─── assert ───
  { action: 'Verify the Customer Name field is visible', want: { verb: 'assert', targetPhrase: 'Customer Name', roleHint: 'textbox' } },
  { action: 'Verify the Submit Order button is visible', want: { verb: 'assert', targetPhrase: 'Submit Order', roleHint: 'button' } },
  { action: 'Verify the English language link is visible', want: { verb: 'assert', targetPhrase: 'English language', roleHint: 'link' } },
  { action: 'Verify the success message appears', want: { verb: 'assert', roleHint: 'status' } },
  { action: 'The Save button should be disabled', want: { verb: 'assert', targetPhrase: 'Save', roleHint: 'button' } },
  { action: 'Ensure that the Next button is enabled', want: { verb: 'assert', targetPhrase: 'Next', roleHint: 'button' } },

  // ─── subjects, connectives, markup ───
  { action: 'User clicks the Login button', want: { verb: 'click', targetPhrase: 'Login', roleHint: 'button' } },
  { action: 'Then click Save', want: { verb: 'click', targetPhrase: 'Save' } },
  { action: 'The user should click on the Next button', want: { verb: 'click', targetPhrase: 'Next', roleHint: 'button' } },
  { action: '<div>Click&nbsp;the <b>Save</b> button</div>', want: { verb: 'click', targetPhrase: 'Save', roleHint: 'button' } },
  { action: '&lt;P&gt;Click the &quot;Save&quot; button&lt;/P&gt;', want: { verb: 'click', targetPhrase: 'Save', roleHint: 'button', exactName: true } },
  { action: 'Click the “Save” button', want: { verb: 'click', targetPhrase: 'Save', exactName: true } },
  { action: 'Click the Return to Search link', want: { verb: 'click', targetPhrase: 'Return to Search', roleHint: 'link' } },
  { action: 'Click Save to save the policy', want: { verb: 'click', targetPhrase: 'Save' } },
  { action: "Click the user's profile link", want: { verb: 'click', targetPhrase: "user's profile", roleHint: 'link' } },
];

describe('classifyStep: table of step phrasings', () => {
  it('covers at least sixty phrasings', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(60);
  });

  for (const row of ROWS) {
    const label = `${row.action}${row.context?.priorValues !== undefined ? ` (after ${row.context.priorValues.join(', ')})` : ''}`;
    it(label, () => {
      const intent = classifyStep(row.action, row.expected ?? '', row.params ?? [], row.context);
      const got = Object.fromEntries(Object.keys(row.want).map((k) => [k, intent[k as keyof Want]]));
      expect(got).toEqual(row.want);
      expect(VerbSchema.safeParse(intent.verb).success).toBe(true);
      expect(intent.confidence).toBeGreaterThanOrEqual(0);
      expect(intent.confidence).toBeLessThanOrEqual(1);
    });
  }
});

describe('classifyStep: details', () => {
  it('strips HTML and decodes entities, including double-encoded ADO text', () => {
    const intent = classifyStep('&lt;P&gt;Navigate to Policy Search screen&lt;/P&gt;', '&lt;P&gt;Policy Search screen loads&lt;/P&gt;', []);
    expect(intent.actionText).toBe('Navigate to Policy Search screen');
    expect(intent.expectedText).toBe('Policy Search screen loads');
  });

  it('keeps the author\'s words, role word included, as the mention', () => {
    const intent = classifyStep('Enter @policyNumber in search field', '', ['policyNumber']);
    expect(intent.targetMention).toBe('search field');
  });

  it('reads the screen-load expectation as heading-visible and a URL pattern', () => {
    const intent = classifyStep('Navigate to Policy Search screen', 'Policy Search screen loads', []);
    expect(intent.assertions.map((a) => a.kind)).toEqual(['visible', 'url']);
    expect(intent.assertions[0]).toMatchObject({ roleHint: 'heading', targetPhrase: 'Policy Search' });
    expect(intent.assertions[1]?.expected).toBe('/policy(?:[-_ ]|%20)?search/i');
  });

  it('proposes a row assertion with the parameter earlier steps used', () => {
    const intent = classifyStep('Click Search button', 'Matching policy appears in Search Results', ['policyNumber'], {
      priorValues: ['@policyNumber'],
    });
    expect(intent.assertions[0]).toMatchObject({ kind: 'visible', roleHint: 'row', rowCue: '@policyNumber' });
    expect(intent.assertions[1]).toMatchObject({ kind: 'contains-text', targetPhrase: 'Search Results', expected: '@policyNumber' });
  });

  it('uses this step\'s own value for "accepts the value"', () => {
    const intent = classifyStep('Enter @policyNumber in search field', 'Policy Number accepts a valid policy', ['policyNumber']);
    expect(intent.assertions).toHaveLength(1);
    expect(intent.assertions[0]).toMatchObject({ kind: 'value', targetPhrase: 'Policy Number', roleHint: 'textbox', expected: '@policyNumber' });
  });

  it('flags a relative count as a paraphrase with low confidence', () => {
    const intent = classifyStep('Verify the items-left count decreases by one', 'The footer shows one fewer item left', []);
    expect(intent.assertions.every((a) => a.kind === 'count' && a.expected === null)).toBe(true);
    expect(intent.assertions[0]?.note).toMatch(/paraphrase/);
    expect(intent.assertions[0]?.note).toMatch(/-1/);
    expect(intent.assertions[0]?.confidence).toBeLessThan(0.5);
    expect(intent.assertions[1]?.landmarkCue).toBe('contentinfo');
  });

  it('reads "the entered name" as the value an earlier step used', () => {
    const intent = classifyStep('Verify the field shows the entered name', '', ['customerName'], { priorValues: ['@customerName'] });
    expect(intent.assertions[0]).toMatchObject({ kind: 'value', roleHint: 'textbox', expected: '@customerName' });
  });

  it('reads an error message with its text as a visible alert containing it', () => {
    const intent = classifyStep('Click Search button', 'error message Invalid policy number is shown', []);
    expect(intent.assertions[0]).toMatchObject({ kind: 'contains-text', roleHint: 'alert', expected: 'Invalid policy number' });
  });

  it('reads "marked as complete" as the checkbox in the row of the value earlier steps used', () => {
    const intent = classifyStep('Click the toggle checkbox next to the todo', 'The todo is marked as complete', ['todoText'], {
      priorValues: ['@todoText'],
    });
    expect(intent.rowCue).toBe('@todoText');
    expect(intent.assertions[0]).toMatchObject({ kind: 'checked', roleHint: 'checkbox', rowCue: '@todoText' });
  });

  it('notes a compound step and lowers confidence', () => {
    const single = classifyStep('Enter @policyNumber in search field', '', ['policyNumber']);
    const compound = classifyStep('Enter @policyNumber in search field and click Search', '', ['policyNumber']);
    expect(compound.verb).toBe('fill');
    expect(compound.notes.some((n) => /compound step/.test(n) && /click Search/.test(n))).toBe(true);
    expect(compound.confidence).toBeLessThan(single.confidence);
  });

  it('notes a parameter that is not declared on the test case', () => {
    const intent = classifyStep('Enter @policyNo in the Policy field', '', ['policyNumber']);
    expect(intent.value).toBe('@policyNo');
    expect(intent.notes.some((n) => /not declared/.test(n))).toBe(true);
  });

  it('assumes the only parameter for a described value, and says so', () => {
    const intent = classifyStep('Enter a sample todo in the new-todo input field', '', ['todoText']);
    expect(intent.value).toBe('@todoText');
    const lone = classifyStep('Enter some data in the Notes field', '', ['comment']);
    expect(lone.value).toBe('@comment');
    expect(lone.notes.some((n) => /only parameter/.test(n))).toBe(true);
  });

  it('gives low confidence when nothing is recognized', () => {
    const intent = classifyStep('Perform an unrelated cryptographic attestation', '', []);
    expect(intent.confidence).toBeLessThan(0.3);
    expect(intent.notes).toContain('no action verb recognized');
  });

  it('is deterministic', () => {
    const a = classifyStep('Click the Search button in the header', 'Search results are displayed', []);
    const b = classifyStep('Click the Search button in the header', 'Search results are displayed', []);
    expect(a).toEqual(b);
  });
});

describe('needsTarget, intentForAssertion, valuesUsedBy', () => {
  it('knows which steps act on a target', () => {
    expect(needsTarget(classifyStep('Press Enter', '', []))).toBe(false);
    expect(needsTarget(classifyStep('Go to https://example.com', '', []))).toBe(false);
    expect(needsTarget(classifyStep('Navigate to Policy Search screen', '', []))).toBe(true);
    expect(needsTarget(classifyStep('Click Save', '', []))).toBe(true);
    expect(needsTarget(classifyStep('Verify the URL contains /PolicySearch', '', []))).toBe(false);
    expect(needsTarget(classifyStep('Wait 2 seconds', '', []))).toBe(false);
  });

  it('turns a proposed assertion into an assert intent for ranking', () => {
    const intent = classifyStep('Click Search button', 'Matching policy appears in Search Results', ['policyNumber'], {
      priorValues: ['@policyNumber'],
    });
    const assertion = intent.assertions[0]!;
    const asIntent = intentForAssertion(intent, assertion);
    expect(asIntent).toMatchObject({ verb: 'assert', roleHint: 'row', rowCue: '@policyNumber', targetPhrase: null, value: null });
    expect(asIntent.assertions).toEqual([assertion]);
  });

  it('reports the value a step contributes to later steps', () => {
    expect(valuesUsedBy(classifyStep('Enter @policyNumber in search field', '', ['policyNumber']))).toEqual(['@policyNumber']);
    expect(valuesUsedBy(classifyStep('Click Save', '', []))).toEqual([]);
  });
});
