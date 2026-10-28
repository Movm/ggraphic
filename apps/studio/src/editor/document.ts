// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The project document as the Studio stores it on the server: the format and
 * the pages (template id plus state each). The server treats it as opaque JSON.
 */
import { getCanvasFormat } from '@ggraphic/editor/formats/index';
import { parseInitialPages, type InitialPageDef } from '@ggraphic/editor/hooks/usePageManager';

import { BLANK_TEMPLATE_ID, type StudioTemplateId } from './templates/ids';
import { seedPageState } from './templates/seeds';

/**
 * The formats a new project can take, all from the editor's format registry.
 * A 1080 × 1920 story is missing: the registry has no such format and a host
 * cannot add one (see the report on core changes).
 */
export const STUDIO_FORMATS = [
  { id: 'profile-square', label: 'Square', size: '1080 × 1080' },
  { id: 'post-portrait', label: 'Portrait', size: '1080 × 1350' },
  { id: 'slide-16-9', label: 'Landscape', size: '1920 × 1080' },
] as const;

export type StudioFormatId = (typeof STUDIO_FORMATS)[number]['id'];

export const DEFAULT_FORMAT: StudioFormatId = 'post-portrait';

export interface StudioDocument {
  formatId: string;
  pages: InitialPageDef[];
}

export function formatSize(formatId: string): { width: number; height: number } {
  const format = getCanvasFormat(formatId) ?? getCanvasFormat(DEFAULT_FORMAT);
  return { width: format?.width ?? 1080, height: format?.height ?? 1350 };
}

/** A fresh document: one page of `templateId`, laid out on the format. */
export function newDocument(
  formatId: string,
  templateId: StudioTemplateId = BLANK_TEMPLATE_ID
): StudioDocument {
  const { width, height } = formatSize(formatId);
  return {
    formatId,
    pages: [{ configId: templateId, state: seedPageState(templateId, width, height) }],
  };
}

/** Reads a stored document; anything unreadable becomes a blank portrait page. */
export function parseDocument(raw: Record<string, unknown>): StudioDocument {
  const formatId =
    typeof raw['formatId'] === 'string' && getCanvasFormat(raw['formatId'])
      ? raw['formatId']
      : DEFAULT_FORMAT;
  const pages = parseInitialPages(raw['pages']) ?? newDocument(formatId).pages;
  return { formatId, pages };
}

/**
 * The document to store. Page state can hold `File`/`Blob` objects and
 * `blob:` URLs of images still uploading; neither survives a reload, so they
 * are dropped here and the page keeps only durable data.
 */
export function serializeDocument(
  formatId: string,
  pages: readonly { configId: string; state: Record<string, unknown> }[]
): StudioDocument {
  return {
    formatId,
    pages: pages.map((page) => ({
      configId: page.configId,
      state: JSON.parse(JSON.stringify(page.state, durableValue)) as Record<string, unknown>,
    })),
  };
}

const isBlobUrl = (value: unknown) => typeof value === 'string' && value.startsWith('blob:');

function durableValue(key: string, value: unknown): unknown {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined;
  // An image still uploading is saved once it has its server URL.
  if (key === 'userImageInstances' && Array.isArray(value)) {
    return value.filter((image: { src?: unknown }) => !isBlobUrl(image?.src));
  }
  if (isBlobUrl(value)) return undefined;
  return value;
}
