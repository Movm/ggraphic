// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CanvasEditorProvider } from '../../../CanvasEditorProvider.js';
import { registerAssetCatalog } from '../../../utils/canvasAssets.js';
import { DocumentAudienceContext } from './assetAudience.js';

import { useElementCatalog } from './useElementCatalog.js';

import type { ExtendedAssetsSectionProps } from './AssetsSection.js';

afterEach(cleanup);

const LAZY = { illustrations: false, icons: false, photos: false, emoji: false };

/** A host like the Studio: emoji files, no curated stickers or emoji, no sticker gallery. */
function catalogOf(props: Partial<ExtendedAssetsSectionProps>) {
  registerAssetCatalog({
    assets: [],
    isInstanceSrc: () => false,
    emojiSrc: (code) => `/emoji/emoji_u${code}.svg`,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <CanvasEditorProvider services={{}}>{children}</CanvasEditorProvider>
    </QueryClientProvider>
  );
  const { result } = renderHook(
    () => useElementCatalog({ onAddAsset: () => undefined, ...props } as never, LAZY),
    { wrapper }
  );
  return result.current;
}

describe('the Elements categories of a host without curated stickers and emoji', () => {
  it('offers no Sticker card when there is nothing to show in it', () => {
    expect(catalogOf({}).map((c) => c.id)).not.toContain('sticker');
  });

  it('keeps the Sticker card when the host has a sticker gallery', () => {
    expect(catalogOf({ onAddStickerAsset: () => undefined }).map((c) => c.id)).toContain('sticker');
  });

  it('gives the Emoji card a cover before the catalogue has loaded', () => {
    const emoji = catalogOf({}).find((c) => c.id === 'emoji');
    const { container } = render(<>{emoji?.cover}</>);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/emoji/emoji_u1f600.svg');
  });
});

describe('the audience of the Marke logos', () => {
  const LOGOS = [
    { id: 'logo-de', audience: 'de-DE' },
    { id: 'logo-at', audience: 'de-AT' },
  ].map((a) => ({ ...a, src: `/${a.id}.svg`, label: a.id, category: 'decoration', tags: [] }));
  const brandIds = (documentAudience: 'de-DE' | 'de-AT' | null, userLocale: 'de-DE' | 'de-AT') => {
    registerAssetCatalog({
      assets: LOGOS as never,
      isInstanceSrc: () => false,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <CanvasEditorProvider services={{ userLocale }}>
          <DocumentAudienceContext.Provider value={documentAudience}>
            {children}
          </DocumentAudienceContext.Provider>
        </CanvasEditorProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () => useElementCatalog({ onAddAsset: () => undefined } as never, LAZY),
      { wrapper }
    );
    return result.current;
  };

  it('uses the document audience over the user locale', () => {
    const marke = brandIds('de-AT', 'de-DE').find((c) => c.id === 'marke');
    expect(JSON.stringify(marke?.items.map((i) => i.key))).toContain('logo-at');
    expect(JSON.stringify(marke?.items.map((i) => i.key))).not.toContain('logo-de');
  });

  it('falls back to the user locale without a document audience', () => {
    const marke = brandIds(null, 'de-DE').find((c) => c.id === 'marke');
    expect(JSON.stringify(marke?.items.map((i) => i.key))).toContain('logo-de');
  });
});
