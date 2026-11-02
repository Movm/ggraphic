// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanvasAssetCatalog } from '../canvasAssets.js';

const emojiSrc = (code: string) => `/emoji/emoji_u${code}.svg`;
const bare: CanvasAssetCatalog = { assets: [], isInstanceSrc: () => false, emojiSrc };

afterEach(() => vi.resetModules());

/** A fresh registry and catalogue cache per call: both are module-level. */
async function load(host: CanvasAssetCatalog, locale: 'de' | 'en' = 'de') {
  vi.resetModules();
  const { registerMessages } = await import('../../i18n/messages.js');
  registerMessages(locale);
  const { registerAssetCatalog } = await import('../canvasAssets.js');
  registerAssetCatalog(host);
  const { loadEmojiCatalog } = await import('./emojiCatalog.js');
  return loadEmojiCatalog();
}

describe('loadEmojiCatalog with a host that ships a subset', () => {
  it('lists the full Noto set, skin tones included, when the host offers everything', async () => {
    const groups = await load(bare);
    const all = groups.flatMap((g) => g.emoji);
    expect(groups.some((g) => g.label === 'Flaggen')).toBe(true);
    expect(all.some((e) => e.tones !== null)).toBe(true);
  });

  it('drops what the host does not offer, and the tones of what it keeps', async () => {
    const groups = await load({
      ...bare,
      emojiOffered: (code, group) => group !== 'flags' && !/1f3f[b-f]/.test(code),
    });
    const all = groups.flatMap((g) => g.emoji);
    expect(groups.some((g) => g.label === 'Flaggen')).toBe(false);
    expect(all.length).toBeGreaterThan(1000);
    expect(all.every((e) => e.tones === null)).toBe(true);
    expect(all.some((e) => e.id === 'emoji-1f600')).toBe(true);
  });

  it('keeps only the tones the host offers', async () => {
    const groups = await load({ ...bare, emojiOffered: (code) => code !== '1f44b_1f3fb' });
    const wave = groups.flatMap((g) => g.emoji).find((e) => e.id === 'emoji-1f44b');
    expect(wave?.tones).toBeNull();
  });
});

describe('loadEmojiCatalog speaks the language of the editor', () => {
  it('names emoji and groups in English on an English host, with the same set', async () => {
    const de = (await load(bare)).flatMap((g) => g.emoji.map((e) => e.id));
    const groups = await load(bare, 'en');
    expect(groups.map((g) => g.label)).toContain('Flags');
    const grin = groups.flatMap((g) => g.emoji).find((e) => e.id === 'emoji-1f600');
    expect(grin?.label).toBe('grinning face');
    expect(grin?.tags).toContain('happy');
    expect(groups.flatMap((g) => g.emoji.map((e) => e.id))).toEqual(de);
  });

  it('filters by the group key, whatever the language', async () => {
    const groups = await load({ ...bare, emojiOffered: (_code, group) => group !== 'flags' }, 'en');
    expect(groups.some((g) => g.label === 'Flags')).toBe(false);
  });
});
