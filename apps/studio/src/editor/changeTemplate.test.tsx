// SPDX-License-Identifier: AGPL-3.0-only
/**
 * "Change template" on a free page: the canvas must show the new page at once (the Text panel lists
 * what the page's live state holds), and undo brings the old page back in one step.
 */
import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { CanvasEditorShell } from '@ggraphic/editor/components/CanvasEditor/CanvasEditorShell';
import { type CanvasEditorExportApi } from '@ggraphic/editor/components/CanvasEditor/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { registerEditor } from '../registerEditor';

import { newDocument } from './document';
import { createStudioServices } from './services';
import { HEADLINE_TEMPLATE_ID } from './templates/ids';

beforeAll(() => registerEditor());

function mount() {
  const exportApi = createRef<CanvasEditorExportApi>();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CanvasEditorProvider services={createStudioServices({ ai: false, organisationId: 'org-1' })}>
        <CanvasEditorShell
          initialConfigId="studio-blank"
          initialPages={newDocument('post-portrait', HEADLINE_TEMPLATE_ID).pages}
          initialProps={{}}
          formatId="post-portrait"
          documentTitle="Change"
          onExport={() => {}}
          onCancel={() => {}}
          galleryAutoSave={false}
          exportApiRef={exportApi}
        />
      </CanvasEditorProvider>
    </QueryClientProvider>
  );
  return exportApi;
}

const HEADLINE = 'A clear headline';
const shownTexts = () =>
  Array.from(document.querySelectorAll('textarea, input[type="text"]')).map(
    (el) => (el as HTMLInputElement).value
  );

describe('Change template on a free page', () => {
  it('redraws the page at once and undo restores it in one step', async () => {
    const user = userEvent.setup();
    const exportApi = mount();
    await user.click(await screen.findByRole('button', { name: /^Text/ }));
    await waitFor(() => expect(shownTexts()).toContain(HEADLINE));

    await user.click(
      await screen.findByRole('button', { name: /^Vorlage ändern|^Change template/ })
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Blank/ }));

    await waitFor(() => {
      const state = exportApi.current?.getPages()[0]?.state;
      expect(state?.['additionalTexts']).toEqual([]);
    });
    // The live page, not just the stored one.
    await waitFor(() => expect(shownTexts()).not.toContain(HEADLINE));

    exportApi.current?.undo();
    await waitFor(() => expect(shownTexts()).toContain(HEADLINE));
  });
});
