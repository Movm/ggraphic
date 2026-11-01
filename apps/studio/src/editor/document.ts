// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The project document as the Studio stores it on the server: the format and
 * the pages (template id plus state each). The server treats it as opaque JSON.
 */
import { type SchemeId } from '@ggraphic/core';
import { getCanvasFormat } from '@ggraphic/editor/templates';
import { readInitialDocument, type InitialPageDef } from '@ggraphic/editor/shell';
import { migrateDocument, stampDocument } from '@ggraphic/schema';

import { catalogTemplate, templatesFor } from './templates/catalog';
import { BLANK_TEMPLATE_ID, FREE_PAGE_CONFIG_ID, isStudioTemplateId } from './templates/ids';
import { templatePageState } from './templates/instantiate';

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
  /** The core format version; absent reads as 1. Passed through. */
  schemaVersion?: number;
  /** Versions of host element kinds; absent reads as 1. Passed through. */
  kindVersions?: Record<string, number>;
  /** Anything else a stored document carries survives a round trip. */
  [key: string]: unknown;
}

/** A stored document read for opening, or the reason it must not be opened for editing. */
export type ParsedStudioDocument =
  { kind: 'ok'; doc: StudioDocument } | { kind: 'refused'; reason: 'newer' | 'invalid' };

export function formatSize(formatId: string): { width: number; height: number } {
  const format = getCanvasFormat(formatId) ?? getCanvasFormat(DEFAULT_FORMAT);
  return { width: format?.width ?? 1080, height: format?.height ?? 1350 };
}

/**
 * A fresh document: one free page holding `templateId`, laid out on the format. A template
 * that is unknown, or not offered on this format and brand, leaves the page blank.
 */
export function newDocument(
  formatId: string,
  templateId: string = BLANK_TEMPLATE_ID,
  schemeId: SchemeId | null = null
): StudioDocument {
  const entry = catalogTemplate(templateId);
  const offered = entry && templatesFor(formatId).some((e) => e.id === entry.id);
  const state = (offered && templatePageState(entry, formatId, { schemeId })) || {
    shapeInstances: [],
    additionalTexts: [],
    layerOrder: [],
  };
  return { formatId, pages: [{ configId: FREE_PAGE_CONFIG_ID, state }] };
}

/**
 * Reads a stored document through the core's versioned reader. A document
 * from a newer build, or with a malformed version envelope, is refused: the
 * editor must not open it, because saving would store the old shape over it.
 * A readable document with unusable pages becomes a blank portrait page.
 */
export function parseDocument(raw: unknown): ParsedStudioDocument {
  const read = readInitialDocument(raw);
  if (read.refusal) return { kind: 'refused', reason: read.refusal.status as 'newer' | 'invalid' };
  const migrated = migrateDocument(raw);
  // `readInitialDocument` accepted it, so the migration has a document.
  const stored = (
    migrated.status === 'newer' || migrated.status === 'invalid' ? {} : migrated.document
  ) as Record<string, unknown>;
  const formatId =
    typeof stored['formatId'] === 'string' && getCanvasFormat(stored['formatId'])
      ? stored['formatId']
      : DEFAULT_FORMAT;
  // A page whose config the editor does not register (a template that is gone) opens as a free page.
  const pages =
    read.pages?.map((page) =>
      isStudioTemplateId(page.configId) ? page : { ...page, configId: FREE_PAGE_CONFIG_ID }
    ) ?? newDocument(formatId).pages;
  return { kind: 'ok', doc: { ...stored, formatId, pages } };
}

/**
 * The document to store, stamped with this build's version. Page state can
 * hold `File`/`Blob` objects and `blob:` URLs of images still uploading;
 * neither survives a reload, so they are dropped here and the page keeps
 * only durable data.
 */
export function serializeDocument(doc: StudioDocument): StudioDocument {
  return stampDocument({
    ...doc,
    pages: doc.pages.map((page) => ({
      configId: page.configId,
      state: JSON.parse(JSON.stringify(page.state, durableValue)) as Record<string, unknown>,
    })),
  });
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
