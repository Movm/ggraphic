// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { brandDefault } from './brandDefault.js';
import { type BrandPack } from './brandPack.js';
import {
  brandFingerprint,
  firstFontFamily,
  groundClass,
  isBindingRef,
  rebindPageState,
  rebindPages,
  resolveRef,
} from './bindings.js';
import { deriveSchemes, schemeById } from './schemes.js';

/** A page item as the tests read it back. */
interface Item {
  fill?: string;
  color?: string;
  fontFamily?: string;
  src?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  bind?: { fill?: Binding; src?: Binding; fontFamily?: Binding };
}
type Binding = { ref: string; value: string; box?: object; fit?: object };

const brand: BrandPack = {
  ...brandDefault,
  colors: { ...brandDefault.colors, primary: '#0F3A52' },
  fonts: { ...brandDefault.fonts, headline: 'Raleway' },
};
const ctx = { brand };

const v1State = { textInstances: [{ id: 't', fill: '#ff0000' }], backgroundColor: '#ffffff' };

describe('brandFingerprint', () => {
  it('changes when only the markers change', () => {
    const swatches = [{ id: 'x', label: 'X', color: '#123456' }];
    const a = { ...brand, markers: { ...brand.markers, swatches } };
    expect(brandFingerprint(a)).not.toBe(brandFingerprint(brand));
    const b = { ...brand, markers: { ...brand.markers, ink: '#010203' } };
    expect(brandFingerprint(b)).not.toBe(brandFingerprint(brand));
  });
});

