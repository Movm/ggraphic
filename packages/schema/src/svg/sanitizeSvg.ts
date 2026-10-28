// SPDX-License-Identifier: MPL-2.0
/**
 * Makes an SVG from outside safe to store in a design and to draw as an image:
 * it is parsed, and only allowlisted elements and attributes are written back
 * out. Nothing is "found and removed" with patterns, so a spelling the patterns
 * did not think of (`<svg/onload=…>`, CSS escapes, SMIL that rewrites `href`)
 * has nothing to hide in: it either fails to parse or is not on the list.
 *
 * Used by the Studio server on what the icon proxy returns and by the editor on
 * what a document carries, so a collaborator's document is judged by the same
 * rules. The parser (`@xmldom/xmldom`) runs in Node and in the browser.
 */
import { DOMParser, type Element } from '@xmldom/xmldom';

/** Larger input is refused before it is parsed. */
export const MAX_SVG_CHARS = 64 * 1024;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const MAX_DEPTH = 32;
const MAX_NODES = 5000;

const ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'rect',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'use',
  'title',
  'symbol',
]);

/** Geometry and presentation attributes. No `style`, `class`, `on*`, no font or filter attributes. */
const ATTRIBUTES = new Set([
  'viewBox',
  'preserveAspectRatio',
  'width',
  'height',
  'x',
  'y',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'fx',
  'fy',
  'fr',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'color',
  'display',
  'visibility',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'clipPathUnits',
  'maskUnits',
  'maskContentUnits',
  'clip-path',
  'mask',
  'id',
  'href',
]);

const FRAGMENT = /^#[A-Za-z0-9_.:-]+$/;
const ID = /^[A-Za-z0-9_.:-]+$/;
const URL_CALL = /url\(/gi;
const URL_FRAGMENT = /url\(\s*(?:"#[A-Za-z0-9_.:-]+"|'#[A-Za-z0-9_.:-]+'|#[A-Za-z0-9_.:-]+)\s*\)/gi;

/** The value if it may stay, else null. Presentation attributes are parsed as CSS, so escapes go. */
function safeValue(name: string, value: string): string | null {
  if (name === 'href') return FRAGMENT.test(value) ? value : null;
  if (name === 'id') return ID.test(value) ? value : null;
  if (value.includes('\\') || /[\u0000-\u001f]/.test(value)) return null;
  const calls = value.match(URL_CALL)?.length ?? 0;
  if (calls === 0) return value;
  // Every url( must be a reference to an element in this same file.
  return (value.match(URL_FRAGMENT)?.length ?? 0) === calls ? value : null;
}

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

/**
 * The cleaned SVG as markup, or null when the input is too big, not well-formed
 * XML, has a doctype, or is not an `<svg>` in the SVG namespace.
 */
export function sanitizeSvg(input: string): string | null {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_SVG_CHARS) return null;
  // A doctype is the door to entities; icons never need one.
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) return null;

  let failed = false;
  const parser = new DOMParser({
    onError: () => {
      failed = true;
    },
  });
  let root: Element | null;
  try {
    root = parser.parseFromString(input, 'image/svg+xml').documentElement;
  } catch {
    return null;
  }
  if (failed || !root || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return null;

  let nodes = 0;
  let tooBig = false;

  const write = (el: Element, depth: number): string => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) {
      tooBig = true;
      return '';
    }
    const name = el.localName;
    let attrs = el.parentNode?.nodeType === 1 ? '' : ` xmlns="${SVG_NS}"`;
    for (const attr of Array.from(el.attributes)) {
      let key: string | null = null;
      if (!attr.namespaceURI) key = attr.localName;
      // `xlink:href` is the old spelling of `href`.
      else if (attr.namespaceURI === XLINK_NS && attr.localName === 'href') key = 'href';
      if (key === null || !ATTRIBUTES.has(key)) continue;
      const value = safeValue(key, attr.value);
      if (value !== null) attrs += ` ${key}="${escapeAttr(value)}"`;
    }
    let inner = '';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1) {
        const childEl = child as Element;
        if (childEl.namespaceURI === SVG_NS && ELEMENTS.has(childEl.localName ?? '')) {
          inner += write(childEl, depth + 1);
        }
      } else if ((child.nodeType === 3 || child.nodeType === 4) && name === 'title') {
        inner += escapeText(child.nodeValue ?? '');
      }
    }
    return inner ? `<${name}${attrs}>${inner}</${name}>` : `<${name}${attrs}/>`;
  };

  const out = write(root, 0);
  return tooBig ? null : out;
}
