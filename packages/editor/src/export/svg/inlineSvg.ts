// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Prepares the markup of an SVG image for placing inside another SVG document.
 *
 * Two inlined icons that both say `<linearGradient id="a">` would otherwise share one gradient,
 * so every `id` is prefixed, and every reference to one is rewritten with it: `url(#a)` in any
 * attribute or `<style>`, `href="#a"` and `xlink:href="#a"`, and `#a` selectors in `<style>`. A
 * reference to an id the markup does not define is rewritten too: left alone it could point at one
 * of the document's own ids.
 *
 * The markup is serialised here and not by `XMLSerializer`, which writes `xmlns` on every top
 * level node it is handed; this one gives the same bytes in every DOM.
 */
import { escapeXml } from './xml.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Elements whose text is content: whitespace between their children is not layout. */
const TEXTUAL = new Set(['text', 'tspan', 'textPath', 'style', 'script', 'title', 'desc']);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

/**
 * `attrs` are the attributes of the root element (the caller places the viewport itself, from
 * `viewBox`, `preserveAspectRatio`, `width` and `height`, and passes the rest on); `inner` is its
 * content. Null when there is no `DOMParser` or the markup is not an SVG document: the caller
 * embeds it as an `<image>` then.
 */
export function inlineSvg(
  markup: string,
  prefix: string
): { attrs: Record<string, string>; inner: string } | null {
  if (typeof DOMParser === 'undefined') return null;
  let document: Document;
  try {
    document = new DOMParser().parseFromString(markup, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = document.documentElement as Element | null;
  if (
    !root ||
    root.namespaceURI !== SVG_NS ||
    root.localName !== 'svg' ||
    document.getElementsByTagName('parsererror').length > 0
  ) {
    return null;
  }
  return {
    attrs: Object.fromEntries(attributesOf(root, prefix)),
    inner: Array.from(root.childNodes, (child) => serialize(child, root, prefix)).join(''),
  };
}

function attributesOf(element: Element, prefix: string): [string, string][] {
  const kept: [string, string][] = [];
  for (const { name, value } of Array.from(element.attributes)) {
    // The writer's root declares both namespaces; any other declaration stays where it is.
    if (name === 'xmlns' && value === SVG_NS) continue;
    if (name === 'xmlns:xlink' && value === XLINK_NS) continue;
    if (name === 'id') kept.push([name, prefix + value]);
    else if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) {
      kept.push([name, `#${prefix}${value.slice(1)}`]);
    } else kept.push([name, rewriteUrls(value, prefix)]);
  }
  return kept;
}

function serialize(node: Node, parent: Element, prefix: string): string {
  if (node.nodeType === ELEMENT_NODE) return serializeElement(node as Element, prefix);
  if (node.nodeType !== TEXT_NODE && node.nodeType !== CDATA_NODE) return ''; // comments, instructions
  const text = node.nodeValue ?? '';
  if (parent.localName === 'style') return escapeXml(rewriteCss(text, prefix));
  if (text.trim() === '' && !TEXTUAL.has(parent.localName)) return '';
  return escapeXml(text);
}

function serializeElement(element: Element, prefix: string): string {
  const attributes = attributesOf(element, prefix)
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join('');
  const children = Array.from(element.childNodes, (child) =>
    serialize(child, element, prefix)
  ).join('');
  const name = element.tagName;
  return children === ''
    ? `<${name}${attributes}/>`
    : `<${name}${attributes}>${children}</${name}>`;
}

/** `url(#a)`, `url('#a')` and `url("#a")` in a property value or a `style` attribute. */
function rewriteUrls(value: string, prefix: string): string {
  return value.replace(
    /url\(\s*(['"]?)#([^)'"\s]*)\1\s*\)/g,
    (_match, quote: string, id: string) => `url(${quote}#${prefix}${id}${quote})`
  );
}

/**
 * `url(#a)` everywhere, and `#a` where it is a selector. A hex colour has the same shape, but a
 * selector is followed by a `{` before any `;` or `}` and a colour never is.
 */
function rewriteCss(css: string, prefix: string): string {
  return rewriteUrls(css, prefix).replace(
    /#([\w-]+)(?=[^{};]*\{)/g,
    (_match, id: string) => `#${prefix}${id}`
  );
}
