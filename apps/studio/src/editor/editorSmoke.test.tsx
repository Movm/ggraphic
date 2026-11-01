// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Mounts the full editor the way the editor page does, with a starter
 * template, and checks that it comes up: the Studio's tabs, a stage, and the
 * template's texts in the pages the autosave reads.
 */
import {
  CanvasEditorProvider,
  CanvasEditorShell,
  type CanvasEditorExportApi,
} from '@ggraphic/editor/shell';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { WithSession } from '../testing/session';

import { registerEditor } from '../registerEditor';

import { newDocument } from './document';
import { createStudioServices } from './services';
import { HEADLINE_TEMPLATE_ID } from './templates/ids';

beforeAll(() => registerEditor());

function mount({ ai }: { ai: boolean }) {
  const exportApi = createRef<CanvasEditorExportApi>();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WithSession>
        <CanvasEditorProvider services={createStudioServices({ ai, organisationId: 'org-1' })}>
          <CanvasEditorShell
            initialConfigId="studio-blank"
            initialPages={newDocument('post-portrait', HEADLINE_TEMPLATE_ID).pages}
            initialProps={{}}
            formatId="post-portrait"
            documentTitle="Smoke"
            onExport={() => {}}
            onCancel={() => {}}
            galleryAutoSave={false}
            exportApiRef={exportApi}
          />
        </CanvasEditorProvider>
      </WithSession>
    </QueryClientProvider>
  );
  return exportApi;
}

describe('the editor with a Studio template', () => {
  it('shows the Studio tabs and a stage, and holds the template texts', async () => {
    const exportApi = mount({ ai: true });

    for (const name of [/^Text/, /^Elements/, /^Uploads/, /^Tools/, /^AI draft/]) {
      expect(await screen.findByRole('button', { name })).toBeInTheDocument();
    }
    await waitFor(() => expect(document.querySelector('.konvajs-content canvas')).not.toBeNull());

    await waitFor(() => {
      const texts = exportApi.current?.getPages()[0]?.state['additionalTexts'] as
        { id: string; text: string }[] | undefined;
      expect(texts?.map((t) => t.id)).toEqual(['headline', 'subline', 'body', 'cta']);
    });
  });

  it('offers illustrations and emoji in the Elements tab', async () => {
    mount({ ai: false });
    await userEvent.click(await screen.findByRole('button', { name: /^Elements/ }));
    expect(await screen.findByText('Illustrations')).toBeInTheDocument();
    expect(await screen.findByText('Emoji')).toBeInTheDocument();
  });

  it('hides the AI draft tab when the server has no AI', async () => {
    mount({ ai: false });
    expect(await screen.findByRole('button', { name: /^Text/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^AI draft/ })).toBeNull();
  });
});