describe('rebindPageState', () => {
  it('a page without bindings comes back as the same object', () => {
    const r = rebindPageState(v1State, ctx);
    expect(r.state).toBe(v1State);
    expect(r.changed).toBe(false);
  });

  it('an up-to-date stamp writes nothing', () => {
    const state = {
      brandStamp: brandFingerprint(brand),
      textInstances: [
        { fill: '#000000', bind: { fill: { ref: 'brand.primary', value: '#1d3557' } } },
      ],
    };
    const r = rebindPageState(state, ctx);
    expect(r.state).toBe(state);
    expect(r.changed).toBe(false);
  });

  it('a bound text follows a new primary', () => {
    const state = {
      textInstances: [
        { fill: '#1d3557', bind: { fill: { ref: 'brand.primary', value: '#1d3557' } } },
      ],
    };
    const r = rebindPageState(state, ctx);
    const text = (r.state['textInstances'] as Item[])[0]!;
    expect(r.changed).toBe(true);
    expect(text.fill).toBe('#0f3a52');
    expect(text.bind?.fill?.value).toBe('#0f3a52');
    expect(r.state['brandStamp']).toBe(brandFingerprint(brand));
  });

  it('a hand-picked colour survives and loses its binding', () => {
    const state = {
      textInstances: [
        { fill: '#ff0000', bind: { fill: { ref: 'brand.primary', value: '#1d3557' } } },
      ],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as Item[])[0]!;
    expect(text.fill).toBe('#ff0000');
    expect(text.bind?.fill).toBeUndefined();
  });

  it('case and format differences are not overrides', () => {
    const state = {
      textInstances: [
        { fill: '#1D3557', bind: { fill: { ref: 'brand.primary', value: '#1d3557' } } },
      ],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as Item[])[0]!;
    expect(text.fill).toBe('#0f3a52');
  });

  it("a surface role follows the page's scheme", () => {
    const light = deriveSchemes(brand).find((s) => s.id === 'light')!;
    const state = {
      brandScheme: 'light',
      textInstances: [{ fill: '#123456', bind: { fill: { ref: 'ink', value: '#123456' } } }],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as Item[])[0]!;
    expect(text.fill).toBe(light.roles.ink);
  });

  it('an unresolvable ref drops the binding and keeps the value', () => {
    const state = {
      textInstances: [{ fill: '#123456', bind: { fill: { ref: 'ink', value: '#123456' } } }],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as Item[])[0]!;
    expect(text.fill).toBe('#123456');
    expect(text.bind?.fill).toBeUndefined();
  });

  it("the page's own bind rebinds backgroundColor", () => {
    const state = {
      backgroundColor: '#1d3557',
      bind: { backgroundColor: { ref: 'brand.primary', value: '#1d3557' } },
    };
    const r = rebindPageState(state, ctx);
    expect(r.state['backgroundColor']).toBe('#0f3a52');
  });

  it('icon states in records are walked', () => {
    const state = {
      iconStates: {
        a: { color: '#1d3557', bind: { color: { ref: 'brand.primary', value: '#1d3557' } } },
        b: { color: '#000000' },
      },
    };
    const r = rebindPageState(state, ctx);
    const icons = r.state['iconStates'] as { a: Item; b: Item };
    expect(icons.a.color).toBe('#0f3a52');
    expect(icons.b).toBe(state['iconStates'].b);
  });

  it('idempotent', () => {
    const state = {
      backgroundColor: '#1d3557',
      bind: { backgroundColor: { ref: 'brand.primary', value: '#1d3557' } },
    };
    const once = rebindPageState(state, ctx);
    const twice = rebindPageState(once.state, ctx);
    expect(twice.state).toBe(once.state);
    expect(twice.changed).toBe(false);
  });

  it('fonts', () => {
    const state = {
      textInstances: [
        { fontFamily: 'Raleway', bind: { fontFamily: { ref: 'font.headline', value: 'Raleway' } } },
      ],
    };
    const other: BrandPack = { ...brand, fonts: { ...brand.fonts, headline: 'Lora' } };
    const text = (rebindPageState(state, { brand: other }).state['textInstances'] as Item[])[0]!;
    expect(text.fontFamily).toBe('Lora');
  });

  describe('fitted text sizes', () => {
    const other: BrandPack = { ...brand, fonts: { ...brand.fonts, headline: 'Lora' } };
    const fonted = (extra: Record<string, unknown>) => ({
      id: 't',
      fontFamily: 'Raleway',
      fontSize: 60,
      bind: { fontFamily: { ref: 'font.headline', value: 'Raleway' } },
      ...extra,
    });
    const sizes = (state: Record<string, unknown>) =>
      (state['additionalTexts'] as { fontSize: number }[]).map((t) => t.fontSize);

    it('refits a text with maxFontSize when its font changes, with the page state at hand', () => {
      const state = {
        templateRef: { id: 'x', version: 1 },
        additionalTexts: [fonted({ maxFontSize: 80 })],
      };
      const seen: unknown[] = [];
      const out = rebindPageState(state, {
        brand: other,
        fitText: (el, page) => {
          seen.push([el['fontFamily'], page['templateRef']]);
          return 72;
        },
      });
      expect(sizes(out.state)).toEqual([72]);
      expect(seen).toEqual([['Lora', { id: 'x', version: 1 }]]);
    });

    it('does not touch a text without maxFontSize, or one whose font did not change', () => {
      const plain = { additionalTexts: [fonted({})] };
      const fit = () => 72;
      expect(sizes(rebindPageState(plain, { brand: other, fitText: fit }).state)).toEqual([60]);
      const same = { additionalTexts: [fonted({ maxFontSize: 80 })] };
      expect(sizes(rebindPageState(same, { brand, fitText: fit }).state)).toEqual([60]);
    });
  });

  describe('font stacks', () => {
    const stacked = (family: string) => ({
      textInstances: [
        {
          fontFamily: family,
          bind: { fontFamily: { ref: 'font.headline', value: 'Raleway' } },
        },
      ],
    });
    const lora: BrandPack = { ...brand, fonts: { ...brand.fonts, headline: 'Lora' } };
    const textOf = (r: { state: Record<string, unknown> }) =>
      (r.state['textInstances'] as Item[])[0]!;

    it('a stacked field counts as bound', () => {
      const text = textOf(rebindPageState(stacked('Raleway, Arial, sans-serif'), { brand: lora }));
      expect(text.bind?.fontFamily).toBeDefined();
    });

    it('a rebind replaces the first family and keeps the tail', () => {
      const text = textOf(
        rebindPageState(stacked('"raleway", Arial, sans-serif'), { brand: lora })
      );
      expect(text.fontFamily).toBe('Lora, Arial, sans-serif');
      expect(text.bind?.fontFamily?.value).toBe('Lora');
    });

    it('a different first family is an override', () => {
      const text = textOf(rebindPageState(stacked('Georgia, serif'), { brand: lora }));
      expect(text.fontFamily).toBe('Georgia, serif');
      expect(text.bind?.fontFamily).toBeUndefined();
    });
  });
});

