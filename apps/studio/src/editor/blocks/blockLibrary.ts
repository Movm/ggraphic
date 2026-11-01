// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The block library: the blocks a template file declares (and whole `kind: 'block'` files),
 * and the one door from a library block to the elements that land on a page. A block is cut
 * out of its template as the page would show it, so its bindings travel and follow the brand.
 */
import {
  deriveSchemes,
  normalizeColor,
  offeredSchemes,
  SCHEME_IDS,
  type BrandPack,
  type SchemeId,
} from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand';
import { BLOCK_COLLECTIONS, boundsOf, type LiftedBlock } from '@ggraphic/editor/elements';

import { studioCatalog, type CatalogEntry } from '../templates/catalog';
import { templatePageState } from '../templates/instantiate';

export interface LibraryBlock {
  /** `${templateId}/${blockId}` for a template's block, the file id for a `kind: 'block'` file. */
  id: string;
  version: number;
  title: string;
  family: string;
  templateId: string;
  /** Null: a `kind: 'block'` file, where every element belongs to the block. */
  elementIds: readonly string[] | null;
}

/** `kind: 'block'` entries first, then each template's blocks, in catalogue order. */
export function blockLibrary(entries: readonly CatalogEntry[]): LibraryBlock[] {
  const own = entries
    .filter((e) => e.kind === 'block')
    .map<LibraryBlock>((e) => ({
      id: e.id,
      version: e.version,
      title: e.title,
      family: e.family,
      templateId: e.id,
      elementIds: null,
    }));
  const declared = entries
    .filter((e) => e.kind === 'template')
    .flatMap((e) =>
      e.template.blocks.map<LibraryBlock>((b) => ({
        id: `${e.id}/${b.id}`,
        version: e.version,
        title: b.title.en,
        family: e.family,
        templateId: e.id,
        elementIds: b.elementIds,
      }))
    );
  return [...own, ...declared];
}

const sameColor = (a: unknown, b: string): boolean => {
  if (typeof a !== 'string') return false;
  const x = normalizeColor(a);
  const y = normalizeColor(b);
  return x !== null && x === y;
};

/**
 * The colour world a block is cut in: the page's own, when the template offers it; else the world
 * whose ground is the page's background; else the template's first. Null when the brand keeps none.
 */
export function blockScheme(
  entry: CatalogEntry,
  page: { brandScheme?: unknown; backgroundColor?: unknown },
  brand: BrandPack
): SchemeId | null {
  const offered = offeredSchemes(entry.template, brand);
  const own = SCHEME_IDS.find((id) => id === page.brandScheme);
  if (own && offered.includes(own)) return own;
  const grounds = deriveSchemes(brand);
  const byGround = offered.find((id) =>
    sameColor(page.backgroundColor, grounds.find((s) => s.id === id)?.roles.ground ?? '')
  );
  return byGround ?? offered[0] ?? null;
}

const asList = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

/**
 * The block as elements for `page`: the template laid out at the page's format and world, cut to
 * the block's elements, every id made fresh with `token`. Null when the template does not lay out
 * on the format or the brand.
 */
export function liftLibraryBlock(
  block: LibraryBlock,
  page: { formatId: string; brandScheme?: unknown; backgroundColor?: unknown },
  token: string
): LiftedBlock | null {
  const entry = studioCatalog().entries.find((e) => e.id === block.templateId);
  if (!entry) return null;
  const brand = activeBrand();
  const schemeId = blockScheme(entry, page, brand);
  if (!schemeId) return null;
  const state = templatePageState(entry, page.formatId, { schemeId, brand });
  if (!state) return null;

  const keep = block.elementIds ? new Set(block.elementIds) : null;
  const wanted = (id: unknown): id is string =>
    typeof id === 'string' && (keep === null || keep.has(id));
  const fresh = (id: string) => `${id}-${token}`;

  const collections = Object.fromEntries(
    BLOCK_COLLECTIONS.map((key) => [
      key,
      asList(state[key])
        .filter((e) => wanted(e['id']))
        .map((e) => ({ ...e, id: fresh(e['id'] as string) })),
    ])
  ) as Pick<LiftedBlock, (typeof BLOCK_COLLECTIONS)[number]>;

  const iconStates = Object.fromEntries(
    Object.entries((state['iconStates'] ?? {}) as Record<string, Record<string, unknown>>)
      .filter(([id]) => wanted(id))
      // An icon without `iconId` IS its catalogue id; the new instance id must say so.
      .map(([id, s]) => [fresh(id), { ...s, iconId: s['iconId'] ?? id }])
  ) as LiftedBlock['iconStates'];
  const selectedIcons = ((state['selectedIcons'] ?? []) as string[]).filter(wanted).map(fresh);
  const layerOrder = ((state['layerOrder'] ?? []) as string[]).filter(wanted).map(fresh);

  const lifted = { ...collections, selectedIcons, iconStates, layerOrder };
  return {
    ...lifted,
    bounds: boundsOf(lifted),
    blockRef: { id: block.id, version: block.version },
    brandScheme: schemeId,
  };
}
