// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAssetCatalog, type CanvasAssetCatalog } from '../canvasAssets.js';
import { findIllustrationById } from './registry.js';
import { clearCache, getSVG } from './svgCache.js';

import type { SvgDef } from './types.js';

// A host ships a set of its own and names it for the type checker.
declare module '@ggraphic/core' {
  interface SvgSources {
    hostset: true;
  }
}

const HOST_DEF: SvgDef = {
  id: 'host-1',
  name: 'Host',
  filename: 'one.svg',
  source: 'hostset',
  tags: [],
};
const DOODLE_DEF: SvgDef = { ...HOST_DEF, id: 'doodle-1', source: 'opendoodles' };
const PLAIN_DEF: SvgDef = { ...HOST_DEF, id: 'gopher-1', source: 'gophers' };
// @ts-expect-error a set nobody declared does not typecheck
const UNDECLARED: SvgDef = { ...HOST_DEF, source: 'nobodys' };
void UNDECLARED;

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#6C63FF"/><path fill="#ff5678"/></svg>';

function catalog(recolor?: Record<string, string>): CanvasAssetCatalog {
  return {
    assets: [],
    isInstanceSrc: () => false,
    illustrations: {
      loadKawaii: () => Promise.resolve([]),
      loadSvg: () => Promise.resolve([HOST_DEF, DOODLE_DEF, PLAIN_DEF]),
      basePath: '/illustrations',
      ...(recolor ? { recolor } : {}),
    },
  };
}

const decode = (dataUrl: string) =>
  decodeURIComponent(escape(atob(dataUrl.replace('data:image/svg+xml;base64,', ''))));

beforeEach(() => {
  clearCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(SVG)))
  );
});
afterEach(() => {
  registerAssetCatalog({ assets: [], isInstanceSrc: () => false });
  vi.unstubAllGlobals();
});

describe('an SVG set the host ships', () => {
  it('resolves by id like a built-in set', async () => {
    registerAssetCatalog(catalog());
    expect(await findIllustrationById('host-1')).toEqual(HOST_DEF);
  });

  it('is tinted by swapping the colour the host names for it', async () => {
    registerAssetCatalog(catalog({ hostset: '#6c63ff' }));
    const svg = decode(await getSVG('host-1', HOST_DEF, '#123456'));
    expect(svg).toContain('fill="#123456"');
    expect(svg).not.toMatch(/#6c63ff/i);
    expect(svg).toContain('#ff5678');
  });

  it('cannot write markup into the svg with a colour that is none', async () => {
    registerAssetCatalog(catalog({ hostset: '#6c63ff' }));
    // The colour comes from the document, and an export inlines this svg as it is.
    const svg = decode(
      await getSVG('host-1', HOST_DEF, '#123456" onload="alert(1)"><script>alert(2)</script><g x="')
    );
    expect(svg).not.toMatch(/onload|<script|#123456/);
    expect(svg).toContain('#6C63FF');
  });

  it('keeps its colours when the host names none', async () => {
    registerAssetCatalog(catalog());
    const svg = decode(await getSVG('host-1', HOST_DEF, '#123456'));
    expect(svg).not.toContain('#123456');
  });
});

describe('the built-in sets', () => {
  it('tint Open Doodles without a host entry', async () => {
    registerAssetCatalog(catalog());
    const svg = decode(await getSVG('doodle-1', DOODLE_DEF, '#123456'));
    expect(svg).toContain('fill="#123456"');
    expect(svg).toMatch(/#6c63ff/i);
  });

  it('leave a set without a recolour key as it is', async () => {
    registerAssetCatalog(catalog());
    const svg = decode(await getSVG('gopher-1', PLAIN_DEF, '#123456'));
    expect(svg).not.toContain('#123456');
  });
});
