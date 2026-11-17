// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Keeps the CSS of an inlined SVG to that SVG.
 *
 * A `<style>` in a nested `<svg>` is a style sheet of the whole output document, so two inlined
 * illustrations that both say `.cls-1 { fill: … }`, or one that says `path { fill: red }`, would
 * recolour each other and the rest of the page. Per instance (`prefix`, `i0-`):
 *
 * - a class is renamed, in `class` attributes and in selectors: `.a.b:hover` → `.i0-a.i0-b:hover`;
 * - an id selector is renamed like the id it names;
 * - every selector is put under the instance's root, so a type selector hits only its own
 *   elements: `path` → `#i0-root path`, and `svg` (the root itself) → `#i0-root`. Class and id
 *   selectors are scoped too, not only the type ones: a selector gains the same one id of
 *   specificity as every other, so rules of the instance keep their order among themselves;
 * - `@keyframes` names and the `animation` values that use them are renamed, `@media` and
 *   `@supports` are rewritten inside, and `@font-face` stays as it is (a font name is global).
 *
 * This is a tokenizer for the shapes SVG tools write, not a CSS parser. What it cannot rewrite
 * without guessing throws `UnsafeCss`, and the caller does not inline that SVG: embedded as an
 * `<image>` it is still vector and cannot touch anything. That is: attribute selectors on `class`
 * or `id`, `:is()`, `:where()`, `:not()`, `:has()`, `:root`, escapes, namespaces, nesting, `@import`
 * and at-rules that are none of the above.
 *
 * A class or id selector that targets the root element itself (`.cls-0` on `<svg class="cls-0">`)
 * no longer matches: its selector now asks for an element inside the root.
 */
export class UnsafeCss extends Error {
  constructor(reason: string) {
    super(`css of an inlined svg cannot be scoped: ${reason}`);
    this.name = 'UnsafeCss';
  }
}

export interface CssScope {
  /** Put before every class, id and keyframes name: `i0-`. */
  prefix: string;
  /** The id of the instance's root element, as written into the output (prefix included). */
  scopeId: string;
  /** Names of the `@keyframes` of the whole instance, as the markup wrote them. */
  keyframes: ReadonlySet<string>;
}

