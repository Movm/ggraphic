// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A host's whole embedding: a brand, a template pack and a change listener. The editor comes up
 * on the pack's template, and an added text reaches the host through `onChange`.
 */
import { brandDefault } from '@ggraphic/core';
import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Konva from 'konva';
import React, { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { messages } from '../i18n/messages.js';

import {
  BLANK_PAGE_ID,
  type CanvasEditorExportApi,
  GgraphicEditor,
  loadTemplatePack,
  templatePackFromJson,
  type GgraphicDocument,
} from './index.js';

vi.mock('../sidebar/UserUploadsProvider.js', () => ({
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

const files = [
  {
    formatVersion: 1,
    id: 'embed-headline',
    version: 1,
    kind: 'template',
    family: 'headline',
    title: { en: 'Headline' },
    description: { en: 'A plain headline.' },
    tags: { occasions: [], topics: [] },
    formats: ['4:5'],
    schemes: ['primary'],
    schemaVersion: CANVAS_DOCUMENT_VERSION,
    pages: [
      {
        state: {
          additionalTexts: [
            {
              id: 'headline',
              type: 'header',
              text: 'Hello',
              x: 0.1,
              y: 0.3,
              width: 0.8,
              fontSize: 0.08,
              fontFamily: '',
              fill: '#ffffff',
              bind: { fill: 'ink', fontFamily: 'font.headline' },
            },
          ],
        },
      },
    ],
    provenance: { author: 'test', reviewed: '2026-11-01', licence: 'CC0-1.0' },
  },
];
const pack = templatePackFromJson(files);

const textsOf = (doc: GgraphicDocument | undefined) =>
  (doc?.pages[0]?.state['additionalTexts'] as { id: string }[] | undefined) ?? [];

/**
 * How long a test waits for the editor to mount. The first mount loads the lazy `EmbeddedEditor`
 * chunk and its module graph: about 1 s warm, more than 10 s on a cold first run in a fresh
 * worktree under memory pressure (#177). Waiting costs nothing once the editor is there.
 */
const MOUNT_WAIT = 20_000;

// Each test waits up to MOUNT_WAIT and then still clicks and waits for `onChange`. Under vitest's
// default 5 s timeout the first test failed on cold runs before its own wait ran out (#177).
describe('GgraphicEditor', { timeout: 2 * MOUNT_WAIT }, () => {
  it("opens on the pack's template and reports an added text through onChange", async () => {
    expect(pack.problems).toEqual([]);
    const changes: GgraphicDocument[] = [];
    render(
      <GgraphicEditor brand={brandDefault} templates={pack} onChange={(d) => changes.push(d)} />
    );

    // English by default, the free page's tabs.
    const textTab = await screen.findByRole('button', { name: /^Text/ }, { timeout: MOUNT_WAIT });
    await userEvent.click(textTab);
    const before = changes.length;
    await userEvent.click(await screen.findByText(messages().sidebar.text.labelTitle));

    await waitFor(() => {
      expect(changes.length).toBeGreaterThan(before);
      const last = changes.at(-1);
      expect(last?.formatId).toBe('post-portrait');
      expect(last?.pages[0]?.configId).toBe('embed-headline');
      const ids = textsOf(last).map((t) => t.id);
      expect(ids[0]).toBe('headline');
      expect(ids).toHaveLength(2);
    });
  });

  it('hands the host the export api once the editor has loaded, and takes it back on unmount', async () => {
    const api = createRef<CanvasEditorExportApi>();
    const { unmount } = render(
      <GgraphicEditor brand={brandDefault} templates={pack} exportApiRef={api} />
    );

    await waitFor(() => expect(api.current).not.toBeNull(), { timeout: MOUNT_WAIT });
    expect(api.current?.getPages().map((p) => p.configId)).toEqual(['embed-headline']);
    // jsdom cannot rasterise a stage, so the PNG itself is not checked here.
    expect(typeof api.current?.captureActivePage).toBe('function');

    unmount();
    expect(api.current).toBeNull();
  });

  it('exports the page as an svg through the export api, text kept editable', async () => {
    const api = createRef<CanvasEditorExportApi>();
    render(<GgraphicEditor brand={brandDefault} templates={pack} exportApiRef={api} />);
    await waitFor(() => expect(api.current).not.toBeNull(), { timeout: MOUNT_WAIT });

    const { blob, filename, report } = await api.current!.exportSvg({
      pages: 'current',
      text: 'editable',
    });

    expect(filename).toMatch(/\.svg$/);
    expect(blob.type).toBe('image/svg+xml');
    const svg = await blob.text();
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('data-element-id="headline"');
    expect(svg).toContain('<text');
    expect(report.missingElements).toEqual([]);

    // Outlines need a font file; jsdom has none, so the text stays text and the report says so.
    const outlined = await api.current!.exportSvg({ pages: 'all', text: 'outlines' });
    expect(outlined.blob.type).toBe('image/svg+xml');
    expect(outlined.report.missingGlyphs.length).toBeGreaterThan(0);
  });

  it('exports the document as a pdf through the export api', async () => {
    // jsdom's canvas cannot encode and never calls back: a picture that cannot be made is null.
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(null));
    try {
      const api = createRef<CanvasEditorExportApi>();
      render(<GgraphicEditor brand={brandDefault} templates={pack} exportApiRef={api} />);
      await waitFor(() => expect(api.current).not.toBeNull(), { timeout: MOUNT_WAIT });

      const { blob, filename, report } = await api.current!.exportPdf();

      expect(filename).toBe('ggraphic.pdf');
      expect(blob.type).toBe('application/pdf');
      expect(await blob.text()).toMatch(/^%PDF-/);
      // The vector writer made it, from the document's brand: no fallback, and the neutral
      // pack's colours, which has no print values, went out as RGB.
      expect(report.fallback).toBeNull();
      expect(report.rgbBrandColors).toContain('#1d3557');
      // No font file and no canvas to draw the text on here: the headline is said to be missing.
      expect(report.missingGlyphs).toEqual([{ page: 1, elementId: 'headline', text: 'Hello' }]);
    } finally {
      toBlob.mockRestore();
    }
  });

  it('opens on a pack that is still loading (loadTemplatePack)', async () => {
    const loading = loadTemplatePack(files);
    const api = createRef<CanvasEditorExportApi>();
    // Rendered and resolved inside act, so React's retry after the pack resolves is flushed.
    await act(async () => {
      render(<GgraphicEditor brand={brandDefault} templates={loading} exportApiRef={api} />);
      await loading;
    });

    await expect(loading).resolves.toMatchObject({ problems: [] });
    await waitFor(() => expect(api.current).not.toBeNull(), { timeout: MOUNT_WAIT });
    expect(api.current?.getPages().map((p) => p.configId)).toEqual(['embed-headline']);
  });

  it('opens a blank page on the format a host asks for (BLANK_PAGE_ID)', async () => {
    const api = createRef<CanvasEditorExportApi>();
    const changes: GgraphicDocument[] = [];
    render(
      <GgraphicEditor
        brand={brandDefault}
        templates={pack}
        document={{ formatId: 'slide-16-9', pages: [{ configId: BLANK_PAGE_ID, state: {} }] }}
        exportApiRef={api}
        onChange={(d) => changes.push(d)}
      />
    );

    await waitFor(() => expect(api.current).not.toBeNull(), { timeout: MOUNT_WAIT });
    expect(BLANK_PAGE_ID).toBe('ggraphic-blank');
    expect(api.current?.getPages().map((p) => p.configId)).toEqual([BLANK_PAGE_ID]);

    await userEvent.click(await screen.findByRole('button', { name: /^Text/ }));
    await userEvent.click(await screen.findByText(messages().sidebar.text.labelTitle));
    await waitFor(() => {
      expect(changes.at(-1)?.formatId).toBe('slide-16-9');
      expect(textsOf(changes.at(-1)).map((t) => t.id)).toHaveLength(1);
    });
  });
});
