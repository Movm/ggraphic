// SPDX-License-Identifier: MPL-2.0
/**
 * The brand of a document comes from the document, not from the registry: a
 * host registers several packs, and `activeBrand()` is always the first. A
 * document of another pack showed its sidebar in the first pack's fonts. The
 * whole path runs here: config, shell, sidebar.
 */
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { messages } from '@ggraphic/editor/i18n/messages';
import { registerTemplates } from '@ggraphic/editor/templates/registry';

import { brandTestConfig } from '../../testing/documentBrandConfig.js';
import { PACK_A, PACK_B } from '../../testing/documentBrandPacks.js';

import { CanvasEditorShell } from './CanvasEditorShell.js';

vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => ({
  useOptionalUserUploads: () => null,
  UserUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserUploads: () => ({ uploads: [], refresh: () => {} }),
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);

vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
Element.prototype.scrollIntoView ??= () => {};

beforeAll(() => {
  registerBrandPacks([PACK_A, PACK_B]);
  registerTemplates(
    { id: 'shell-plain', load: () => Promise.resolve(brandTestConfig('shell-plain')) as never },
    { id: 'shell-b', load: () => Promise.resolve(brandTestConfig('shell-b', PACK_B)) as never }
  );
});

/** The font of the sidebar's "Titel" tile: what a header added next would use. */
async function headerTileFont(configId: string): Promise<string> {
  await act(async () => {
    render(
      <CanvasEditorShell
        initialConfigId={configId}
        initialProps={{}}
        onExport={() => {}}
        onCancel={() => {}}
        initialTab="text"
      />
    );
  });
  const tile = await screen.findByText(messages().sidebar.text.labelTitle, {}, { timeout: 10_000 });
  return tile.style.fontFamily;
}

describe('the text tab offers the font of the document brand', () => {
  it('a page without a brand: the first registered pack', async () => {
    expect(await headerTileFont('shell-plain')).toContain(PACK_A.fonts.headline);
  });

  it('a page of another pack: that pack, not the first one', async () => {
    const font = await headerTileFont('shell-b');
    expect(font).toContain(PACK_B.fonts.headline);
    expect(font).not.toContain(PACK_A.fonts.headline);
  });
});
