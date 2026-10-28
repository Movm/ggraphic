// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The templates the Studio offers, read from template files. One loader: every source (the
 * open pack today, an organisation's own later) goes through `readTemplateFile`, and a file
 * that does not read is reported and skipped, never half-loaded.
 */
import { offeredSchemes, type BrandPack, type SchemeId } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { readTemplateFile, type TemplateFile, type TemplateFormat } from '@ggraphic/schema';
import { OPEN_TEMPLATES } from '@ggraphic/templates-open';

import { BLANK_TEMPLATE_ID } from './ids';

export type CatalogSource = 'pack' | 'organisation';

export interface CatalogEntry {
  id: string;
  version: number;
  kind: 'template' | 'block';
  family: string;
  title: string;
  description: string;
  formats: readonly TemplateFormat[];
  schemes: readonly SchemeId[];
  occasions: readonly string[];
  needsPhoto: boolean;
  source: CatalogSource;
  template: TemplateFile;
}

export interface CatalogProblem {
  source: CatalogSource;
  id: string | null;
  reason: string;
}

const idOf = (raw: unknown): string | null =>
  typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string'
    ? (raw as { id: string }).id
    : null;

/** Every readable file as an entry, in source order; the rest as problems. The first of a duplicate id wins. */
export function buildCatalog(
  sources: readonly { source: CatalogSource; files: readonly unknown[] }[]
): { entries: CatalogEntry[]; problems: CatalogProblem[] } {
  const entries: CatalogEntry[] = [];
  const problems: CatalogProblem[] = [];
  const seen = new Set<string>();
  for (const { source, files } of sources) {
    for (const raw of files) {
      const read = readTemplateFile(raw);
      if (read.status !== 'ok') {
        const reason =
          read.status === 'invalid'
            ? read.reason
            : `written by a newer version (${read.scope} ${read.version})`;
        problems.push({ source, id: idOf(raw), reason });
        continue;
      }
      const t = read.template;
      if (seen.has(t.id)) {
        problems.push({ source, id: t.id, reason: 'duplicate id: the first one is kept' });
        continue;
      }
      seen.add(t.id);
      entries.push({
        id: t.id,
        version: t.version,
        kind: t.kind,
        family: t.family,
        title: t.title.en,
        description: t.description.en,
        formats: t.formats,
        schemes: t.schemes,
        occasions: t.tags.occasions,
        needsPhoto: Object.values(t.slots).some((slot) => slot.role === 'photo'),
        source,
        template: t,
      });
    }
  }
  return { entries, problems };
}

let built: ReturnType<typeof buildCatalog> | null = null;

/** The catalogue of the open pack, built once; its problems are warned once. */
export function studioCatalog(): { entries: CatalogEntry[]; problems: CatalogProblem[] } {
  if (!built) {
    built = buildCatalog([{ source: 'pack', files: OPEN_TEMPLATES }]);
    for (const p of built.problems) {
      console.warn(`Template ${p.id ?? '(no id)'} from the ${p.source} was skipped: ${p.reason}`);
    }
  }
  return built;
}

/** The template `id`, or null when it is unknown or a block. */
export function catalogTemplate(id: string): CatalogEntry | null {
  return studioCatalog().entries.find((e) => e.id === id && e.kind === 'template') ?? null;
}

const ASPECT_OF_FORMAT: Readonly<Record<string, TemplateFormat>> = {
  'profile-square': '1:1',
  'post-portrait': '4:5',
  'slide-16-9': '16:9',
};

/** The aspect a template declares for a Studio format, or null for a format no template covers. */
export function formatAspect(formatId: string): TemplateFormat | null {
  return ASPECT_OF_FORMAT[formatId] ?? null;
}

/** The templates that lay out on `formatId` and have a colour world `brand` (default: the active one) keeps. */
export function templatesFor(formatId: string, brand: BrandPack = activeBrand()): CatalogEntry[] {
  const aspect = formatAspect(formatId);
  if (!aspect) return [];
  return studioCatalog().entries.filter(
    (e) =>
      e.kind === 'template' &&
      e.formats.includes(aspect) &&
      offeredSchemes(e.template, brand).length > 0
  );
}

export const FAMILY_LABELS: Readonly<Record<string, string>> = {
  headline: 'Headline',
  quote: 'Quote',
  number: 'Number',
};

/** The Studio's own default format (`DEFAULT_FORMAT` in `document.ts`; not imported, to keep the modules acyclic). */
const CATALOG_FORMAT = 'post-portrait';

/** How the pickers name the templates: Blank first, then what the default format offers. */
export const TEMPLATE_CATALOG: readonly { id: string; label: string; description: string }[] = [
  { id: BLANK_TEMPLATE_ID, label: 'Blank', description: 'An empty page on a solid ground' },
  ...templatesFor(CATALOG_FORMAT).map((e) => ({
    id: e.id,
    label: e.title,
    description: e.description,
  })),
];
