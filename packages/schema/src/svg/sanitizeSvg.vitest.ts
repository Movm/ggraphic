// SPDX-License-Identifier: MPL-2.0
import { DOMParser, type Element } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import { MAX_SVG_CHARS, sanitizeSvg } from './sanitizeSvg.js';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const wrap = (inner: string, attrs = '') => `<svg ${NS} viewBox="0 0 24 24"${attrs}>${inner}</svg>`;

/** Tag names and sorted attributes of an element tree, ignoring whitespace-only text. */
function tree(xml: string): unknown {
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
  const walk = (el: Element): unknown => ({
    tag: el.localName,
    attrs: Array.from(el.attributes)
      .filter((a) => !a.name.startsWith('xmlns'))
      .map((a) => `${a.localName}=${a.value}`)
      .sort(),
    children: Array.from(el.childNodes)
      .filter((n): n is Element => n.nodeType === 1)
      .map(walk),
  });
  return walk(doc.documentElement!);
}

describe('sanitizeSvg: what is refused', () => {
  it.each([
    ['unquoted attribute (<svg/onload=…>)', `<svg/onload=alert(1) ${NS}></svg>`],
    ['attribute glued to the previous one', `<svg ${NS} a="1"onload="x()"></svg>`],
    ['not xml at all', '<html><body></body></html>'],
    ['wrong root', `<g ${NS}></g>`],
    ['svg in a foreign namespace', '<svg xmlns="http://evil/ns"></svg>'],
    ['a doctype with an entity', `<!DOCTYPE svg [<!ENTITY x "y">]><svg ${NS}>&x;</svg>`],
    ['an unclosed tag', `<svg ${NS}><path d="M0 0">`],
    ['oversize input', wrap(' '.repeat(MAX_SVG_CHARS))],
    ['empty input', ''],
  ])('returns null for %s', (_name, input) => {
    expect(sanitizeSvg(input)).toBeNull();
  });
});

describe('sanitizeSvg: what is neutralised', () => {
  const clean = (inner: string, attrs = '') => sanitizeSvg(wrap(inner, attrs))!;

  it('drops script, foreignObject, image, a, style, iframe', () => {
    for (const tag of [
      '<script>alert(1)</script>',
      '<foreignObject><div/></foreignObject>',
      '<image href="http://evil/x.png"/>',
      '<a href="javascript:alert(1)"><path d="M0 0"/></a>',
      '<style>path{fill:red}</style>',
      '<iframe/>',
    ]) {
      const out = clean(`<path d="M0 0"/>${tag}`);
      expect(out).toBe(wrap('<path d="M0 0"/>'));
    }
  });

  it('drops every on* attribute, whatever its case', () => {
    const out = clean(
      '<path d="M0 0" onclick="x()" OnLoad="x()" onmouseover="x()"/>',
      ' onload="x()"'
    );
    expect(out).not.toMatch(/on[a-z]+=/i);
    expect(out).toContain('d="M0 0"');
  });

  it('drops style attributes, including CSS escapes', () => {
    const out = clean('<path d="M0 0" style="fill:\\75 rl(http://evil) ;@\\69mport"/>');
    expect(out).toBe(wrap('<path d="M0 0"/>'));
  });

  it('drops a <style> element that hides @import behind an escape', () => {
    expect(clean('<style>@\\69mport "http://evil";</style><path d="M0 0"/>')).toBe(
      wrap('<path d="M0 0"/>')
    );
  });

  it('drops a value with a CSS escape in a presentation attribute', () => {
    expect(clean('<path d="M0 0" fill="\\75 rl(http://evil)"/>')).toBe(wrap('<path d="M0 0"/>'));
  });

  it('drops SMIL that rewrites href or runs script', () => {
    const out = clean(
      '<a><animate attributeName="href" values="javascript&#58;alert(1)"/></a>' +
        '<use href="#a"><set attributeName="href" to="javascript:alert(1)"/></use>' +
        '<animateTransform attributeName="transform" values="0;1"/>'
    );
    expect(out).not.toMatch(/animate|set|javascript/i);
    expect(out).toContain('<use href="#a"/>');
  });

  it('keeps only fragment references in href and xlink:href', () => {
    const out = clean(
      '<use href="http://evil/x.svg#a"/><use href="data:image/svg+xml,x"/><use href="javascript:x"/>' +
        `<use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#b"/>`
    );
    expect(out).toBe(wrap('<use/><use/><use/><use href="#b"/>'));
  });

  it('keeps only url(#id) in attributes', () => {
    const out = clean(
      '<path d="M0 0" fill="url(http://evil/x)"/><path d="M1 1" stroke="url(&quot;http://evil&quot;)"/>' +
        '<path d="M2 2" fill="url(#g)"/><path d="M3 3" clip-path=\'url("#c")\'/>'
    );
    expect(out).not.toContain('evil');
    expect(out).toContain('fill="url(#g)"');
    expect(out).toContain('clip-path="url(&quot;#c&quot;)"');
  });

  it('drops attributes and elements from other namespaces', () => {
    const out = clean(
      '<x:evil xmlns:x="http://evil/ns"><path d="M9 9"/></x:evil><path d="M0 0" xmlns:y="http://evil/y" y:fill="red"/>'
    );
    expect(out).toBe(wrap('<path d="M0 0"/>'));
  });

  it('escapes text and attribute values on the way out', () => {
    const out = clean('<title>a &lt;b&gt; &amp; "c"</title><path d="M0 0" id="a&quot;b"/>');
    expect(out).toContain('<title>a &lt;b&gt; &amp; "c"</title>');
    expect(out).not.toContain('id=');
  });

  it('refuses a tree that is absurdly deep', () => {
    const deep = '<g>'.repeat(200) + '</g>'.repeat(200);
    expect(sanitizeSvg(wrap(deep))).toBeNull();
  });
});