describe('rebindPageState edge cases', () => {
  it('a deduplicated scheme falls back to the first derived scheme', () => {
    const same: BrandPack = {
      ...brand,
      colors: { ...brand.colors, secondary: brand.colors.primary },
    };
    expect(schemeById(same, 'secondary')).toBeNull();
    const first = deriveSchemes(same)[0]!;
    const state = {
      brandScheme: 'secondary',
      textInstances: [{ fill: '#123456', bind: { fill: { ref: 'ink', value: '#123456' } } }],
    };
    const text = (rebindPageState(state, { brand: same }).state['textInstances'] as Item[])[0]!;
    expect(text.fill).toBe(first.roles.ink);
  });

  it('a logo binding on src follows the new logo', () => {
    const logoBrand: BrandPack = { ...brand, logo: { src: 'new.svg', label: 'Logo' } };
    const state = {
      images: [{ src: 'old.svg', bind: { src: { ref: 'brand.logo', value: 'old.svg' } } }],
    };
    const img = (rebindPageState(state, { brand: logoBrand }).state['images'] as Item[])[0]!;
    expect(img.src).toBe('new.svg');
    expect(img.bind?.src?.value).toBe('new.svg');
  });

  describe('logo box', () => {
    const logoBrand: BrandPack = { ...brand, logo: { src: 'new.svg', label: 'Logo' } };
    const pageSize = { width: 1080, height: 1350 };
    const stateWith = () => ({
      images: [
        {
          src: 'old.svg',
          x: 900,
          y: 1200,
          width: 120,
          height: 80,
          bind: { src: { ref: 'brand.logo', value: 'old.svg' } },
        },
      ],
    });
    const imgOf = (r: { state: Record<string, unknown> }) => (r.state['images'] as Item[])[0]!;

    it('rebind swaps src and fits the box when the logo size is known', () => {
      const img = imgOf(
        rebindPageState(stateWith(), {
          brand: logoBrand,
          logoSize: { width: 400, height: 100 },
          pageSize,
        })
      );
      expect(img.src).toBe('new.svg');
      expect([img.x, img.y, img.width, img.height]).toEqual([900, 1250, 120, 30]);
    });

    it('rebind swaps src but keeps the box when the size is unknown', () => {
      const img = imgOf(
        rebindPageState(stateWith(), { brand: logoBrand, logoSize: null, pageSize })
      );
      expect(img.src).toBe('new.svg');
      expect([img.x, img.y, img.width, img.height]).toEqual([900, 1200, 120, 80]);
    });

    describe('size unknown at rebind time', () => {
      const known = { width: 400, height: 100 };
      const unknown = (state: Record<string, unknown>) =>
        rebindPageState(state, { brand: logoBrand, logoSize: null, pageSize });

      it('an unknown size marks the binding pendingFit', () => {
        const img = imgOf(unknown(stateWith()));
        expect(img.bind?.src).toMatchObject({ value: 'new.svg', pendingFit: true });
      });

      it('a later known size fits under the same stamp and saves once', () => {
        const first = unknown(stateWith());
        const fitted = rebindPageState(first.state, {
          brand: logoBrand,
          logoSize: known,
          pageSize,
        });
        expect(fitted.changed).toBe(true);
        expect(fitted.state['brandStamp']).toBe(first.state['brandStamp']);
        const img = imgOf(fitted);
        expect([img.x, img.y, img.width, img.height]).toEqual([900, 1250, 120, 30]);
        expect(img.bind?.src).not.toHaveProperty('pendingFit');
        const again = rebindPageState(fitted.state, {
          brand: logoBrand,
          logoSize: known,
          pageSize,
        });
        expect(again.changed).toBe(false);
        expect(again.state).toBe(fitted.state);
      });

      it('writes nothing while the size stays unknown', () => {
        const first = unknown(stateWith());
        const again = unknown(first.state);
        expect(again.changed).toBe(false);
        expect(again.state).toBe(first.state);
      });
    });

    it('a second rebind changes nothing', () => {
      const first = rebindPageState(stateWith(), {
        brand: logoBrand,
        logoSize: { width: 400, height: 100 },
        pageSize,
      });
      const second = rebindPageState(first.state, {
        brand: logoBrand,
        logoSize: { width: 400, height: 100 },
        pageSize,
      });
      expect(second.changed).toBe(false);
      expect(second.state).toBe(first.state);
    });

    it('an unchanged src leaves a user-moved box alone', () => {
      const state = {
        images: [
          {
            src: 'new.svg',
            x: 10,
            y: 20,
            width: 300,
            height: 200,
            bind: { src: { ref: 'brand.logo', value: 'new.svg' } },
          },
        ],
      };
      const img = imgOf(
        rebindPageState(state, {
          brand: logoBrand,
          logoSize: { width: 400, height: 100 },
          pageSize,
        })
      );
      expect([img.x, img.y, img.width, img.height]).toEqual([10, 20, 300, 200]);
    });

    describe('logo envelope', () => {
      const WIDE = { width: 400, height: 100 };
      const SQUARE = { width: 100, height: 100 };
      const ENVELOPE = { x: 800, y: 1150, width: 238, height: 108 };
      const brandOf = (src: string): BrandPack => ({ ...brand, logo: { src, label: 'Logo' } });
      const seeded = (box: typeof ENVELOPE) => ({
        images: [
          {
            src: 'seed.svg',
            ...box,
            bind: { src: { ref: 'brand.logo', value: 'seed.svg', box: ENVELOPE, fit: box } },
          },
        ],
      });
      const box = (img: Item) => [img.x, img.y, img.width, img.height];
      const swap = (state: Record<string, unknown>, src: string, size: typeof WIDE) =>
        rebindPageState(state, { brand: brandOf(src), logoSize: size, pageSize }).state;

      it('wide, square, wide never ends smaller than the first wide fit', () => {
        const first = swap(seeded({ ...ENVELOPE, width: 238, height: 59, y: 1199 }), 'a.svg', WIDE);
        const second = swap(first, 'b.svg', SQUARE);
        const third = swap(second, 'c.svg', WIDE);
        expect(box(imgOf({ state: third }))).toEqual(box(imgOf({ state: first })));
      });

      it('a square after a wide logo fits like a fresh seed', () => {
        const afterWide = swap(
          swap(seeded({ ...ENVELOPE, width: 238, height: 59, y: 1199 }), 'a.svg', WIDE),
          'b.svg',
          SQUARE
        );
        const fresh = swap(seeded({ ...ENVELOPE }), 'b.svg', SQUARE);
        expect(box(imgOf({ state: afterWide }))).toEqual(box(imgOf({ state: fresh })));
      });

      it('a box moved by hand becomes the new envelope', () => {
        const fitted = swap(
          seeded({ ...ENVELOPE, width: 238, height: 59, y: 1199 }),
          'a.svg',
          WIDE
        );
        const img = imgOf({ state: fitted });
        const moved = {
          images: [{ ...img, x: 100, y: 100, width: 300, height: 200 }],
        };
        const next = imgOf({ state: swap(moved, 'b.svg', SQUARE) });
        expect(box(next)).toEqual([100, 100, 200, 200]);
      });

      it('a binding written before the envelope existed uses the current box once, then stores it', () => {
        const legacy = swap(stateWith(), 'new.svg', WIDE);
        const bind = imgOf({ state: legacy }).bind?.src as unknown as { box: object; fit: object };
        expect(bind.box).toEqual({ x: 900, y: 1200, width: 120, height: 80 });
        const back = swap(swap(legacy, 'b.svg', SQUARE), 'c.svg', WIDE);
        expect(box(imgOf({ state: back }))).toEqual(box(imgOf({ state: legacy })));
      });
    });

    it('a brand without a logo keeps the image and drops the binding', () => {
      const img = imgOf(
        rebindPageState(stateWith(), { brand: { ...brand, logo: null }, logoSize: null, pageSize })
      );
      expect(img.src).toBe('old.svg');
      expect(img.bind).toBeUndefined();
    });
  });

  it('an invalid binding is dropped and the field kept', () => {
    const state = {
      textInstances: [
        {
          fill: '#123456',
          fontFamily: 'X',
          bind: {
            fill: { ref: 'nonsense', value: '#123456' },
            fontFamily: { ref: 'font.body', value: 5 },
          },
        },
      ],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as Item[])[0]!;
    expect(text.fill).toBe('#123456');
    expect(text.fontFamily).toBe('X');
    expect(text.bind).toBeUndefined();
  });

  it('a stale stamp is written even when every binding was dropped', () => {
    const state = {
      textInstances: [
        { fill: '#ff0000', bind: { fill: { ref: 'brand.primary', value: '#1d3557' } } },
      ],
    };
    const r = rebindPageState(state, ctx);
    expect(r.changed).toBe(true);
    expect(r.state['brandStamp']).toBe(brandFingerprint(brand));
  });
});

