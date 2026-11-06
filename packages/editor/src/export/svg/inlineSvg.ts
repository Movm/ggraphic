// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Prepares the markup of an SVG image for placing inside another SVG document.
 *
 * Two inlined icons that both say `<linearGradient id="a">` would otherwise share one gradient,
 * so every `id` is prefixed, and every reference to one is rewritten with it: `url(#a)` in any
 * attribute or `<style>`, `href="#a"` and `xlink:href="#a"`. A reference to an id the markup does
 * not define is rewritten too: left alone it could point at one of the document's own ids.
 *
 * Classes and `<style>` rules are scoped to the instance as well (`scopeCss.ts`); the root gets an
 * id (its own, prefixed, or `<prefix>root`) for the rules to hang under. Markup whose CSS cannot
 * be scoped safely is not inlined at all.
 *
 * The markup is serialised here and not by `XMLSerializer`, which writes `xmlns` on every top
 * level node it is handed; this one gives the same bytes in every DOM.
 */
import {
  keyframeNames,
  rewriteUrls,
  scopeClassList,
  scopeDeclarations,
  scopeStylesheet,
  UnsafeCss,
  type CssScope,
} from './scopeCss.js';
import { escapeXml } from './xml.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Elements whose text is content: whitespace between their children is not layout. */
const TEXTUAL = new Set(['text', 'tspan', 'textPath', 'style', 'script', 'title', 'desc']);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

/**
 * `attrs` are the attributes of the root element, with an `id` always (the caller places the
 * viewport itself, from `viewBox`, `preserveAspectRatio`, `width` and `height`, and passes the
 * rest on); `inner` is its content. Null when there is no `DOMParser`, the markup is not an SVG
 * document, or its CSS cannot be scoped to the instance: the caller embeds it as an `<image>`.
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
  const scope = scopeOf(root, prefix);
  try {
    return {
      attrs: { id: scope.scopeId, ...Object.fromEntries(attributesOf(root, scope)) },
      inner: Array.from(root.childNodes, (child) => serialize(child, root, scope)).join(''),
    };
  } catch (error) {
    if (error instanceof UnsafeCss) return null;
    throw error;
  }
}

function scopeOf(root: Element, prefix: string): CssScope {
  let name = root.getAttribute('id');
  if (name === null) {
    // A root without an id gets one that no element of the markup has.
    const taken = new Set(Array.from(root.querySelectorAll('[id]'), (e) => e.getAttribute('id')));
    name = 'root';
    while (taken.has(name)) name += '_';
  }
  const scopeId = prefix + name;
  const keyframes = new Set(
    Array.from(root.getElementsByTagName('style')).flatMap((style) =>
      keyframeNames(style.textContent ?? '')
    )
  );
  return { prefix, scopeId, keyframes };
}

function attributesOf(element: Element, scope: CssScope): [string, string][] {
  const kept: [string, string][] = [];
  for (const { name, value } of Array.from(element.attributes)) {
    // The writer's root declares both namespaces; any other declaration stays where it is.
    if (name === 'xmlns' && value === SVG_NS) continue;
    if (name === 'xmlns:xlink' && value === XLINK_NS) continue;
    if (name === 'id') kept.push([name, scope.prefix + value]);
    else if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) {
      kept.push([name, `#${scope.prefix}${value.slice(1)}`]);
    } else if (name === 'class') kept.push([name, scopeClassList(value, scope.prefix)]);
    else if (name === 'style') kept.push([name, scopeDeclarations(value, scope)]);
    else kept.push([name, rewriteUrls(value, scope.prefix)]);
  }
  return kept;
}

function serialize(node: Node, parent: Element, scope: CssScope): string {
  if (node.nodeType === ELEMENT_NODE) return serializeElement(node as Element, scope);
  if (node.nodeType !== TEXT_NODE && node.nodeType !== CDATA_NODE) return ''; // comments, instructions
  const text = node.nodeValue ?? '';
  if (text.trim() === '' && !TEXTUAL.has(parent.localName)) return '';
  return escapeXml(text);
}

function serializeElement(element: Element, scope: CssScope): string {
  const attributes = attributesOf(element, scope)
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join('');
  // A style sheet is scoped whole: a rule can straddle the text and CDATA nodes it is made of.
  const children =
    element.localName === 'style'
      ? escapeXml(scopeStylesheet(element.textContent ?? '', scope))
      : Array.from(element.childNodes, (child) => serialize(child, element, scope)).join('');
  const name = element.tagName;
  return children === ''
    ? `<${name}${attributes}/>`
    : `<${name}${attributes}>${children}</${name}>`;
}