/** `url(#a)`, `url('#a')` and `url("#a")` in a property value or a `style` attribute. */
export function rewriteUrls(value: string, prefix: string): string {
  return value.replace(
    /url\(\s*(['"]?)#([^)'"\s]*)\1\s*\)/g,
    (_match, quote: string, id: string) => `url(${quote}#${prefix}${id}${quote})`
  );
}

/** `class="a b"` → `class="i0-a i0-b"`. */
export function scopeClassList(value: string, prefix: string): string {
  return value
    .split(/\s+/)
    .filter((name) => name !== '')
    .map((name) => prefix + name)
    .join(' ');
}

/** The names `@keyframes` declares in a style sheet. */
export function keyframeNames(css: string): string[] {
  return Array.from(css.matchAll(/@(?:-[a-z]+-)?keyframes\s+([\w-]+)/gi), (match) => match[1]!);
}

/** Declarations (a rule body or a `style` attribute): url references and animation names. */
export function scopeDeclarations(declarations: string, scope: CssScope): string {
  return rewriteUrls(declarations, scope.prefix).replace(
    /(animation(?:-name)?\s*:)([^;}]*)/gi,
    (_match, head: string, value: string) =>
      head +
      value.replace(/[\w-]+/g, (word) => (scope.keyframes.has(word) ? scope.prefix + word : word))
  );
}

export function scopeStylesheet(css: string, scope: CssScope): string {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: string[] = [];
  let at = 0;
  while (at < text.length) {
    if (/\s/.test(text[at]!)) {
      at++;
      continue;
    }
    const open = find(text, at, '{;');
    if (open < 0 || text[open] === ';') throw new UnsafeCss('a statement, not a rule');
    const close = blockEnd(text, open);
    if (close < 0) throw new UnsafeCss('an unclosed block');
    rules.push(scopeRule(text.slice(at, open).trim(), text.slice(open + 1, close), scope));
    at = close + 1;
  }
  return rules.join(' ');
}

function scopeRule(prelude: string, body: string, scope: CssScope): string {
  if (prelude.startsWith('@')) {
    const match = /^@(?:-[a-z]+-)?([\w-]+)\s*([\s\S]*)$/i.exec(prelude);
    const name = match?.[1]?.toLowerCase();
    const rest = match?.[2] ?? '';
    switch (name) {
      case 'font-face':
        return `${prelude} {${body}}`;
      case 'keyframes': {
        if (!/^[\w-]+$/.test(rest)) throw new UnsafeCss(`keyframes name "${rest}"`);
        const keyword = prelude.slice(0, prelude.length - rest.length);
        return `${keyword}${scope.prefix}${rest} {${rewriteUrls(body, scope.prefix)}}`;
      }
      case 'media':
      case 'supports':
        return `${prelude} { ${scopeStylesheet(body, scope)} }`;
      default:
        throw new UnsafeCss(`@${name ?? ''}`);
    }
  }
  if (body.includes('{')) throw new UnsafeCss('a nested rule');
  const selectors = splitList(prelude).map((selector) => scopeSelector(selector, scope));
  return `${selectors.join(', ')} {${scopeDeclarations(body, scope)}}`;
}

const UNSAFE_PSEUDO =
  /:(?:is|where|not|has|matches|any|root|host|host-context|scope|global|local)\b|:-(?:webkit|moz)-any\b/i;
const NTH_ARGUMENT = /^(?:[\s\dn+-]*|\s*(?:odd|even)\s*)$/i;

function scopeSelector(selector: string, scope: CssScope): string {
  const text = selector.trim();
  if (text === '' || /^[>+~]/.test(text)) throw new UnsafeCss(`selector "${selector}"`);
  if (/[\\&]/.test(text) || UNSAFE_PSEUDO.test(text)) throw new UnsafeCss(`selector "${text}"`);

  let out = '';
  for (let at = 0; at < text.length;) {
    const char = text[at]!;
    if (char === '[') {
      const end = find(text, at + 1, ']');
      if (end < 0) throw new UnsafeCss(`selector "${text}"`);
      const attribute = text.slice(at, end + 1);
      // `[class~=a]` and `[id=a]` name what is being renamed.
      if (/^\[\s*(?:[\w-]*\|)?(?:class|id)\b/i.test(attribute)) {
        throw new UnsafeCss(`attribute selector ${attribute}`);
      }
      out += attribute;
      at = end + 1;
    } else if (char === '.' || char === '#') {
      const name = /^[.#](-?[_a-zA-Z][\w-]*)/.exec(text.slice(at))?.[1];
      if (name === undefined) throw new UnsafeCss(`selector "${text}"`);
      out += `${char}${scope.prefix}${name}`;
      at += 1 + name.length;
    } else if (char === '(') {
      // Only the position functions: `:nth-child(2n+1 of .a)` has a selector in it.
      const end = text.indexOf(')', at);
      if (end < 0 || !/:nth-(?:last-)?(?:child|of-type)$/.test(out)) {
        throw new UnsafeCss(`selector "${text}"`);
      }
      if (!NTH_ARGUMENT.test(text.slice(at + 1, end))) throw new UnsafeCss(`selector "${text}"`);
      out += text.slice(at, end + 1);
      at = end + 1;
    } else if (char === '|') {
      throw new UnsafeCss(`namespace in "${text}"`);
    } else {
      out += char;
      at++;
    }
  }

  const rootId = `#${scope.scopeId}`;
  if (/^svg(?![\w-])/i.test(out)) return rootId + out.slice(3);
  if (out.startsWith(rootId) && !/[\w-]/.test(out[rootId.length] ?? '')) return out;
  return `${rootId} ${out}`;
}

// -- the little scanner ----------------------------------------------------------------------

/**
 * The index of the first of `stops` outside quotes, brackets and parentheses, or -1. A `]` stop
 * is looked for at depth 0 too: the caller starts after the `[`.
 */
function find(text: string, from: number, stops: string): number {
  let quote = '';
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const char = text[at]!;
    if (quote) {
      if (char === '\\') at++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (depth <= 0 && stops.includes(char)) return at;
    else if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
  }
  return -1;
}

/** The `}` that closes the `{` at `open`, or -1. */
function blockEnd(text: string, open: number): number {
  let quote = '';
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    const char = text[at]!;
    if (quote) {
      if (char === '\\') at++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return at;
  }
  return -1;
}

/** A selector list split at its top-level commas. */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let comma = find(list, 0, ','); comma >= 0; comma = find(list, start, ',')) {
    parts.push(list.slice(start, comma));
    start = comma + 1;
  }
  parts.push(list.slice(start));
  return parts;
}
