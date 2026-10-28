// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { brandDefault } from '../brand/brandDefault.js';
import { brandFingerprint } from '../brand/bindings.js';
import { logoEnvelope, brandLayout } from '../brand/layout.js';
import { deriveSchemes } from '../brand/schemes.js';
import { type BrandPack } from '../brand/brandPack.js';
import {
  instantiateTemplatePage,
  offeredSchemes,
  type GeometryTable,
  type InstantiateContext,
  type TemplateInput,
} from './instantiate.js';

const G: GeometryTable = {
  additionalTexts: { x: 'x', y: 'y', width: 'w', fontSize: 's' },
  shapeInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
  userImageInstances: { x: 'x', y: 'y', width: 'w', height: 'h' },
};
const canvas = { width: 1080, height: 1350 };
const logoBrand: BrandPack = { ...brandDefault, logo: { src: 'logo.svg', label: 'Logo' } };
const sizeOf = () => ({ width: 200, height: 100 });

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
}

function template(over: Partial<TemplateInput> = {}): TemplateInput {
  return {
    id: 't',
    version: 3,
    formats: ['4:5'],
    schemes: ['primary', 'light'],
    pages: [
      {
        state: {
          additionalTexts: [{ id: 'h', text: 'x', x: 0, y: 0.5, width: 1, fontSize: 0.0962963 }],
        },
      },
    ],
    ...over,
  };
}
const ctx = (over: Partial<InstantiateContext> = {}): InstantiateContext => ({
  brand: logoBrand,
  canvas,
  format: '4:5',
  geometry: G,
  logoSizeOf: sizeOf,
  ...over,
});
const ok = (t: TemplateInput, c: InstantiateContext) => {
  const r = instantiateTemplatePage(t, c);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r;
};
const logoTemplate = (extra: Partial<TemplateInput> = {}) =>
  template({
    logoCorners: ['bottom-right', 'top-left'],
    pages: [
      {
        state: {
          shapeInstances: [{ id: 's', x: 0, y: 0, width: 1, height: 0.1 }],
          userImageInstances: [
            {
              id: 'logo',
              src: '',
              x: 0,
              y: 0,
              width: 0.2,
              height: 0.1,
              bind: { src: 'brand.logo' },
            },
          ],
          additionalTexts: [{ id: 'h', text: 'x', x: 0, y: 0, width: 1, fontSize: 0.1 }],
          layerOrder: ['s', 'logo', 'h'],
        },
      },
    ],
    blocks: [
      { id: 'b', elementIds: ['logo', 'h'] },
      { id: 'c', elementIds: ['s', 'h'] },
    ],
    ...extra,
  });

