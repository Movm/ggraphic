// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The editor in a host without Tailwind (`compiled.html`): one stylesheet,
 * `@ggraphic/editor/styles/compiled`, and nothing else. `e2e/compiledCss.spec.ts` reads the
 * computed styles. A dev and test entry only, like `gate.html`.
 */
import '@ggraphic/editor/styles/compiled';
import { CanvasEditorProvider, CanvasEditorShell } from '@ggraphic/editor/shell';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';

import { newDocument } from '../editor/document';
import { createStudioServices } from '../editor/services';
import { HEADLINE_TEMPLATE_ID } from '../editor/templates/ids';
import { registerEditor } from '../registerEditor';
import { WithSession } from '../testing/session';
import '../fonts';

registerEditor();

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing in compiled.html');

createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <WithSession>
      <CanvasEditorProvider services={createStudioServices({ ai: false, organisationId: 'org-1' })}>
        <CanvasEditorShell
          initialConfigId="studio-blank"
          initialPages={newDocument('post-portrait', HEADLINE_TEMPLATE_ID).pages}
          initialProps={{}}
          formatId="post-portrait"
          documentTitle="Compiled CSS"
          onExport={() => {}}
          onCancel={() => {}}
          galleryAutoSave={false}
        />
      </CanvasEditorProvider>
    </WithSession>
  </QueryClientProvider>
);