describe('a page whose world was deduplicated', () => {
  // A near-white secondary absorbs `light`: its ground stands in for the surface world.
  const near: BrandPack = {
    ...brandDefault,
    colors: { ...brandDefault.colors, secondary: '#FAFAFA' },
  };

  it('follows the kept world that absorbed it, not the first one', () => {
    expect(deriveSchemes(near).some((x) => x.id === 'light')).toBe(false);
    const state = {
      brandScheme: 'light',
      backgroundColor: '#f6f4ef',
      bind: { backgroundColor: { ref: 'ground', value: '#f6f4ef' } },
    };
    const r = rebindPageState(state, { brand: near });
    const secondary = deriveSchemes(near).find((x) => x.id === 'secondary')!;
    expect(r.state['backgroundColor']).toBe(secondary.roles.ground);
    expect(r.state['backgroundColor']).not.toBe(deriveSchemes(near)[0]!.roles.ground);
  });
});

describe('rebindPages', () => {
  it('keeps unchanged pages and reports changes', () => {
    const bound = {
      state: {
        backgroundColor: '#1d3557',
        bind: { backgroundColor: { ref: 'brand.primary', value: '#1d3557' } },
      },
    };
    const plain = { state: v1State };
    const r = rebindPages([plain, bound], ctx);
    expect(r.changed).toBe(true);
    expect(r.pages[0]).toBe(plain);
    expect(r.pages[1]).not.toBe(bound);
  });
});

