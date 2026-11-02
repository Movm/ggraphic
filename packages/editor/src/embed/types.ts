// SPDX-License-Identifier: AGPL-3.0-only
import { type BrandPack } from '@ggraphic/core';
import { type QueryClient } from '@tanstack/react-query';
import { type Ref } from 'react';

import { type CanvasEditorServices } from '../CanvasEditorProvider.js';
import { type CanvasEditorExportApi } from '../components/CanvasEditor/types.js';
import { type MessageLocale } from '../i18n/messages.js';
import { type TemplatePack } from '../page/templatePack.js';

/** A design as the host stores it: its format and every page's config and state. */
export interface GgraphicDocument {
  formatId: string;
  pages: { configId: string; state: Record<string, unknown> }[];
}

export interface GgraphicEditorProps {
  /** The brand pack (`defineBrand`, or `defaultBrand` from `@ggraphic/brand-default`). */
  brand: BrandPack;
  /**
   * The templates a document's pages come from: `loadTemplatePack(files)`, which keeps the
   * parser out of the host's entry chunk, or a pack from `templatePackFromJson`.
   */
  templates: TemplatePack | Promise<TemplatePack>;
  /**
   * The design to open, read when the editor mounts (give it a new `key` to open another).
   * Absent: one page of the pack's first template, or a blank page, on the default format.
   */
  document?: GgraphicDocument;
  /** The whole design after every change; store it as it comes. */
  onChange?: (document: GgraphicDocument) => void;
  /** Host services (`CanvasEditorServices`); everything left out keeps the editor's default. */
  services?: CanvasEditorServices;
  /** The language of the editor's texts. Default `en`. */
  locale?: MessageLocale;
  /** The host's React Query client; the editor makes its own when absent. */
  queryClient?: QueryClient;
  /** The design's name, used for file names of downloads. */
  title?: string;
  /**
   * Filled once the editor has loaded in the browser, emptied when it unmounts: render pages as
   * PNG, export the deck as .pptx, read the pages. A callback ref tells the host when it is ready.
   */
  exportApiRef?: Ref<CanvasEditorExportApi>;
}
