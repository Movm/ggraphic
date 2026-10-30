// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The graphics the Studio bundles, as the host catalogue the editor looks them
 * up in (`registerAssetCatalog`): Noto Emoji, the Open Peeps and Open Doodles
 * illustrations and the Kawaii characters. Their files live in `public/`
 * (`/emoji`, `/illustrations`) and every set has an entry in
 * THIRD_PARTY_NOTICES.md, which `scripts/check-licences.mjs` enforces.
 *
 * A subset of the sources' full sets: no flags and no skin-tone variants of
 * the emoji, no Gophers, no illlustrations.co. The sets are not exhaustive
 * because the files are served from the Studio image; see the notices.
 */
import { type CanvasAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';
import { KAWAII_ILLUSTRATIONS } from '@ggraphic/editor/utils/illustrations/kawaii';

import { STUDIO_ELEMENT_PANEL } from './blocks/blockPanel';

const SKIN_TONE = /1f3f[b-f]/;

export function studioAssetCatalog(): CanvasAssetCatalog {
  return {
    assets: [],
    isInstanceSrc: () => false,
    elementPanel: STUDIO_ELEMENT_PANEL,
    emojiSrc: (code) => `/emoji/emoji_u${code}.svg`,
    emojiOffered: (code, group) => group !== 'Flaggen' && !SKIN_TONE.test(code),
    illustrations: {
      loadKawaii: () => Promise.resolve(KAWAII_ILLUSTRATIONS),
      loadSvg: async () => {
        const [{ OPENDOODLES }, { OPENPEEPS }] = await Promise.all([
          import('@ggraphic/editor/utils/illustrations/opendoodles'),
          import('@ggraphic/editor/utils/illustrations/openpeeps'),
        ]);
        return [...OPENDOODLES, ...OPENPEEPS];
      },
      basePath: '/illustrations',
    },
  };
}
