// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The templates the Studio offers, read from template files. One loader: every source (the
 * open pack today, an organisation's own later) goes through `readTemplateFile`, and a file
 * that does not read is reported and skipped, never half-loaded.
 */
import { offeredSchemes, type BrandPack, type SchemeId } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { readTemplateFile, type TemplateFile, type TemplateFormat } from '@ggraphic/schema';
import { TEMPLATE_GATE_ADAPTER } from '@ggraphic/editor/templates/templateGeometry';
import { OPEN_TEMPLATES, OPEN_TEMPLATE_MANIFEST } from '@ggraphic/templates-open';

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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const OPEN_MANIFEST_PATHS: ReadonlySet<string> = new Set(
  OPEN_TEMPLATE_MANIFEST.assets.map((a) => a.path)
);

/**
 * The first image reference of a template that its pack does not list, as a reason; null when
 * every one is listed. The logo (a `src` bound to `brand.logo`) is the brand's, not the pack's.
 * The same rule the pack's own gate enforces (`asset-licence`), run again because the catalogue
 * also reads files that never passed that gate.
 */
function unlistedAsset(template: TemplateFile, manifestPaths: ReadonlySet<string>): string | null {
  for (const page of template.pages) {
    const state: unknown = page.state;
    if (!isRecord(state)) continue;
    for (const [key, fields] of Object.entries(TEMPLATE_GATE_ADAPTER.assetFields)) {
      const value = state[key];
      const elements = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
      for (const el of elements) {
        if (!isRecord(el)) continue;
        const bind = isRecord(el['bind']) ? el['bind'] : {};
        const logo = isRecord(bind['src']) ? bind['src']['ref'] : bind['src'];
        for (const field of fields) {
          const src = el[field];
          if (typeof src !== 'string' || src === '') continue;
          if (field === 'src' && logo === 'brand.logo') continue;
          if (!manifestPaths.has(src)) {
            return `${String(el['id'] ?? key)}.${field} "${src}" is not in the pack manifest`;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Every readable file as an entry, in source order; the rest as problems. The first of a duplicate
 * id wins. A file whose image paths are not in `manifestPaths` is a problem too.
 */
export function buildCatalog(
  sources: readonly { source: CatalogSource; files: readonly unknown[] }[],
  manifestPaths: ReadonlySet<string> = OPEN_MANIFEST_PATHS
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
      const unlisted = unlistedAsset(t, manifestPaths);
      if (unlisted) {
        problems.push({ source, id: t.id, reason: unlisted });
        continue;
      }
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

/** Of `entries`, the templates that lay out on `formatId` and have a colour world `brand` keeps. */
export function templatesIn(
  entries: readonly CatalogEntry[],
  formatId: string,
  brand: BrandPack
): CatalogEntry[] {
  const aspect = formatAspect(formatId);
  if (!aspect) return [];
  return entries.filter(
    (e) =>
      e.kind === 'template' &&
      e.formats.includes(aspect) &&
      offeredSchemes(e.template, brand).length > 0
  );
}

/** The catalogue's templates for `formatId`, for `brand` (default: the active one). */
export function templatesFor(formatId: string, brand: BrandPack = activeBrand()): CatalogEntry[] {
  return templatesIn(studioCatalog().entries, formatId, brand);
}

export const FAMILY_LABELS: Readonly<Record<string, string>> = {
  headline: 'Headline',
  quote: 'Quote',
  number: 'Number',
  // "Event" is an occasion filter next to the families: the date templates are "Date".
  event: 'Date',
  call: 'Call to action',
  data: 'Data',
  'photo-text': 'Photo + text',
  day: 'Special day',
  question: 'Question',
  'before-after': 'Before / after',
  annotation: 'Annotation',
  carousel: 'Carousel',
  community: 'Community',
  comparison: 'Comparison',
  demand: 'Demand',
  chart: 'Chart',
  figure: 'Figure',
  frame: 'Frame',
  news: 'News',
  invitation: 'Invitation',
  person: 'Person',
  petition: 'Petition',
  poster: 'Poster',
  split: 'Split',
  statement: 'Statement',
  study: 'Study',
};
