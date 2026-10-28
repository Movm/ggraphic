// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { brandDefault } from './brandDefault.js';
import { type BrandPack } from './brandPack.js';
import { brandFingerprint, rebindPageState, rebindPages } from './bindings.js';
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
