// SPDX-License-Identifier: MPL-2.0
/**
 * The versioned template file: one JSON file describes a template or a block.
 * Design, every key and the growth rules: `TEMPLATE_FORMAT.md` at the package root.
 */
import { z } from 'zod';

import { migrateDocument } from '../document/migrations.js';

export const TEMPLATE_FORMAT_VERSION = 1;
export const TEMPLATE_FORMATS = ['1:1', '4:5', '16:9'] as const;
/** Equals core's `SCHEME_IDS`; a cross-package test pins them equal. */
export const TEMPLATE_SCHEME_IDS = ['primary', 'secondary', 'light', 'dark', 'photo'] as const;
/** Equals core's `LOGO_CORNERS`; a cross-package test pins them equal. */
export const TEMPLATE_LOGO_CORNERS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;
export const TEMPLATE_SLOT_ROLES = [
  'headline',
  'subline',
  'body',
  'cta',
  'quote',
  'name',
  'number',
  'date',
  'place',
  'photo',
] as const;

export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number];
export type TemplateSchemeId = (typeof TEMPLATE_SCHEME_IDS)[number];
export type TemplateLogoCorner = (typeof TEMPLATE_LOGO_CORNERS)[number];
export type TemplateSlotRole = (typeof TEMPLATE_SLOT_ROLES)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/;

const slug = (max: number) => z.string().max(max).regex(SLUG);
const tagList = z.array(slug(40)).max(12);
const unique = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .min(1)
    .refine((list) => new Set(list).size === list.length, 'no duplicates');

const localized = (max: number) =>
  z
    .record(z.string().regex(LOCALE), z.string().trim().min(1).max(max))
    .refine((value) => typeof value['en'] === 'string', { message: 'needs an "en" entry' });

export type Localized = { en: string } & Record<string, string>;

const slotSchema = z.strictObject({
  role: z.enum(TEMPLATE_SLOT_ROLES),
  label: localized(160).optional(),
  budget: z.strictObject({
    maxWords: z.int().min(1).max(200).optional(),
    maxLines: z.int().min(1).max(20).optional(),
    maxChars: z.int().min(1).max(2000).optional(),
  }),
});

export type TemplateSlot = {
  role: TemplateSlotRole;
  label?: Localized;
  budget: { maxWords?: number; maxLines?: number; maxChars?: number };
};

const idList = z.array(z.string().min(1));

export const templateFileSchema = z.strictObject({
  formatVersion: z.literal(TEMPLATE_FORMAT_VERSION),
  id: slug(64),
  version: z.int().min(1),
  kind: z.enum(['template', 'block']),
  family: slug(40),
  title: localized(60),
  description: localized(160),
  tags: z.strictObject({
    tone: slug(40).optional(),
    occasions: tagList,
    topics: tagList,
  }),
  formats: unique(z.enum(TEMPLATE_FORMATS)),
  schemes: unique(z.enum(TEMPLATE_SCHEME_IDS)),
  schemaVersion: z.int().min(1),
  kindVersions: z.record(z.string(), z.int().min(1)).optional(),
  pages: z.tuple([z.strictObject({ state: z.record(z.string(), z.unknown()) })]),
  frames: z.record(z.string(), z.enum(['canvas', 'safe'])).default({}),
  slots: z.record(z.string(), slotSchema).default({}),
  blocks: z
    .array(z.strictObject({ id: slug(64), title: localized(60), elementIds: idList }))
    .default([]),
  locks: idList.default([]),
  fixed: z.record(z.string(), z.array(z.string().min(1))).default({}),
  logoCorners: z.array(z.enum(TEMPLATE_LOGO_CORNERS)).default([]),
  placeholders: z.record(z.string().regex(LOCALE), z.record(z.string(), z.string())).default({}),
  provenance: z.strictObject({
    author: z.string().min(1),
    reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    licence: z.string().min(1),
  }),
});

export type TemplateFile = {
  formatVersion: 1;
  id: string;
  version: number;
  kind: 'template' | 'block';
  family: string;
  title: Localized;
  description: Localized;
  tags: { tone?: string; occasions: string[]; topics: string[] };
  formats: TemplateFormat[];
  schemes: TemplateSchemeId[];
  schemaVersion: number;
  kindVersions?: Record<string, number>;
  pages: [{ state: Record<string, unknown> }];
  frames: Record<string, 'canvas' | 'safe'>;
  slots: Record<string, TemplateSlot>;
  blocks: { id: string; title: Localized; elementIds: string[] }[];
  locks: string[];
  fixed: Record<string, string[]>;
  logoCorners: TemplateLogoCorner[];
  placeholders: Record<string, Record<string, string>>;
  provenance: { author: string; reviewed: string; licence: string };
};

