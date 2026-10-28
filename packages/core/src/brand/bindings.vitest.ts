// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { brandDefault } from './brandDefault.js';
import { type BrandPack } from './brandPack.js';
import { brandFingerprint, rebindPageState, rebindPages } from './bindings.js';
import { deriveSchemes } from './schemes.js';

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
    const text = (r.state['textInstances'] as any[])[0]!;
    expect(r.changed).toBe(true);
    expect(text.fill).toBe('#0f3a52');
    expect(text.bind.fill.value).toBe('#0f3a52');
    expect(r.state['brandStamp']).toBe(brandFingerprint(brand));
  });

  it('a hand-picked colour survives and loses its binding', () => {
    const state = {
      textInstances: [
        { fill: '#ff0000', bind: { fill: { ref: 'brand.primary', value: '#1d3557' } } },
      ],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as any[])[0]!;
    expect(text.fill).toBe('#ff0000');
    expect(text.bind?.fill).toBeUndefined();
  });

  it('case and format differences are not overrides', () => {
    const state = {
      textInstances: [
        { fill: '#1D3557', bind: { fill: { ref: 'brand.primary', value: '#1d3557' } } },
      ],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as any[])[0]!;
    expect(text.fill).toBe('#0f3a52');
  });

  it("a surface role follows the page's scheme", () => {
    const light = deriveSchemes(brand).find((s) => s.id === 'light')!;
    const state = {
      brandScheme: 'light',
      textInstances: [{ fill: '#123456', bind: { fill: { ref: 'ink', value: '#123456' } } }],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as any[])[0]!;
    expect(text.fill).toBe(light.roles.ink);
  });

  it('an unresolvable ref drops the binding and keeps the value', () => {
    const state = {
      textInstances: [{ fill: '#123456', bind: { fill: { ref: 'ink', value: '#123456' } } }],
    };
    const text = (rebindPageState(state, ctx).state['textInstances'] as any[])[0]!;
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
    const icons = r.state['iconStates'] as any;
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
    const text = (rebindPageState(state, { brand: other }).state['textInstances'] as any[])[0]!;
    expect(text.fontFamily).toBe('Lora');
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
