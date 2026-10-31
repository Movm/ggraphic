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
export const TEMPLATE_SCHEME_IDS = [
  'primary',
  'secondary',
  'light',
  'dark',
  'accent',
  'photo',
] as const;
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

/**
 * The id pattern shared by element ids and the AI offer (`pickBody` in the Studio server): a slot is
 * offered to the model under its element id, so an id the offer rejects would break every prompt.
 */
export const OFFER_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

const elementId = z.string().min(1).max(64);
const idList = z.array(elementId).max(200);
const versionNumber = z.int().min(1).max(10000);
const realDate = (value: string): boolean => {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

export const templateFileSchema = z.strictObject({
  // The reader checks the value against the steps; the type below pins it to the current one.
  formatVersion: versionNumber,
  id: slug(64),
  version: versionNumber,
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
  schemaVersion: versionNumber,
  kindVersions: z.record(z.string(), versionNumber).optional(),
  pages: z.tuple([z.strictObject({ state: z.record(z.string(), z.unknown()) })]),
  frames: z.record(z.string(), z.enum(['canvas', 'safe'])).default({}),
  slots: z.record(z.string(), slotSchema).default({}),
  blocks: z
    .array(z.strictObject({ id: slug(64), title: localized(60), elementIds: idList }))
    .max(50)
    .default([]),
  locks: idList.default([]),
  fixed: z
    .record(z.string().max(64), z.array(z.string().min(1).max(64)).max(20))
    .refine((value) => Object.keys(value).length <= 40, { message: 'at most 40 elements' })
    .default({}),
  logoCorners: z.array(z.enum(TEMPLATE_LOGO_CORNERS)).default([]),
  placeholders: z
    .record(z.string().regex(LOCALE), z.record(elementId, z.string().max(160)))
    .refine((value) => Object.keys(value).length <= 8, { message: 'at most 8 locales' })
    .default({}),
  provenance: z.strictObject({
    author: z.string().min(1).max(200),
    reviewed: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(realDate, { message: 'not a calendar date' }),
    licence: z.string().min(1).max(200),
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

// Compile-time pin: the hand-written type stays assignable to the schema's output, key for key.
type SchemaFile = z.infer<typeof templateFileSchema>;
const _typeIsSchema = (file: TemplateFile): SchemaFile => file;
const _keysMatch: keyof SchemaFile extends keyof TemplateFile
  ? keyof TemplateFile extends keyof SchemaFile
    ? true
    : never
  : never = true;
void _typeIsSchema;
void _keysMatch;

export type TemplateReadResult =
  | { status: 'ok'; template: TemplateFile; migrated: boolean }
  | { status: 'newer'; scope: 'format' | 'pages'; version: number }
  | { status: 'invalid'; reason: string };

/** Lifts a file from format `from` to `from + 1`; pure. Same shape as core's `CoreMigration`. */
export interface TemplateFormatMigration {
  from: number;
  migrate(file: Record<string, unknown>): Record<string, unknown>;
}

/** Steps lifting the file format itself; none yet (format 1 is the first). */
export const TEMPLATE_FORMAT_MIGRATIONS: readonly TemplateFormatMigration[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The `id` of every object in the top-level arrays of a page state, plus the
 * keys of its top-level plain-object records. Throws on an object whose `id`
 * is not a non-empty string.
 */
export function templateElementIds(state: Readonly<Record<string, unknown>>): string[] {
  return [...elementsById(state)].map(([id]) => id);
}

/** Every element with its id, in order; duplicates stay. */
function elementsById(state: Readonly<Record<string, unknown>>): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [key, value] of Object.entries(state)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!isRecord(item)) continue;
        const id = item['id'];
        if (typeof id !== 'string' || id === '') {
          throw new TypeError(`${key}: an element has no string "id"`);
        }
        out.push([id, item]);
      }
    } else if (isRecord(value)) {
      for (const [id, item] of Object.entries(value)) out.push([id, item]);
    }
  }
  return out;
}

const FONT_STYLES: readonly string[] = ['normal', 'italic', 'bold', 'bold italic'];
const FONT_WEIGHTS: readonly number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const invalid = (reason: string): TemplateReadResult => ({ status: 'invalid', reason });

function crossReferences(file: TemplateFile): string | null {
  const state = file.pages[0].state;
  const elements = elementsById(state);
  const ids = elements.map(([id]) => id);
  const known = new Set(ids);
  const dupe = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dupe !== undefined) return `pages.0.state: duplicate element id "${dupe}"`;
  // Array elements are what slots name, so theirs are held to the pattern; record keys are page fields.
  const arrayIds = Object.values(state).flatMap((value) =>
    Array.isArray(value) ? value.flatMap((e) => (isRecord(e) ? [String(e['id'])] : [])) : []
  );
  const odd = arrayIds.find((id) => !OFFER_ID_PATTERN.test(id));
  if (odd !== undefined)
    return `pages.0.state: element id "${odd}" must be 1-64 of a-z, 0-9 and "-"`;
  // The editor draws these four; any other value (a numeric weight, say) is passed to the
  // browser as it is, and the render gate cannot tell which face it picks.
  for (const [id, item] of elements) {
    const style = isRecord(item) ? item['fontStyle'] : undefined;
    if (style !== undefined && !FONT_STYLES.includes(style as string)) {
      return `${id}.fontStyle: must be one of ${FONT_STYLES.join(', ')}`;
    }
    const spacing = isRecord(item) ? item['letterSpacing'] : undefined;
    if (
      spacing !== undefined &&
      !(typeof spacing === 'number' && spacing >= -0.1 && spacing <= 0.3)
    ) {
      return `${id}.letterSpacing: must be a number of em from -0.1 to 0.3`;
    }
    const weight = isRecord(item) ? item['fontWeight'] : undefined;
    if (weight !== undefined && !FONT_WEIGHTS.includes(weight as number)) {
      return `${id}.fontWeight: must be one of ${FONT_WEIGHTS.join(', ')}`;
    }
    // Only `true` means anything; a ghost numeral is a picture and has no slot of its own.
    const decorative = isRecord(item) ? item['decorative'] : undefined;
    if (decorative !== undefined && decorative !== true) {
      return `${id}.decorative: must be true when present`;
    }
    // A line through the whole text; only `true` means anything.
    const strike = isRecord(item) ? item['strikethrough'] : undefined;
    if (strike !== undefined && strike !== true) {
      return `${id}.strikethrough: must be true when present`;
    }
    // The text shows the number of its page, so it is no content to fill or budget.
    const counter = isRecord(item) ? item['counter'] : undefined;
    if (counter !== undefined && counter !== 'page') {
      return `${id}.counter: must be "page" when present`;
    }
    // The prototype's size: the fit never goes above it, so it cannot lie under the plain size.
    const maxFontSize = isRecord(item) ? item['maxFontSize'] : undefined;
    if (maxFontSize !== undefined) {
      const size = isRecord(item) ? item['fontSize'] : undefined;
      const ok =
        typeof maxFontSize === 'number' &&
        maxFontSize > 0 &&
        (typeof size !== 'number' || maxFontSize >= size);
      if (!ok) return `${id}.maxFontSize: must be a positive number, not below fontSize`;
    }
  }
  if (known.has('page')) return 'pages.0.state: "page" is reserved and cannot be an element id';
  const missing = (key: string, id: string) => `${key}: no element "${id}" in pages[0].state`;
  for (const id of Object.keys(file.frames)) if (!known.has(id)) return missing(`frames.${id}`, id);
  for (const id of Object.keys(file.slots)) {
    if (!known.has(id)) return missing(`slots.${id}`, id);
    // Slots are what the AI is offered by id; a record key is not held to the pattern above.
    if (!OFFER_ID_PATTERN.test(id)) {
      return `slots.${id}: slot key must be 1-64 of a-z, 0-9 and "-"`;
    }
    const slotted = elements.find(([elementId]) => elementId === id)?.[1];
    if (isRecord(slotted) && slotted['decorative'] === true) {
      return `slots.${id}: a decorative text is no content and cannot be a slot`;
    }
    if (isRecord(slotted) && slotted['counter'] === 'page') {
      return `slots.${id}: a page counter shows the page number and cannot be a slot`;
    }
  }
  const bound = new Map<string, Set<string>>();
  for (const [id, item] of elements) {
    const bind = isRecord(item) ? item['bind'] : null;
    if (isRecord(bind)) bound.set(id, new Set(Object.keys(bind)));
  }
  if (isRecord(state['bind'])) bound.set('page', new Set(Object.keys(state['bind'])));
  for (const [id, fields] of Object.entries(file.fixed)) {
    if (id !== 'page' && !known.has(id)) return missing(`fixed.${id}`, id);
    const clash = fields.find((field) => bound.get(id)?.has(field));
    if (clash !== undefined) return `fixed.${id}: field "${clash}" is both fixed and bound`;
  }
  for (const [locale, texts] of Object.entries(file.placeholders)) {
    for (const id of Object.keys(texts)) {
      if (!known.has(id)) return missing(`placeholders.${locale}.${id}`, id);
    }
  }
  const blockIds = new Set<string>();
  const inBlock = new Map<string, string>();
  for (const [b, block] of file.blocks.entries()) {
    if (blockIds.has(block.id)) return `blocks.${b}: duplicate block id "${block.id}"`;
    blockIds.add(block.id);
    for (const id of block.elementIds) {
      if (!known.has(id)) return missing(`blocks.${b}.elementIds`, id);
      const other = inBlock.get(id);
      if (other !== undefined) {
        return `blocks.${b}.elementIds: element "${id}" is already in block "${other}"`;
      }
      inBlock.set(id, block.id);
    }
  }
  for (const id of file.locks) if (!known.has(id)) return missing('locks', id);
  return null;
}