export type TemplateReadResult =
  | { status: 'ok'; template: TemplateFile; migrated: boolean }
  | { status: 'newer'; scope: 'format' | 'pages'; version: number }
  | { status: 'invalid'; reason: string };

interface FormatMigration {
  from: number;
  migrate(file: Record<string, unknown>): Record<string, unknown>;
}

/** Steps lifting the file format itself; none yet (format 1 is the first). */
const TEMPLATE_FORMAT_MIGRATIONS: readonly FormatMigration[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The `id` of every object in the top-level arrays of a page state, plus the
 * keys of its top-level plain-object records.
 */
export function templateElementIds(state: Readonly<Record<string, unknown>>): string[] {
  const ids: string[] = [];
  for (const value of Object.values(state)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item) && typeof item['id'] === 'string') ids.push(item['id']);
      }
    } else if (isRecord(value)) {
      ids.push(...Object.keys(value));
    }
  }
  return ids;
}

const invalid = (reason: string): TemplateReadResult => ({ status: 'invalid', reason });

function crossReferences(file: TemplateFile): string | null {
  const ids = templateElementIds(file['pages'][0].state);
  const known = new Set(ids);
  const dupe = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dupe !== undefined) return `pages.0.state: duplicate element id "${dupe}"`;
  const missing = (key: string, id: string) => `${key}: no element "${id}" in pages[0].state`;
  for (const id of Object.keys(file.frames)) if (!known.has(id)) return missing(`frames.${id}`, id);
  for (const id of Object.keys(file.slots)) if (!known.has(id)) return missing(`slots.${id}`, id);
  for (const id of Object.keys(file.fixed)) {
    if (id !== 'page' && !known.has(id)) return missing(`fixed.${id}`, id);
  }
  for (const [locale, texts] of Object.entries(file.placeholders)) {
    for (const id of Object.keys(texts)) {
      if (!known.has(id)) return missing(`placeholders.${locale}.${id}`, id);
    }
  }
  for (const [b, block] of file.blocks.entries()) {
    for (const id of block.elementIds)
      if (!known.has(id)) return missing(`blocks.${b}.elementIds`, id);
  }
  for (const id of file.locks) if (!known.has(id)) return missing('locks', id);
  return null;
}

/** The one door for reading a template file; never throws. */
export function readTemplateFile(raw: unknown): TemplateReadResult {
  if (!isRecord(raw)) return invalid('template file: not an object');
  const formatVersion = raw['formatVersion'];
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion) || formatVersion < 1) {
    return invalid('formatVersion: must be a positive integer');
  }
  if (formatVersion > TEMPLATE_FORMAT_VERSION) {
    return { status: 'newer', scope: 'format', version: formatVersion };
  }
  let file = raw;
  for (const step of TEMPLATE_FORMAT_MIGRATIONS.slice(formatVersion - 1)) {
    file = step.migrate(file);
  }

  let migrated = false;
  if (Array.isArray(file['pages'])) {
    const pages = file['pages'].map((page) => ({
      configId: 'template',
      state: isRecord(page) ? page['state'] : undefined,
    }));
    const result = migrateDocument({
      schemaVersion: file['schemaVersion'],
      kindVersions: file['kindVersions'],
      pages,
    });
    if (result.status === 'newer') {
      return {
        status: 'newer',
        scope: 'pages',
        version: result.version,
      };
    }
    if (result.status === 'invalid') return invalid(`pages: ${result.reason}`);
    if (result.status === 'migrated') {
      migrated = true;
      const lifted = result.document.pages as { state: Record<string, unknown> }[];
      file = {
        ...file,
        schemaVersion: result.document.schemaVersion,
        pages: (file['pages'] as Record<string, unknown>[]).map((page, i) => ({
          ...page,
          state: lifted[i]!.state,
        })),
      };
    }
  }

  const parsed = templateFileSchema.safeParse(file);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return invalid(`${issue.path.join('.') || 'template file'}: ${issue.message}`);
  }
  const template = parsed.data as TemplateFile;
  const broken = crossReferences(template);
  if (broken) return invalid(broken);
  return { status: 'ok', template, migrated };
}
