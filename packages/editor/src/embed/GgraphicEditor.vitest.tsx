// SPDX-License-Identifier: MPL-2.0
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

describe('GgraphicEditor', () => {
  it("opens on the pack's template and reports an added text through onChange", async () => {
    expect(pack.problems).toEqual([]);
    const changes: GgraphicDocument[] = [];
    render(
      <GgraphicEditor brand={brandDefault} templates={pack} onChange={(d) => changes.push(d)} />
    );

    // English by default, the free page's tabs.
    const textTab = await screen.findByRole('button', { name: /^Text/ }, { timeout: 10_000 });
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

    await waitFor(() => expect(api.current).not.toBeNull(), { timeout: 10_000 });
    expect(api.current?.getPages().map((p) => p.configId)).toEqual(['embed-headline']);
    // jsdom cannot rasterise a stage, so the PNG itself is not checked here.
    expect(typeof api.current?.captureActivePage).toBe('function');

    unmount();
    expect(api.current).toBeNull();
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
    await waitFor(() => expect(api.current).not.toBeNull(), { timeout: 10_000 });
    expect(api.current?.getPages().map((p) => p.configId)).toEqual(['embed-headline']);
  });
});