/**
 * The one door for reading a template file; never throws. `steps` are the
 * format migrations (injectable for tests, like the registry of `migrateDocument`).
 */
export function readTemplateFile(
  raw: unknown,
  steps: readonly TemplateFormatMigration[] = TEMPLATE_FORMAT_MIGRATIONS
): TemplateReadResult {
  try {
    return readUnsafe(raw, steps);
  } catch (error) {
    return invalid(`template file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readUnsafe(raw: unknown, steps: readonly TemplateFormatMigration[]): TemplateReadResult {
  const current = steps.length + 1;
  const gap = steps.findIndex((step, i) => step.from !== i + 1);
  if (gap !== -1) return invalid(`format migrations: step ${gap} starts at ${steps[gap]!.from}`);
  if (!isRecord(raw)) return invalid('template file: not an object');
  const formatVersion = raw['formatVersion'];
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion) || formatVersion < 1) {
    return invalid('formatVersion: must be a positive integer');
  }
  if (formatVersion > current) {
    return { status: 'newer', scope: 'format', version: formatVersion };
  }
  let file = raw;
  let migrated = false;
  for (const step of steps.slice(formatVersion - 1)) {
    file = step.migrate(file);
    migrated = true;
  }
  if (file['formatVersion'] !== current) {
    return invalid(
      `formatVersion: migrations ended at ${String(file['formatVersion'])}, not ${current}`
    );
  }

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
      return { status: 'newer', scope: 'pages', version: result.version };
    }
    if (result.status === 'invalid') return invalid(`pages: ${result.reason}`);
    if (result.status === 'migrated') {
      migrated = true;
      const lifted = result.document.pages as { state: Record<string, unknown> }[];
      file = {
        ...file,
        schemaVersion: result.document.schemaVersion,
        ...(result.document.kindVersions ? { kindVersions: result.document.kindVersions } : {}),
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
