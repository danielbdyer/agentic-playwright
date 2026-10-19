/**
 * A small, tolerant XML reader for the three XML fields Azure DevOps stores on
 * a test case: Microsoft.VSTS.TCM.Steps, .Parameters and .LocalDataSource.
 *
 * Why not regular expressions (what v1 did): the steps field is a tree. A
 * shared-step reference (`<compref>`) can wrap the parent's own following
 * steps, an empty action is a self-closing `<parameterizedString/>` that a
 * lazy regex reads past, and step ids and types live in attributes. A tree
 * keeps all of that. Why not a dependency: the input is machine-written and
 * small, and the reader only has to be right about elements, attributes,
 * text, CDATA, entities and comments.
 *
 * Tolerance: an unclosed element is closed at the end of input, a stray
 * closing tag is ignored, a closing tag closes every element opened inside the
 * one it names, and a `<` that does not start a tag is kept as text.
 */

export interface XmlElement {
  readonly kind: 'element';
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
}

export interface XmlText {
  readonly kind: 'text';
  /** Entity-decoded text; CDATA content verbatim. */
  readonly text: string;
  readonly cdata: boolean;
}

export type XmlNode = XmlElement | XmlText;

/** The builder shape is structurally an XmlElement; it is only mutated while parsing. */
interface ElementBuilder {
  readonly kind: 'element';
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: XmlNode[];
}

const XML_ENTITIES: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

const codePointText = (code: number): string | null =>
  Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : null;

/** Parse the body of a numeric character reference ("#60" or "#x3C"). */
export const numericReference = (body: string): string | null => {
  const hex = body[1] === 'x' || body[1] === 'X';
  const digits = body.slice(hex ? 2 : 1);
  if (digits.length === 0 || !(hex ? /^[0-9a-f]+$/i : /^[0-9]+$/).test(digits)) return null;
  return codePointText(parseInt(digits, hex ? 16 : 10));
};

/**
 * Decode the five XML entities and numeric character references in one pass,
 * so "&amp;lt;" becomes "&lt;" and never "<". Unknown entities are kept.
 */
export const decodeXmlEntities = (text: string): string =>
  text.indexOf('&') === -1
    ? text
    : text.replace(/&(#[xX]?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (match, body: string) =>
        body.startsWith('#') ? numericReference(body) ?? match : XML_ENTITIES[body] ?? match,
      );

const NAME = /[A-Za-z_:][-\w:.]*/y;
const ATTRIBUTE = /([A-Za-z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

interface Tag {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly selfClosing: boolean;
  /** Index just past the closing `>`. */
  readonly end: number;
}

/** Read an opening tag starting at `lt`; null when `<` does not start one. */
const readTag = (source: string, lt: number): Tag | null => {
  NAME.lastIndex = lt + 1;
  const nameMatch = NAME.exec(source);
  if (nameMatch === null) return null;
  const attributes: Record<string, string> = {};
  let i = lt + 1 + nameMatch[0].length;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === '>') return { name: nameMatch[0], attributes, selfClosing: false, end: i + 1 };
    if (ch === '/' && source[i + 1] === '>') return { name: nameMatch[0], attributes, selfClosing: true, end: i + 2 };
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    ATTRIBUTE.lastIndex = i;
    const attr = ATTRIBUTE.exec(source);
    if (attr === null) {
      i += 1; // a stray character inside a tag: skip it rather than fail
      continue;
    }
    const raw = attr[2] ?? attr[3] ?? attr[4] ?? '';
    attributes[attr[1]!] = decodeXmlEntities(raw);
    i += attr[0].length;
  }
  return { name: nameMatch[0], attributes, selfClosing: false, end: source.length };
};

const indexAfter = (source: string, terminator: string, from: number): number => {
  const at = source.indexOf(terminator, from);
  return at === -1 ? source.length : at + terminator.length;
};

/** Index in the open-element stack of the element a closing tag names, or -1. */
const openIndexOf = (stack: readonly ElementBuilder[], name: string): number => {
  for (let k = stack.length - 1; k >= 1; k -= 1) if (stack[k]!.name === name) return k;
  const lower = name.toLowerCase();
  for (let k = stack.length - 1; k >= 1; k -= 1) if (stack[k]!.name.toLowerCase() === lower) return k;
  return -1;
};

/**
 * Parse an XML string into a tree under a synthetic `#document` element.
 * Comments, processing instructions and DOCTYPE declarations are dropped.
 */
export const parseXml = (source: string): XmlElement => {
  const root: ElementBuilder = { kind: 'element', name: '#document', attributes: {}, children: [] };
  const stack: ElementBuilder[] = [root];
  const top = (): ElementBuilder => stack[stack.length - 1]!;
  const pushText = (text: string, cdata: boolean): void => {
    if (text.length > 0) top().children.push({ kind: 'text', text, cdata });
  };

  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      pushText(decodeXmlEntities(source.slice(i)), false);
      break;
    }
    if (lt > i) pushText(decodeXmlEntities(source.slice(i, lt)), false);

    if (source.startsWith('<!--', lt)) {
      i = indexAfter(source, '-->', lt + 4);
    } else if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      pushText(source.slice(lt + 9, end === -1 ? source.length : end), true);
      i = end === -1 ? source.length : end + 3;
    } else if (source.startsWith('<?', lt)) {
      i = indexAfter(source, '?>', lt + 2);
    } else if (source.startsWith('<!', lt)) {
      i = indexAfter(source, '>', lt + 2);
    } else if (source[lt + 1] === '/') {
      const end = source.indexOf('>', lt + 2);
      const name = source.slice(lt + 2, end === -1 ? source.length : end).trim();
      const at = openIndexOf(stack, name);
      if (at > 0) stack.length = at; // closes the named element and anything left open inside it
      i = end === -1 ? source.length : end + 1;
    } else {
      const tag = readTag(source, lt);
      if (tag === null) {
        pushText('<', false);
        i = lt + 1;
      } else {
        const element: ElementBuilder = { kind: 'element', name: tag.name, attributes: tag.attributes, children: [] };
        top().children.push(element);
        if (!tag.selfClosing) stack.push(element);
        i = tag.end;
      }
    }
  }
  return root;
};