describe('sanitizeSvg: what survives', () => {
  it('keeps <use href="#a"> and fill="url(#g)"', () => {
    const input = wrap(
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient>' +
        '<path id="a" d="M0 0h4"/></defs><use href="#a"/><rect width="4" height="4" fill="url(#g)"/>'
    );
    const out = sanitizeSvg(input)!;
    expect(out).toContain('<use href="#a"/>');
    expect(out).toContain('fill="url(#g)"');
  });

  it('round-trips a real multi-colour icon with the same element tree', () => {
    // Shape of an Iconify "flat-color-icons" icon: gradients, clip path, use, several fills.
    const icon =
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1em" height="1em" viewBox="0 0 48 48">` +
      `<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">` +
      `<stop offset="0" stop-color="#ffc107"/><stop offset="1" stop-color="#ff5722" stop-opacity=".8"/></linearGradient>` +
      `<radialGradient id="b" cx="24" cy="24" r="20" fx="20" fy="20" gradientTransform="scale(1)"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>` +
      `<clipPath id="c"><circle cx="24" cy="24" r="20"/></clipPath><mask id="m"><rect width="48" height="48" fill="#fff"/></mask>` +
      `<path id="p" d="M10 10h28v28H10z"/></defs>` +
      `<g clip-path="url(#c)" mask="url(#m)" opacity=".9"><circle cx="24" cy="24" r="20" fill="url(#a)"/>` +
      `<use href="#p" fill="url(#b)" transform="rotate(5 24 24)"/>` +
      `<path fill="#4caf50" fill-rule="evenodd" stroke="#1b5e20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 24l8 8 16-16"/>` +
      `<ellipse cx="24" cy="40" rx="8" ry="2" fill-opacity=".3"/><line x1="0" y1="0" x2="4" y2="4" stroke="#000"/>` +
      `<polyline points="0,0 4,4 8,0" fill="none" stroke="#000"/><polygon points="0,0 4,0 2,4" fill="#00f"/></g>` +
      `<title>Check</title></svg>`;
    const out = sanitizeSvg(icon)!;
    expect(out).not.toBeNull();
    expect(tree(out)).toEqual(tree(icon));
  });

  it('turns xlink:href into a plain href', () => {
    const input = `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg>`;
    expect(sanitizeSvg(input)).toBe(`<svg ${NS}><use href="#a"/></svg>`);
  });

  it('is idempotent', () => {
    const once = sanitizeSvg(wrap('<path d="M0 0" fill="url(#g)" onclick="x()"/>'))!;
    expect(sanitizeSvg(once)).toBe(once);
  });
});