describe('instantiateTemplatePage', () => {
  it('fractions of the safe frame become px', () => {
    const r = ok(template(), ctx());
    expect((r.state['additionalTexts'] as unknown[])[0]).toMatchObject({
      x: 97,
      y: 675,
      width: 886,
      fontSize: 104,
    });
  });

  it('a canvas-framed element ignores the margins', () => {
    const t = template({
      frames: { bg: 'canvas' },
      pages: [{ state: { shapeInstances: [{ id: 'bg', x: 0, width: 1 }] } }],
    });
    expect((ok(t, ctx()).state['shapeInstances'] as unknown[])[0]).toMatchObject({
      x: 0,
      width: 1080,
    });
  });

  it('bound fields take the world values and store {ref,value}', () => {
    const t = template({
      schemes: ['light'],
      pages: [{ state: { additionalTexts: [{ id: 'h', fill: '', bind: { fill: 'ink' } }] } }],
    });
    const ink = deriveSchemes(logoBrand).find((s) => s.id === 'light')!.roles.ink;
    const el = (ok(t, ctx()).state['additionalTexts'] as any[])[0]!;
    expect(el.fill).toBe(ink);
    expect(el.bind.fill).toEqual({ ref: 'ink', value: ink });
  });

  it('fixed fields stay literal and unbound', () => {
    const t = template({
      fixed: { h: ['fill'] },
      pages: [
        { state: { additionalTexts: [{ id: 'h', fill: '#123456', bind: { fill: 'ink' } }] } },
      ],
    });
    const el = (ok(t, ctx()).state['additionalTexts'] as any[])[0]!;
    expect(el.fill).toBe('#123456');
    expect(el.bind).toBeUndefined();
  });

  it('page-level bindings resolve too', () => {
    const t = template({
      pages: [{ state: { backgroundColor: '', bind: { backgroundColor: 'ground' } } }],
    });
    const r = ok(t, ctx());
    const ground = deriveSchemes(logoBrand).find((s) => s.id === r.schemeId)!.roles.ground;
    expect(r.state['backgroundColor']).toBe(ground);
    expect((r.state['bind'] as any).backgroundColor).toEqual({ ref: 'ground', value: ground });
  });

  it('an unresolvable ref keeps the literal and drops the binding', () => {
    const t = template({
      pages: [
        {
          state: {
            additionalTexts: [{ id: 'h', fontFamily: 'Arial', bind: { fontFamily: 'font.serif' } }],
          },
        },
      ],
    });
    const noAccent = {
      ...logoBrand,
      fonts: { ...logoBrand.fonts, serif: undefined, quoteEmphasis: undefined },
    } as unknown as BrandPack;
    const el = (ok(t, ctx({ brand: noAccent })).state['additionalTexts'] as any[])[0]!;
    expect(el.fontFamily).toBe('Arial');
    expect(el.bind).toBeUndefined();
  });

  it('an invalid bind ref refuses the template', () => {
    const t = template({
      pages: [{ state: { additionalTexts: [{ id: 'h', bind: { fill: 'nonsense' } }] } }],
    });
    expect(instantiateTemplatePage(t, ctx())).toEqual({ ok: false, reason: 'bind' });
  });

  it('a geometry fraction outside 0..1 refuses the template', () => {
    const t = template({
      pages: [{ state: { additionalTexts: [{ id: 'h', x: 1.2 }] } }],
    });
    expect(instantiateTemplatePage(t, ctx())).toEqual({ ok: false, reason: 'geometry' });
  });

  describe('number arrays', () => {
    const dashed = (dash: unknown, axis: 's' | 'x' = 's') => ({
      t: template({
        pages: [
          { state: { shapeInstances: [{ id: 'r', x: 0, y: 0, width: 1, height: 1, dash }] } },
        ],
      }),
      c: ctx({ geometry: { ...G, shapeInstances: { ...G['shapeInstances'], dash: axis } } }),
    });
    const dashOf = (r: ReturnType<typeof ok>) =>
      (r.state['shapeInstances'] as { dash: unknown }[])[0]!.dash;

    it('scales every element of a dash on the s axis', () => {
      // s = min(1080, 1350): 1/108 -> 10 and 1/216 -> 5.
      const { t, c } = dashed([1 / 108, 1 / 216]);
      expect(dashOf(ok(t, c))).toEqual([10, 5]);
    });

    it('keeps an empty array empty', () => {
      const { t, c } = dashed([]);
      expect(dashOf(ok(t, c))).toEqual([]);
    });

    it('refuses an array with a non-number in it', () => {
      const { t, c } = dashed([0.01, 'x']);
      expect(instantiateTemplatePage(t, c)).toEqual({ ok: false, reason: 'geometry' });
    });

    it('refuses an array on any other axis', () => {
      const { t, c } = dashed([0.01, 0.02], 'x');
      expect(instantiateTemplatePage(t, c)).toEqual({ ok: false, reason: 'geometry' });
    });
  });

  it("the brand's corner wins when the template leaves it free", () => {
    const brand = {
      ...logoBrand,
      layout: { ...brandLayout(logoBrand), logoCorner: 'top-left' as const },
    };
    const r = ok(logoTemplate(), ctx({ brand }));
    const env = logoEnvelope(brandLayout(brand), canvas, 'top-left');
    const logo = (r.state['userImageInstances'] as any[])[0]!;
    expect(logo.x).toBeGreaterThanOrEqual(env.x);
    expect(logo.y).toBeGreaterThanOrEqual(env.y);
    expect(logo.x + logo.width).toBeLessThanOrEqual(env.x + env.width);
    expect(logo.y + logo.height).toBeLessThanOrEqual(env.y + env.height);
    expect(logo.bind.src).toMatchObject({ ref: 'brand.logo', value: 'logo.svg', box: env });
    expect(logo.bind.src.fit).toEqual({
      x: logo.x,
      y: logo.y,
      width: logo.width,
      height: logo.height,
    });
    expect(logo.src).toBe('logo.svg');
  });

  it('the first free corner is used otherwise', () => {
    const t = logoTemplate({ logoCorners: ['top-right'] });
    const r = ok(t, ctx());
    const env = logoEnvelope(brandLayout(logoBrand), canvas, 'top-right');
    expect((r.state['userImageInstances'] as any[])[0]!.bind.src.box).toEqual(env);
  });

  it.each([
    ['no logo', { brand: brandDefault }],
    ['an unmeasured logo', { logoSizeOf: () => null }],
  ])('%s removes the logo, from layerOrder and groups too', (_n, over) => {
    const r = ok(logoTemplate(), ctx(over));
    expect(r.state['userImageInstances']).toEqual([]);
    expect(r.state['layerOrder']).toEqual(['s', 'h']);
    expect(r.state['groups']).toEqual([
      { id: 'c', blockRef: { id: 't/c', version: 3 }, elementIds: ['s', 'h'] },
    ]);
  });

  it('no free corner removes the logo', () => {
    const r = ok(logoTemplate({ logoCorners: [] }), ctx());
    expect(r.state['userImageInstances']).toEqual([]);
  });

  it('a format the template does not declare is refused', () => {
    expect(instantiateTemplatePage(template(), ctx({ format: '1:1' }))).toEqual({
      ok: false,
      reason: 'format',
    });
  });

  it('a brand that keeps none of the template worlds is refused', () => {
    const same = {
      ...brandDefault,
      colors: { ...brandDefault.colors, secondary: brandDefault.colors.primary },
    };
    expect(offeredSchemes({ schemes: ['secondary'] }, same)).toEqual([]);
    expect(
      instantiateTemplatePage(template({ schemes: ['secondary'] }), ctx({ brand: same }))
    ).toEqual({
      ok: false,
      reason: 'no-scheme',
    });
  });

  it('an unoffered schemeId falls back to the first offered', () => {
    const r = ok(template(), ctx({ schemeId: 'dark' }));
    expect(r.schemeId).toBe('primary');
    expect(ok(template(), ctx({ schemeId: 'light' })).schemeId).toBe('light');
  });

  it('placeholders follow the locale and fall back to en', () => {
    const t = template({ placeholders: { en: { h: 'Hello' }, de: { h: 'Hallo' } } });
    const text = (c: Partial<InstantiateContext>) =>
      (ok(t, ctx(c)).state['additionalTexts'] as any[])[0]!.text;
    expect(text({ locale: 'de' })).toBe('Hallo');
    expect(text({ locale: 'fr' })).toBe('Hello');
    expect(text({})).toBe('Hello');
  });

  it('texts without lineHeight take the brand factor', () => {
    const t = template({
      pages: [{ state: { additionalTexts: [{ id: 'a' }, { id: 'b', lineHeight: 1 }] } }],
    });
    const els = ok(t, ctx()).state['additionalTexts'] as any[];
    expect(els[0]!.lineHeight).toBe(logoBrand.lineHeightFactor);
    expect(els[1]!.lineHeight).toBe(1);
  });

  it('blocks become groups with library refs', () => {
    const r = ok(logoTemplate(), ctx());
    expect((r.state['groups'] as unknown[])[0]).toEqual({
      id: 'b',
      blockRef: { id: 't/b', version: 3 },
      elementIds: ['logo', 'h'],
    });
  });

  it('layerOrder defaults to shapes, images, texts', () => {
    const t = logoTemplate();
    delete (t.pages[0]!.state as any).layerOrder;
    expect(ok(t, ctx()).state['layerOrder']).toEqual(['s', 'logo', 'h']);
  });

  it('the page is stamped and records its origin', () => {
    const r = ok(template(), ctx());
    expect(r.state['templateRef']).toEqual({ id: 't', version: 3 });
    expect(r.state['brandScheme']).toBe('primary');
    expect(r.state['brandStamp']).toBe(brandFingerprint(logoBrand));
  });

  it('is deterministic and does not mutate the input', () => {
    const t = deepFreeze(logoTemplate({ placeholders: { en: { h: 'Hi' } } }));
    const a = instantiateTemplatePage(t, ctx());
    const b = instantiateTemplatePage(t, ctx());
    expect(a).toEqual(b);
  });

  it('the second logo is chosen by the ground and sized by its own src', () => {
    const brand: BrandPack = {
      ...logoBrand,
      logoAlt: { src: 'alt.svg', label: 'Alt', ground: 'light' },
    };
    const seen: string[] = [];
    const r = ok(
      logoTemplate({ schemes: ['light'] }),
      ctx({
        brand,
        logoSizeOf: (s) => {
          seen.push(s);
          return sizeOf();
        },
      })
    );
    const logo = (r.state['userImageInstances'] as any[])[0];
    expect(logo.src).toBe('alt.svg');
    expect(logo.bind.src.value).toBe('alt.svg');
    expect(seen).toEqual(['alt.svg']);
  });

  it('an unknown world id in the template is ignored', () => {
    const t = template({ schemes: ['bogus' as never, 'primary'] });
    expect(offeredSchemes(t, logoBrand)).toEqual(['primary']);
    expect(ok(t, ctx()).schemeId).toBe(deriveSchemes(logoBrand)[0]!.id);
  });

  it('other bindings on the logo survive', () => {
    const t = logoTemplate();
    const logo = (t.pages[0]!.state['userImageInstances'] as any[])[0];
    logo.bind = { src: 'brand.logo', opacity: 'ink' };
    const r = ok(t, ctx());
    const bind = (r.state['userImageInstances'] as any[])[0].bind;
    expect(bind.opacity).toMatchObject({ ref: 'ink' });
    expect(bind.src.ref).toBe('brand.logo');
  });

  it('a template without pages is refused as empty', () => {
    expect(instantiateTemplatePage(template({ pages: [] }), ctx())).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it.each([
    ['16:9', { width: 1920, height: 1080 }],
    ['1:1', { width: 1000, height: 1000 }],
  ])('%s: s and k follow the short side, h the frame height', (format, size) => {
    const S = Math.min(size.width, size.height);
    const g: GeometryTable = {
      additionalTexts: { fontSize: 's', letterSpacing: 'k', height: 'h' },
    };
    const t = template({
      formats: [format],
      pages: [
        {
          state: {
            additionalTexts: [{ id: 'a', fontSize: 0.1, letterSpacing: 0.5, height: 0.25 }],
          },
        },
      ],
    });
    const r = ok(t, ctx({ format, canvas: size, geometry: g }));
    const safe = Math.round(S * 0.09);
    expect((r.state['additionalTexts'] as any[])[0]).toMatchObject({
      fontSize: Math.round(0.1 * S),
      letterSpacing: (0.5 * S) / 1080,
      height: Math.round(0.25 * (size.height - 2 * safe)),
    });
    expect((r.state['additionalTexts'] as any[])[0].letterSpacing).not.toBe(
      Math.round((0.5 * S) / 1080)
    );
  });

  it('page metadata keys are not walked as elements', () => {
    const t = template({
      pages: [
        {
          state: {
            additionalTexts: [{ id: 'h', x: 0 }],
            groups: [{ id: 'g', x: 7, bind: { fill: 'nonsense' } }],
          },
        },
      ],
    });
    const r = instantiateTemplatePage(t, ctx({ geometry: { ...G, groups: { x: 'x' } } }));
    expect(r.ok).toBe(true);
  });
});
