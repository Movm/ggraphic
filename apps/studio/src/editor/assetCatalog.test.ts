// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The bundled illustration and emoji packs: every file the catalogue names
 * must ship in `public/`, or a tile loads a 404.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { registerAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';
import { loadEmojiCatalog } from '@ggraphic/editor/utils/emoji/emojiCatalog';
import { describe, expect, it } from 'vitest';

import { studioAssetCatalog } from './assetCatalog';

const PUBLIC = path.resolve(import.meta.dirname, '../../public');
const onDisk = (urlPath: string) => existsSync(path.join(PUBLIC, urlPath));

describe('studioAssetCatalog', () => {
  const catalog = studioAssetCatalog();

  it('has no catalogue graphics of its own: the packs are illustrations and emoji', () => {
    expect(catalog.assets).toEqual([]);
    expect(catalog.isInstanceSrc('/emoji/emoji_u1f600.svg')).toBe(false);
  });

  it('serves emoji files from /emoji', () => {
    expect(catalog.emojiSrc?.('1f600')).toBe('/emoji/emoji_u1f600.svg');
  });

  it('lists no emoji without a shipped file, no flags and no skin-tone variants', async () => {
    registerAssetCatalog(catalog);
    const groups = await loadEmojiCatalog();
    const all = groups.flatMap((g) => g.emoji);
    expect(all.length).toBeGreaterThan(1000);
    for (const emoji of all) {
      expect(onDisk(emoji.src.slice(1)), emoji.id).toBe(true);
      expect(emoji.tones, emoji.id).toBeNull();
    }
    expect(groups.map((g) => g.label)).not.toContain('Flaggen');
  });

  it('lists only illustrations whose SVG and thumbnail ship', async () => {
    const svgs = await catalog.illustrations!.loadSvg();
    expect(svgs.length).toBeGreaterThan(100);
    const base = catalog.illustrations!.basePath;
    expect(base).toBe('/illustrations');
    for (const def of svgs) {
      expect(onDisk(`illustrations/${def.source}/${def.filename}`), def.id).toBe(true);
      expect(
        onDisk(`illustrations/thumbs/${def.source}/${def.filename.replace(/\.svg$/, '.png')}`),
        def.id
      ).toBe(true);
    }
  });

  it('ships only sets with a notices entry, none of the retired ones', async () => {
    const sources = new Set((await catalog.illustrations!.loadSvg()).map((d) => d.source));
    expect([...sources].sort()).toEqual(['opendoodles', 'openpeeps']);
    expect((await catalog.illustrations!.loadKawaii()).length).toBe(11);
  });
});
