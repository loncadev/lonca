/**
 * Minimal XML support for n11's SOAP services: an envelope serialiser and a
 * parser for the responses.
 *
 * n11's SOAP responses only use elements and text (no mixed content, and the
 * attributes that matter are namespace declarations and `xsi:nil`), so a small
 * hand-written parser is enough and keeps the SDK free of an XML dependency.
 * DTDs (`<!DOCTYPE`) and processing instructions other than the XML
 * declaration are rejected, so there is no entity expansion and no XXE.
 */

/** A parsed element: text for leaf elements, an object of children otherwise. */
export type XmlNode = string | null | XmlObject | XmlNode[];
export interface XmlObject {
  [name: string]: XmlNode;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Escape text for use inside an element. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith('#')) return String.fromCodePoint(parseInt(ref.slice(1), 10));
    return ENTITIES[ref] ?? match;
  });
}

/** Drop a namespace prefix: `soap:Body` → `Body`. */
function localName(name: string): string {
  const colon = name.indexOf(':');
  return colon === -1 ? name : name.slice(colon + 1);
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlParseError';
  }
}

interface Frame {
  name: string;
  children: XmlObject;
  hasChildren: boolean;
  text: string;
  nil: boolean;
}

function addChild(parent: Frame, name: string, value: XmlNode): void {
  parent.hasChildren = true;
  const existing = parent.children[name];
  if (existing === undefined) {
    parent.children[name] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    parent.children[name] = [existing, value];
  }
}

function frameValue(frame: Frame): XmlNode {
  if (frame.nil) return null;
  return frame.hasChildren ? frame.children : decodeEntities(frame.text);
}

/**
 * Parse an XML document into nested objects keyed by local element name.
 * Repeated siblings become arrays (use {@link asArray} when a list may hold a
 * single item), leaf elements become their decoded text, `xsi:nil="true"`
 * becomes `null`, and attributes are otherwise dropped.
 */
export function parseXml(xml: string): XmlObject {
  const root: Frame = { name: '', children: {}, hasChildren: false, text: '', nil: false };
  const stack: Frame[] = [root];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const top = stack[stack.length - 1]!;
    if (lt === -1) {
      top.text += xml.slice(i);
      break;
    }
    if (lt > i) top.text += xml.slice(i, lt);
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt);
      if (end === -1) throw new XmlParseError('unterminated processing instruction');
      if (!/^<\?xml[\s?]/.test(xml.slice(lt, lt + 6))) {
        throw new XmlParseError('processing instructions are not supported');
      }
      i = end + 2;
    } else if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt);
      if (end === -1) throw new XmlParseError('unterminated comment');
      i = end + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt);
      if (end === -1) throw new XmlParseError('unterminated CDATA section');
      // CDATA is literal: escape it so the entity decoder leaves it unchanged.
      top.text += escapeXml(xml.slice(lt + 9, end));
      i = end + 3;
    } else if (xml.startsWith('<!', lt)) {
      throw new XmlParseError('DTDs and declarations are not supported');
    } else if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt);
      if (end === -1) throw new XmlParseError('unterminated closing tag');
      const name = localName(xml.slice(lt + 2, end).trim());
      const frame = stack.pop();
      if (!frame || stack.length === 0 || frame.name !== name) {
        throw new XmlParseError(`unexpected closing tag </${name}>`);
      }
      addChild(stack[stack.length - 1]!, name, frameValue(frame));
      i = end + 1;
    } else {
      const end = findTagEnd(xml, lt);
      const selfClosing = xml[end - 1] === '/';
      const inner = xml.slice(lt + 1, selfClosing ? end - 1 : end);
      const match = /^([^\s/>]+)([\s\S]*)$/.exec(inner.trim());
      if (!match) throw new XmlParseError('malformed opening tag');
      const name = localName(match[1]!);
      const nil = /(?:^|\s)[\w-]+:nil\s*=\s*["']true["']/.test(match[2]!);
      const frame: Frame = { name, children: {}, hasChildren: false, text: '', nil };
      if (selfClosing) {
        addChild(top, name, nil ? null : '');
      } else {
        stack.push(frame);
      }
      i = end + 1;
    }
  }
  if (stack.length !== 1)
    throw new XmlParseError(`unclosed element <${stack[stack.length - 1]!.name}>`);
  return root.children;
}

/** Index of the `>` closing the tag that starts at `start`, skipping quoted attribute values. */
function findTagEnd(xml: string, start: number): number {
  let quote: string | undefined;
  for (let j = start + 1; j < xml.length; j++) {
    const c = xml[j]!;
    if (quote) {
      if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return j;
    }
  }
  throw new XmlParseError('unterminated opening tag');
}

/** A value that may be one node, several, or absent, as an array; empty / nil entries are dropped. */
export function asArray(node: XmlNode | undefined): XmlNode[] {
  if (node === undefined) return [];
  return (Array.isArray(node) ? node : [node]).filter((n) => n !== null && n !== '');
}

/** The node as an object, or an empty object for text / null / absent. */
export function asObject(node: XmlNode | undefined): XmlObject {
  return node && typeof node === 'object' && !Array.isArray(node) ? node : {};
}

/** The node as non-empty text, or `undefined`. */
export function asText(node: XmlNode | undefined): string | undefined {
  return typeof node === 'string' && node !== '' ? node : undefined;
}

/** A field value for {@link toXml}: text, a number, a boolean, a nested object, or a list. */
export type XmlInput =
  string | number | boolean | undefined | null | { [name: string]: XmlInput } | XmlInput[];

/**
 * Serialise `{ name: value }` pairs to unqualified child elements, in key
 * order. `undefined` / `null` entries are skipped; arrays repeat the element.
 */
export function toXml(fields: { [name: string]: XmlInput }): string {
  let out = '';
  for (const [name, value] of Object.entries(fields)) out += element(name, value);
  return out;
}

function element(name: string, value: XmlInput): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((v) => element(name, v)).join('');
  if (typeof value === 'object') return `<${name}>${toXml(value)}</${name}>`;
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}
