// SPDX-License-Identifier: MPL-2.0
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { registerAssetCatalog } from '@ggraphic/editor/utils/canvasAssets';

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
