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

import { newDocument, STUDIO_FORMATS, type StudioFormatId } from '../editor/document';
import { createStudioServices } from '../editor/services';
import { HEADLINE_TEMPLATE_ID } from '../editor/templates/ids';
import { registerEditor } from '../registerEditor';
import { WithSession } from '../testing/session';
import '../fonts';

registerEditor();

// `?format=slide-16-9` and `?pages=2` for the canvas fit (e2e/canvasFit.spec.ts).
const params = new URLSearchParams(location.search);
const requested = params.get('format');
const formatId: StudioFormatId =
  STUDIO_FORMATS.find((f) => f.id === requested)?.id ?? 'post-portrait';
const page = newDocument(formatId, HEADLINE_TEMPLATE_ID).pages[0]!;
const pages = Array.from({ length: Number(params.get('pages')) || 1 }, (_, i) => ({
  ...page,
  id: `${page.id}-${i}`,
}));

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing in compiled.html');

createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <WithSession>
      <CanvasEditorProvider services={createStudioServices({ ai: false, organisationId: 'org-1' })}>
        <CanvasEditorShell
          initialConfigId="studio-blank"
          initialPages={pages}
          initialProps={{}}
          formatId={formatId}
          documentTitle="Compiled CSS"
          onExport={() => {}}
          onCancel={() => {}}
          galleryAutoSave={false}
        />
      </CanvasEditorProvider>
    </WithSession>
  </QueryClientProvider>
);
