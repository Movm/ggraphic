// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Puts an organisation's brand pack into the editor: its fonts are loaded with the
 * FontFace API (the scripted `@font-face`, but awaitable), then the pack is registered
 * first, with the Studio's own pack second so documents that name it keep rendering.
 * Without a pack the editor runs on `studioBrand` alone.
 */
import { type BrandFontFace, type BrandPack } from '@ggraphic/core';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';

import { studioBrand } from './brand';
import { measureLogo } from './logoSize';

const loaded = new Map<string, Promise<void>>();

function loadFace(face: BrandFontFace): Promise<void> {
  const key = `${face.family}|${face.src}`;
  let pending = loaded.get(key);
  if (!pending) {
    pending = (async () => {
      if (typeof FontFace === 'undefined' || !('add' in document.fonts)) return;
      const font = new FontFace(face.family, `url(${JSON.stringify(face.src)})`, {
        weight: String(face.weight ?? 400),
        style: face.style ?? 'normal',
      });
      document.fonts.add(font);
      try {
        await font.load();
      } catch {
        // A broken file renders in the fallback family; the editor stays usable.
        console.warn(`Font "${face.family}" could not be loaded.`);
      }
    })();
    loaded.set(key, pending);
  }
  return pending;
}

export async function loadBrandFonts(faces: readonly BrandFontFace[]): Promise<void> {
  await Promise.all(faces.map(loadFace));
}

export async function applyBrandPack(pack: BrandPack | null): Promise<void> {
  if (pack)
    await Promise.all([
      loadBrandFonts(pack.fontFaces),
      pack.logo && measureLogo(pack.logo.src),
      pack.logoAlt && measureLogo(pack.logoAlt.src),
    ]);
  registerBrandPacks(pack ? [pack, studioBrand] : [studioBrand]);
}
