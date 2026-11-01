// SPDX-License-Identifier: MPL-2.0
/**
 * What `GgraphicEditor` renders in the browser: the editor's registers filled from the props,
 * a React Query client, the host services and the editor shell.
 */
import { type BrandPack } from '@ggraphic/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type CSSProperties, useMemo, useRef, useState } from 'react';

import { registerBrandPacks } from '../brand/brandRegistry.js';
import { type CanvasEditorServices, CanvasEditorProvider } from '../CanvasEditorProvider.js';
import { CanvasEditorShell } from '../components/CanvasEditor/CanvasEditorShell.js';
import { DEFAULT_FORMAT_ID } from '../formats/index.js';
import { registerMessages, type MessageLocale } from '../i18n/messages.js';
import { createPageConfig } from '../page/config.js';
import { slotBudgetFor } from '../page/slotBudgets.js';
import { type TemplatePack } from '../page/templatePack.js';
import {
  defineTemplate,
  getTemplate,
  registerTemplates,
  type TemplateDefinition,
} from '../templates/registry.js';

import { type GgraphicDocument, type GgraphicEditorProps } from './types.js';

/** The config of a page that starts empty; a document without templates opens on one. */
export const BLANK_PAGE_ID = 'ggraphic-blank';

const BLANK_PAGE = defineTemplate({
  id: BLANK_PAGE_ID,
  load: (formatId?: string) =>
    Promise.resolve(createPageConfig({ id: BLANK_PAGE_ID, formatId, seedFor: () => ({}) })),
});

/**
 * Registers what the registry does not hold yet. Template ids are stored in documents and the
 * registry never replaces one, so a second pack with an id already taken keeps the first.
 */
function registerOnce(definitions: readonly TemplateDefinition[]): void {
  const fresh = definitions.filter((d) => getTemplate(d.id) === undefined);
  if (fresh.length > 0) registerTemplates(...fresh);
}

/** What the editor's module-level registers were last filled from. */
let registered: { brand: BrandPack; locale: MessageLocale; templates: TemplatePack } | null = null;

/**
 * Fills the brand, message and template registers before the shell renders. Idempotent: the
 * same props register nothing again, so a re-render or a second editor with the same props is
 * free. The registers are module-level, so two editors on one page share one brand and locale.
 */
function syncRegisters(brand: BrandPack, locale: MessageLocale, templates: TemplatePack): void {
  if (registered?.brand !== brand) registerBrandPacks([brand]);
  if (registered?.locale !== locale) registerMessages(locale);
  if (registered?.templates !== templates) registerOnce([BLANK_PAGE, ...templates.definitions]);
  registered = { brand, locale, templates };
}

const NOOP = () => {};

/** The editor fills the host's box (`--editor-height`), not the viewport. */
const FILL_HOST_BOX = { display: 'contents', '--editor-height': '100%' } as CSSProperties;

export default function EmbeddedEditor({
  brand,
  templates,
  document,
  onChange,
  services,
  locale = 'en',
  queryClient,
  title,
}: GgraphicEditorProps) {
  syncRegisters(brand, locale, templates);

  const [ownClient] = useState(() => new QueryClient());
  const client = queryClient ?? ownClient;

  const merged = useMemo<CanvasEditorServices>(
    () => ({
      slotBudgets: {
        budgetFor: (page, id) => slotBudgetFor(page, id, templates.templateOf),
      },
      ...services,
    }),
    [services, templates]
  );

  // The document is read once: the editor owns it from here, and reports it through `onChange`.
  const [opened] = useState<GgraphicDocument>(
    () =>
      document ?? {
        formatId: DEFAULT_FORMAT_ID,
        pages: [{ configId: templates.definitions[0]?.id ?? BLANK_PAGE_ID, state: {} }],
      }
  );
  // The host may pass a new `onChange` every render: the editor reads it at call time.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [report] = useState(
    () => (pages: GgraphicDocument['pages']) =>
      onChangeRef.current?.({ formatId: opened.formatId, pages })
  );

  return (
    <QueryClientProvider client={client}>
      <CanvasEditorProvider services={merged}>
        <div style={FILL_HOST_BOX}>
          <CanvasEditorShell
            initialConfigId={opened.pages[0]?.configId ?? BLANK_PAGE_ID}
            initialPages={opened.pages}
            initialProps={{}}
            formatId={opened.formatId}
            {...(title !== undefined && { documentTitle: title })}
            onExport={NOOP}
            onCancel={NOOP}
            galleryAutoSave={false}
            {...(onChange !== undefined && { onPagesChange: report })}
          />
        </div>
      </CanvasEditorProvider>
    </QueryClientProvider>
  );
}