export const isElement = (node: XmlNode): node is XmlElement => node.kind === 'element';

/** Local name without a namespace prefix ("xs:schema" → "schema"). */
export const localName = (name: string): string => name.slice(name.indexOf(':') + 1);

/** Element names compared case-insensitively: ADO's serializers have not always agreed on case. */
export const nameIs = (element: XmlElement, name: string): boolean => element.name.toLowerCase() === name.toLowerCase();

export const childElements = (element: XmlElement, name?: string): readonly XmlElement[] =>
  element.children.filter(isElement).filter((child) => name === undefined || nameIs(child, name));

/** The first element with this name, depth-first, including `element` itself. */
export const findElement = (element: XmlElement, name: string): XmlElement | null => {
  if (nameIs(element, name)) return element;
  for (const child of element.children) {
    if (isElement(child)) {
      const found = findElement(child, name);
      if (found !== null) return found;
    }
  }
  return null;
};

/** Every element with this name, depth-first, document order. */
export const findElements = (element: XmlElement, name: string): readonly XmlElement[] =>
  element.children
    .filter(isElement)
    .flatMap((child) => [...(nameIs(child, name) ? [child] : []), ...findElements(child, name)]);

/** Concatenated text of every descendant text node. */
export const textOf = (element: XmlElement): string =>
  element.children.map((child) => (child.kind === 'text' ? child.text : textOf(child))).join('');

const escapeMarkupText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const elementAsHtml = (element: XmlElement): string =>
  `<${element.name}>${element.children.map((child) => (child.kind === 'text' ? escapeMarkupText(child.text) : elementAsHtml(child))).join('')}</${element.name}>`;

/**
 * The HTML an element carries. ADO normally stores step HTML escaped inside
 * the XML (`&lt;P&gt;…`) or in CDATA, so a direct text child already IS HTML
 * source. If a serializer wrote the HTML as real child elements instead, they
 * are re-serialized (attributes dropped, text re-escaped) so either form
 * reaches the HTML-to-text step as HTML.
 */
export const markupOf = (element: XmlElement): string =>
  element.children.map((child) => (child.kind === 'text' ? child.text : elementAsHtml(child))).join('');
