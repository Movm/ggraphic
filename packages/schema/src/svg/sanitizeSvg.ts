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
/** XML/CSS whitespace only; `\s` would also take no-break space and friends. */
const WS = '[ \\t\\n\\r\\f]*';
const REF = `(?:"#[A-Za-z0-9_.:-]+"|'#[A-Za-z0-9_.:-]+'|#[A-Za-z0-9_.:-]+)`;
const URL_FRAGMENT = new RegExp(`url\\(${WS}${REF}${WS}\\)`, 'gi');
const URL_ONLY = new RegExp(`^(?:none|url\\(${WS}${REF}${WS}\\))$`, 'i');
/** Properties that take a single reference or `none`; no shapes, no lists. */
const REFERENCE_ONLY = /^(?:mask|clip-path|filter|marker(?:-start|-mid|-end)?)$/;
const TRANSFORM_FUNCTIONS = new Set(['matrix', 'translate', 'scale', 'rotate', 'skewx', 'skewy']);
const COLOUR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla']);

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) < 0x20) return true;
  return false;
}

/**
 * The value if it may stay, else null. Presentation attributes are parsed as CSS, so escapes
 * go, and so does every function but the few an icon needs: url(#id), colour functions, and
 * the transform functions in transform attributes. That closes `image-set(`, `image(`,
 * `cross-fade(`, `src(`, `expression(`, `var(` and `calc(` without naming them.
 */
function safeValue(name: string, value: string): string | null {
  if (name === 'href') return FRAGMENT.test(value) ? value : null;
  if (name === 'id') return ID.test(value) ? value : null;
  if (value.includes('\\') || hasControlChar(value)) return null;
  if (REFERENCE_ONLY.test(name)) return URL_ONLY.test(value) ? value : null;
  const isTransform = name === 'transform' || name === 'gradientTransform';
  const calls = (value.match(/url\(/gi) ?? []).length;
  // Every url( must be a reference to an element in this same file.
  if ((value.match(URL_FRAGMENT)?.length ?? 0) !== calls) return null;
  for (const match of value.matchAll(/([A-Za-z-]*)\(/g)) {
    const fn = (match[1] ?? '').toLowerCase();
    const ok = isTransform ? TRANSFORM_FUNCTIONS.has(fn) : fn === 'url' || COLOUR_FUNCTIONS.has(fn);
    if (!ok) return null;
  }
  return value;
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

  interface Shape {
    id: string | null;
    children: Shape[];
    target: string | null;
  }
  let nodes = 0;
  let tooBig = false;

  const write = (el: Element, depth: number, shape: Shape): string => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) {
      tooBig = true;
      return '';
    }
    const name = el.localName;
    const kept = new Map<string, string>();
    let xlinkHref: string | null = null;
    let plainHref = false;
    for (const attr of Array.from(el.attributes)) {
      const local = attr.localName ?? '';
      if (!attr.namespaceURI) {
        if (!ATTRIBUTES.has(local)) continue;
        if (local === 'href') plainHref = true;
        const value = safeValue(local, attr.value);
        if (value !== null) kept.set(local, value);
      } else if (attr.namespaceURI === XLINK_NS && attr.localName === 'href') {
        xlinkHref = attr.value;
      }
    }
    // `xlink:href` is the old spelling of `href`; when both are there, the plain one decides.
    if (xlinkHref !== null && !plainHref) {
      const value = safeValue('href', xlinkHref);
      if (value !== null) kept.set('href', value);
    }
    shape.id = kept.get('id') ?? null;
    shape.target = name === 'use' ? (kept.get('href')?.slice(1) ?? null) : null;
    let attrs = el.parentNode?.nodeType === 1 ? '' : ` xmlns="${SVG_NS}"`;
    for (const [key, value] of kept) attrs += ` ${key}="${escapeAttr(value)}"`;
    let inner = '';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 1) {
        const childEl = child as Element;
        if (childEl.namespaceURI === SVG_NS && ELEMENTS.has(childEl.localName ?? '')) {
          const childShape: Shape = { id: null, children: [], target: null };
          shape.children.push(childShape);
          inner += write(childEl, depth + 1, childShape);
        }
      } else if ((child.nodeType === 3 || child.nodeType === 4) && name === 'title') {
        inner += escapeText(child.nodeValue ?? '');
      }
    }
    return inner ? `<${name}${attrs}>${inner}</${name}>` : `<${name}${attrs}/>`;
  };

  const rootShape: Shape = { id: null, children: [], target: null };
  const out = write(root, 0, rootShape);
  // Escaping can grow the text; output the next pass would refuse is not output.
  if (tooBig || out.length > MAX_SVG_CHARS) return null;
  return expandedSize(rootShape) === null ? null : out;
}

interface ShapeLike {
  id: string | null;
  children: ShapeLike[];
  target: string | null;
}

/**
 * How many elements the picture draws once every `<use>` is expanded, or null when a
 * reference loops or the total passes MAX_NODES. Source size says nothing: 10 levels of
 * ten uses are 2 KB and a million instances.
 */
function expandedSize(root: ShapeLike): number | null {
  const byId = new Map<string, ShapeLike>();
  const index = (shape: ShapeLike) => {
    if (shape.id !== null && !byId.has(shape.id)) byId.set(shape.id, shape);
    shape.children.forEach(index);
  };
  index(root);

  const sizes = new Map<ShapeLike, number>();
  const active = new Set<ShapeLike>();
  let failed = false;
  const size = (shape: ShapeLike): number => {
    const known = sizes.get(shape);
    if (known !== undefined) return known;
    if (active.has(shape)) {
      failed = true;
      return 0;
    }
    active.add(shape);
    let total = 1;
    for (const child of shape.children) total += size(child);
    const target = shape.target === null ? undefined : byId.get(shape.target);
    if (target) total += size(target);
    active.delete(shape);
    if (total > MAX_NODES) failed = true;
    sizes.set(shape, total);
    return total;
  };
  const total = size(root);
  return failed || total > MAX_NODES ? null : total;
}
