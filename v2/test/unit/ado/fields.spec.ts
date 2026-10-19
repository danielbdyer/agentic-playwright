import { describe, expect, it } from 'vitest';
import { childElements, decodeXmlEntities, findElement, markupOf, parseXml, textOf } from '../../../src/ado/xml.js';
import { htmlToText, parseDataSource, parseParameterNames, parseStepsXml, splitTags, unionNames, type ParsedStep } from '../../../src/ado/fields.js';
import { dataSourceXml, parametersXml, sharedParameterSource, stepsXml } from '../../support/mock-ado.js';

/** Appendix C.1 of the vision, verbatim (including its "…" elision). */
const APPENDIX_C_STEPS = `<steps id="0" last="4">
  <step id="2" type="ActionStep">
    <parameterizedString isformatted="true">&lt;P&gt;Navigate to Policy Search screen&lt;/P&gt;</parameterizedString>
    <parameterizedString isformatted="true">&lt;P&gt;Policy Search screen loads&lt;/P&gt;</parameterizedString>
    <description/>
  </step>
  <step id="3" type="ActionStep">
    <parameterizedString isformatted="true">&lt;P&gt;Enter @policyNumber in search field&lt;/P&gt;</parameterizedString>
    <parameterizedString isformatted="true">&lt;P&gt;Policy Number accepts a valid policy&lt;/P&gt;</parameterizedString>
    <description/>
  </step>
  …
</steps>`;

const stepsOf = (xml: string): readonly ParsedStep[] => parseStepsXml(xml).nodes.filter((node): node is ParsedStep => node.kind === 'step');

const oneStep = (action: string, expected = '<parameterizedString isformatted="true">&lt;P&gt;ok&lt;/P&gt;</parameterizedString>'): string =>
  `<steps id="0" last="2"><step id="2" type="ActionStep">${action}${expected}<description/></step></steps>`;

describe('xml reader', () => {
  it('builds a tree with attributes, text, CDATA, and self-closing elements', () => {
    const doc = parseXml('<?xml version="1.0"?><!-- note --><root a="1" b=\'two\' c=bare><x/>hello &amp; <![CDATA[<raw>&amp;]]><y k="&lt;v&gt;">t</y></root>');
    const root = childElements(doc)[0]!;
    expect(root.name).toBe('root');
    expect(root.attributes).toEqual({ a: '1', b: 'two', c: 'bare' });
    expect(childElements(root).map((child) => child.name)).toEqual(['x', 'y']);
    expect(childElements(root, 'x')[0]!.children).toEqual([]);
    expect(findElement(doc, 'y')!.attributes.k).toBe('<v>');
    expect(textOf(root)).toBe('hello & <raw>&amp;t');
  });

  it('decodes entities in one pass, numeric included, and keeps unknown ones', () => {
    expect(decodeXmlEntities('&amp;lt; &#60; &#x3C; &quot;q&apos; &nbsp; &bogus;')).toBe('&lt; < < "q\' &nbsp; &bogus;');
  });

  it('tolerates unclosed elements, stray closing tags, and a bare "<"', () => {
    const doc = parseXml('<a><b>inner</a></nope>after a < b');
    const a = childElements(doc)[0]!;
    expect(childElements(a)[0]!.name).toBe('b');
    expect(textOf(a)).toBe('inner');
    expect(textOf(doc)).toBe('innerafter a < b');
    expect(childElements(parseXml('<open><child>never closed'))[0]!.name).toBe('open');
  });

  it('re-serializes real child elements as HTML so either storage form reads the same', () => {
    const field = findElement(parseXml('<ps><P>Click <B>Save</B> &amp; close</P></ps>'), 'ps')!;
    expect(markupOf(field)).toBe('<P>Click <B>Save</B> &amp; close</P>');
  });
});

describe('htmlToText', () => {
  it('strips tags before decoding entities (v1 bug 1)', () => {
    expect(htmlToText('<P>Verify amount &gt; 0 and &lt; 100</P>')).toBe('Verify amount > 0 and < 100');
    expect(htmlToText('<P>Enter &lt;username&gt;</P>')).toBe('Enter <username>');
  });

  it('decodes numeric references and common named entities, never double-decoding', () => {
    expect(htmlToText('Verify&#160;amount')).toBe('Verify amount');
    expect(htmlToText('It&rsquo;s &#x2014; done')).toBe('It’s — done');
    expect(htmlToText('&#60;b&#62; is literal')).toBe('<b> is literal');
    expect(htmlToText('&amp;#60; stays')).toBe('&#60; stays');
    expect(htmlToText('&amp;lt; stays')).toBe('&lt; stays');
  });

  it('separates block elements and line breaks with spaces', () => {
    expect(htmlToText('<DIV><P>Line one</P><P>Line two<BR/>three</P></DIV>')).toBe('Line one Line two three');
  });
});

