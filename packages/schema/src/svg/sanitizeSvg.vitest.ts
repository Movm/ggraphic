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

describe('sanitizeSvg: use expansion', () => {
  /** n levels, each holding `fan` uses of the level below: fan^n instances (probe mk.mts). */
  const bomb = (n: number, fan: number) => {
    let body = '<defs><path id="l0" d="M0 0h1v1z" fill="red"/>';
    for (let i = 1; i <= n; i++) {
      body += `<g id="l${i}">${`<use href="#l${i - 1}"/>`.repeat(fan)}</g>`;
    }
    return wrap(`${body}</defs><use href="#l${n}"/>`);
  };

  it('refuses the reference bomb (10 levels of 10 uses)', () => {
    const input = bomb(10, 10);
    expect(input.length).toBeLessThan(MAX_SVG_CHARS);
    expect(sanitizeSvg(input)).toBeNull();
  });

  it('refuses a smaller bomb whose expansion still passes the cap', () => {
    expect(sanitizeSvg(bomb(5, 10))).toBeNull();
  });

  it('refuses a use that references its own ancestor', () => {
    expect(sanitizeSvg(wrap('<g id="a"><use href="#a"/></g>'))).toBeNull();
    expect(sanitizeSvg(wrap('<symbol id="s"><g><use href="#s"/></g></symbol>'))).toBeNull();
  });

  it('refuses a mutual cycle', () => {
    expect(
      sanitizeSvg(
        wrap('<g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g><use href="#a"/>')
      )
    ).toBeNull();
  });

  it('keeps a legitimate icon with a few uses, also the same target twice', () => {
    const input = wrap(
      '<defs><path id="p" d="M0 0h4"/><g id="pair"><use href="#p"/><use href="#p" x="5"/></g></defs>' +
        '<use href="#pair"/><use href="#pair" y="8"/><use href="#missing"/>'
    );
    expect(sanitizeSvg(input)).not.toBeNull();
  });
});

describe('sanitizeSvg: href', () => {
  it('emits one href when both spellings are present, preferring the plain one', () => {
    const input = `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a" href="#b"/></svg>`;
    const out = sanitizeSvg(input)!;
    expect(out).toBe(`<svg ${NS}><use href="#b"/></svg>`);
    expect(sanitizeSvg(out)).toBe(out);
  });

  it('drops both when the plain one is not a fragment', () => {
    const input = `<svg ${NS} xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a" href="http://evil"/></svg>`;
    expect(sanitizeSvg(input)).toBe(`<svg ${NS}><use/></svg>`);
  });
});

describe('sanitizeSvg: presentation values', () => {
  const clean = (attrs: string) => sanitizeSvg(wrap(`<path d="M0 0" ${attrs}/>`))!;

  it.each([
    'fill="image-set(&quot;http://evil/x.png&quot; 1x)"',
    'fill="-webkit-image-set(url(#a) 1x)"',
    'fill="image(&quot;x&quot;)"',
    'fill="cross-fade(url(#a), url(#b), 50%)"',
    'fill="src(&quot;x&quot;)"',
    'fill="expression(alert(1))"',
    'fill="var(--x)"',
    'stroke="calc(1px + 2px)"',
    'transform="foo(1)"',
  ])('drops %s', (attr) => {
    expect(clean(attr)).toBe(wrap('<path d="M0 0"/>'));
  });

  it('keeps colour functions, transforms and fragment urls', () => {
    const out = clean(
      'fill="rgb(1 2 3)" stroke="hsla(1, 2%, 3%, .5)" transform="translate(1 2) rotate(5)" gradientTransform="matrix(1 0 0 1 0 0)"'
    );
    expect(out).toContain('fill="rgb(1 2 3)"');
    expect(out).toContain('stroke="hsla(1, 2%, 3%, .5)"');
    expect(out).toContain('transform="translate(1 2) rotate(5)"');
  });

  it('allows only none or one url(#id) in mask and clip-path', () => {
    expect(clean('clip-path="none"')).toContain('clip-path="none"');
    expect(clean('mask="url(#m)"')).toContain('mask="url(#m)"');
    for (const bad of ['url(#m) url(#n)', 'url(#m) red', 'circle(50%)', 'inset(1px)', 'fill-box']) {
      expect(clean(`clip-path="${bad}"`)).toBe(wrap('<path d="M0 0"/>'));
    }
  });

  it('accepts only the five XML space characters inside url( )', () => {
    expect(clean('fill="url(\u00a0#g)"')).toBe(wrap('<path d="M0 0"/>'));
    expect(clean('fill="url( #g )"')).toContain('fill="url( #g )"');
  });
});

describe('sanitizeSvg: idempotence at the size cap', () => {
  it('returns null when escaping pushes the output past the cap', () => {
    // Each `&amp;` in the source is 5 chars, and `"` in an attribute grows from 1 to 6.
    const title = '<'.repeat(0);
    const text = '&amp;'.repeat(Math.floor((MAX_SVG_CHARS - 200) / 5));
    const input = `<svg ${NS}><title>${text}${title}</title></svg>`;
    expect(input.length).toBeLessThanOrEqual(MAX_SVG_CHARS);
    const out = sanitizeSvg(input);
    // Re-escaped text is the same size here, so it may pass; what must hold is idempotence.
    if (out !== null) expect(sanitizeSvg(out)).toBe(out);
    // Raw `>` (1 char) comes back as `&gt;` (4 chars): this one must be refused.
    const grows = `<svg ${NS}><title>${'>'.repeat(MAX_SVG_CHARS - 100)}</title></svg>`;
    expect(grows.length).toBeLessThanOrEqual(MAX_SVG_CHARS);
    expect(sanitizeSvg(grows)).toBeNull();
  });
});