describe('brandFingerprint', () => {
  it('ignores palette order but not colours', () => {
    const reordered: BrandPack = { ...brand, palette: [...brand.palette].reverse() };
    expect(brandFingerprint(reordered)).toBe(brandFingerprint(brand));
    const changed: BrandPack = { ...brand, colors: { ...brand.colors, accent: '#123456' } };
    expect(brandFingerprint(changed)).not.toBe(brandFingerprint(brand));
    expect(brandFingerprint(brand)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('P2 brand additions', () => {
  it('fingerprint of brandDefault (re-stamped when its fonts became Bricolage/Anton)', () => {
    expect(brandFingerprint(brandDefault)).toBe('0df912b2');
  });

  it('resolves the brand font roles', () => {
    expect(resolveRef('font.serif', brandDefault, null)).toBe('Fraunces');
    expect(resolveRef('font.condensed', brandDefault, null)).toBe('Anton');
    expect(resolveRef('font.headline', brandDefault, null)).toBe('Bricolage Grotesque');
    const lora = { ...brandDefault, fonts: { ...brandDefault.fonts, serif: 'Lora' } };
    expect(resolveRef('font.serif', lora, null)).toBe('Lora');
  });

  it('isBindingRef accepts font.serif and font.condensed', () => {
    expect(isBindingRef('font.serif')).toBe(true);
    expect(isBindingRef('font.condensed')).toBe(true);
    expect(isBindingRef('font.nope')).toBe(false);
  });

  it('new fields change the fingerprint only when present', () => {
    const withSerif = { ...brandDefault, fonts: { ...brandDefault.fonts, serif: 'Lora' } };
    const withAlt = {
      ...brandDefault,
      logoAlt: { src: '/b.png', label: 'x', ground: 'dark' as const },
    };
    expect(brandFingerprint(withSerif)).not.toBe(brandFingerprint(brandDefault));
    expect(brandFingerprint(withAlt)).not.toBe(brandFingerprint(brandDefault));
    expect(brandFingerprint({ ...brandDefault, logoAlt: null })).toBe(
      brandFingerprint(brandDefault)
    );
  });

  describe('logoAlt', () => {
    const base: BrandPack = {
      ...brandDefault,
      colors: { ...brandDefault.colors, primary: '#1d3557' },
      logo: { src: '/a.png', label: 'a' },
      logoAlt: { src: '/b.png', label: 'x', ground: 'dark' },
    };
    const world = (b: BrandPack, id: 'primary' | 'light') => schemeById(b, id);

    it('brand.logo picks logoAlt on a ground of its class', () => {
      expect(resolveRef('brand.logo', base, world(base, 'primary'))).toBe('/b.png');
      expect(resolveRef('brand.logo', base, world(base, 'light'))).toBe('/a.png');
      const noMain = { ...base, logo: null };
      expect(resolveRef('brand.logo', noMain, world(noMain, 'light'))).toBe('/b.png');
      expect(resolveRef('brand.logo', base, null)).toBe('/a.png');
      expect(resolveRef('brand.logo', { ...noMain, logoAlt: null }, null)).toBeNull();
    });

    it('the main logo size does not fit the second logo when its own size is unknown', () => {
      const state = {
        brandScheme: 'primary',
        images: [
          {
            src: '/a.png',
            x: 900,
            y: 1200,
            width: 120,
            height: 80,
            bind: { src: { ref: 'brand.logo', value: '/a.png' } },
          },
        ],
      };
      const out = rebindPageState(state, {
        brand: base,
        logoSize: { width: 100, height: 100 },
        // The main logo measured, the second one failed to load.
        logoSizeOf: (src) => (src === '/a.png' ? { width: 100, height: 100 } : null),
        pageSize: { width: 1080, height: 1350 },
      });
      const img = (out.state['images'] as Item[])[0]!;
      expect(img.src).toBe('/b.png');
      expect([img.x, img.y, img.width, img.height]).toEqual([900, 1200, 120, 80]);
      expect(img.bind?.src).toMatchObject({ value: '/b.png', pendingFit: true });
    });

    it('logoSizeOf sizes the chosen logo', () => {
      const state = {
        brandScheme: 'primary',
        images: [
          {
            src: '/a.png',
            x: 900,
            y: 1200,
            width: 120,
            height: 80,
            bind: { src: { ref: 'brand.logo', value: '/a.png' } },
          },
        ],
      };
      const asked: string[] = [];
      const out = rebindPageState(state, {
        brand: base,
        logoSize: { width: 100, height: 100 },
        logoSizeOf: (src) => {
          asked.push(src);
          return { width: 400, height: 100 };
        },
        pageSize: { width: 1080, height: 1350 },
      });
      const img = (out.state['images'] as Item[])[0]!;
      expect(img.src).toBe('/b.png');
      expect(asked).toContain('/b.png');
      expect([img.width, img.height]).toEqual([120, 30]);
    });
  });

  it('a font stack is not a hand edit', () => {
    const lora: BrandPack = { ...brand, fonts: { ...brand.fonts, headline: 'Lora' } };
    const state = (family: string) => ({
      textInstances: [
        { fontFamily: family, bind: { fontFamily: { ref: 'font.headline', value: 'Raleway' } } },
      ],
    });
    const same = (
      rebindPageState(state('Raleway, Arial, sans-serif'), { brand: lora }).state[
        'textInstances'
      ] as Item[]
    )[0]!;
    expect(same.fontFamily).toMatch(/^Lora/);
    expect(same.bind?.fontFamily).toBeDefined();
    const other = (
      rebindPageState(state('Georgia'), { brand: lora }).state['textInstances'] as Item[]
    )[0]!;
    expect(other.fontFamily).toBe('Georgia');
    expect(other.bind).toBeUndefined();
  });

  it('a free text switched to a font role follows a brand whose font for that role changes', () => {
    const bebas: BrandPack = { ...brand, fonts: { ...brand.fonts, condensed: 'Bebas Neue' } };
    // What `setAdditionalTextFontRole` writes: the stack and the binding together.
    const state = {
      additionalTexts: [
        {
          fontFamily: 'Anton, Arial, sans-serif',
          bind: { fontFamily: { ref: 'font.condensed', value: 'Anton' } },
        },
      ],
    };
    const out = (rebindPageState(state, { brand: bebas }).state['additionalTexts'] as Item[])[0]!;
    expect(out.fontFamily).toBe('Bebas Neue, Arial, sans-serif');
    expect(out.bind?.fontFamily).toEqual({ ref: 'font.condensed', value: 'Bebas Neue' });
  });

  it('groundClass', () => {
    expect(groundClass('#ffffff')).toBe('light');
    expect(groundClass('#1d3557')).toBe('dark');
    // The brief listed #777777 as dark, but its contrast is 4.48 vs white and 4.68 vs black.
    expect(groundClass('#777777')).toBe('light');
    expect(groundClass('#707070')).toBe('dark');
  });

  it('firstFontFamily', () => {
    expect(firstFontFamily('Raleway, Arial')).toBe('raleway');
    expect(firstFontFamily('"Fraunces"')).toBe('fraunces');
  });
});