describe('parseStepsXml', () => {
  it('reads the Appendix C steps with their ids, types, and plain text', () => {
    const parsed = parseStepsXml(APPENDIX_C_STEPS);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.nodes).toEqual([
      { kind: 'step', id: '2', type: 'ActionStep', action: 'Navigate to Policy Search screen', expected: 'Policy Search screen loads' },
      { kind: 'step', id: '3', type: 'ActionStep', action: 'Enter @policyNumber in search field', expected: 'Policy Number accepts a valid policy' },
    ]);
  });

  it('keeps an empty self-closing action empty instead of shifting the expected text into it (v1 bug 2)', () => {
    const [step] = stepsOf(oneStep('<parameterizedString isformatted="true" />', '<parameterizedString isformatted="true">&lt;P&gt;Record saved&lt;/P&gt;</parameterizedString>'));
    expect(step).toMatchObject({ action: '', expected: 'Record saved' });
    const [empty] = stepsOf(oneStep('<parameterizedString isformatted="true"></parameterizedString>'));
    expect(empty).toMatchObject({ action: '', expected: 'ok' });
    const [onlyAction] = stepsOf('<steps><step id="5" type="ValidateStep"><parameterizedString>&lt;P&gt;Look&lt;/P&gt;</parameterizedString></step></steps>');
    expect(onlyAction).toMatchObject({ id: '5', type: 'ValidateStep', action: 'Look', expected: '' });
  });

  it('keeps ">" and "<" inside step text (entities survive)', () => {
    const [step] = stepsOf(oneStep('<parameterizedString isformatted="true">&lt;P&gt;Verify amount &amp;gt; 0 and &amp;lt; 100&lt;/P&gt;</parameterizedString>'));
    expect(step!.action).toBe('Verify amount > 0 and < 100');
  });

  it('reads CDATA and raw-HTML step fields', () => {
    const [cdata] = stepsOf(oneStep('<parameterizedString isformatted="true"><![CDATA[<p>Navigate &amp; go</p>]]></parameterizedString>'));
    expect(cdata!.action).toBe('Navigate & go');
    const [raw] = stepsOf(oneStep('<parameterizedString isformatted="true"><P>Click <B>Save</B> &amp; close</P></parameterizedString>'));
    expect(raw!.action).toBe('Click Save & close');
  });

  it('round-trips the mock builder, including text with markup characters', () => {
    const xml = stepsXml([
      { id: 2, action: 'Enter <username> & "password"', expected: 'Amount > 0' },
      { id: 4, action: '', expected: 'Saved', type: 'ValidateStep' },
    ]);
    expect(stepsOf(xml)).toEqual([
      { kind: 'step', id: '2', type: 'ActionStep', action: 'Enter <username> & "password"', expected: 'Amount > 0' },
      { kind: 'step', id: '4', type: 'ValidateStep', action: '', expected: 'Saved' },
    ]);
  });

  it('keeps shared-step references as a tree, including steps nested inside a compref', () => {
    const xml = stepsXml([
      { id: 1, action: 'Open the app' },
      { compref: 4, ref: 900, children: [{ id: 7, action: 'After the shared steps' }, { compref: 8, ref: 901 }] },
    ]);
    const parsed = parseStepsXml(xml);
    expect(parsed.nodes).toEqual([
      { kind: 'step', id: '1', type: 'ActionStep', action: 'Open the app', expected: '' },
      {
        kind: 'compref',
        id: '4',
        ref: 900,
        children: [
          { kind: 'step', id: '7', type: 'ActionStep', action: 'After the shared steps', expected: '' },
          { kind: 'compref', id: '8', ref: 901, children: [] },
        ],
      },
    ]);
  });

  it('warns about a compref without a usable ref and a step without an id', () => {
    const parsed = parseStepsXml('<steps><compref id="3"/><step type="ActionStep"><parameterizedString>x</parameterizedString></step></steps>');
    expect(parsed.nodes[0]).toMatchObject({ kind: 'compref', id: '3', ref: null });
    expect(parsed.nodes[1]).toMatchObject({ kind: 'step', id: '?2', action: 'x' });
    expect(parsed.warnings).toHaveLength(2);
  });

  it('returns nothing for an empty or missing field', () => {
    expect(parseStepsXml(undefined)).toEqual({ nodes: [], warnings: [] });
    expect(parseStepsXml('   ')).toEqual({ nodes: [], warnings: [] });
  });
});

describe('parameters and data rows', () => {
  it('reads parameter names, de-duplicated case-insensitively', () => {
    expect(parseParameterNames('<parameters><param name="policyNumber" bind="default"/><param name="Amount"/><param name="amount"/><param name=" "/></parameters>')).toEqual([
      'policyNumber',
      'Amount',
    ]);
    expect(parseParameterNames(parametersXml(['a', 'b']))).toEqual(['a', 'b']);
    expect(unionNames([['a', 'B'], ['b', 'c']])).toEqual(['a', 'B', 'c']);
  });

  it('reads data rows with entities, self-closing empty cells, and omitted cells', () => {
    const xml = dataSourceXml(
      [
        { policyNumber: 'POL-001', amount: '100 & up' },
        { policyNumber: 'POL-002', amount: '' },
        { policyNumber: 'POL-003' },
      ],
      ['policyNumber', 'amount'],
    );
    expect(xml).toContain('<amount />');
    const parsed = parseDataSource(xml, ['policyNumber', 'amount']);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows).toEqual([
      { policyNumber: 'POL-001', amount: '100 & up' },
      { policyNumber: 'POL-002', amount: '' },
      { policyNumber: 'POL-003', amount: '' },
    ]);
  });

  it('reads the plain row form without a schema', () => {
    expect(parseDataSource('<NewDataSet><Table1><policyNumber>POL-001</policyNumber></Table1></NewDataSet>').rows).toEqual([{ policyNumber: 'POL-001' }]);
  });

  it('warns instead of silently dropping shared parameter sets', () => {
    const parsed = parseDataSource(sharedParameterSource([31, 32]), ['policyNumber']);
    expect(parsed.rows).toEqual([]);
    expect(parsed.sharedParameterSetIds).toEqual([31, 32]);
    expect(parsed.warnings[0]).toMatch(/shared parameters not supported yet/);
    expect(parsed.warnings[0]).toMatch(/31, 32/);
  });

  it('splits tags on semicolons', () => {
    expect(splitTags('smoke; billing; ;P1 ')).toEqual(['smoke', 'billing', 'P1']);
    expect(splitTags(undefined)).toEqual([]);
  });
});
