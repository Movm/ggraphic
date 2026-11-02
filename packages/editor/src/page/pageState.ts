// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The state of a free page: what a template seeds, what the editor stores and reads back. Every
 * page of a host that offers templates as data (`createPageConfig`) has this shape.
 */
import { type Bindings } from '@ggraphic/core';
import { activeBrand } from '../brand/brandRegistry.js';
import { type BaseCanvasState } from '../configs/factory/baseTypes.js';
import { carryInstanceState } from '../configs/factory/carryInstanceState.js';

/** An element group on a page; the full semantics come with the groups feature. */
export interface PageGroup {
  id: string;
  blockRef?: { id: string; version: number };
  elementIds: string[];
}

const isRef = (v: unknown): v is { id: string; version: number } =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { id?: unknown }).id === 'string' &&
  Number.isInteger((v as { version?: unknown }).version) &&
  (v as { version: number }).version >= 1;

const isGroup = (v: unknown): v is PageGroup => {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g['id'] === 'string' &&
    Array.isArray(g['elementIds']) &&
    g['elementIds'].every((id) => typeof id === 'string') &&
    (g['blockRef'] === undefined || isRef(g['blockRef']))
  );
};

/**
 * A free page: the editor's element collections plus a colour ground. Only
 * keys the editor writes back into the pages document persist
 * (`PAGE_PERSISTED_STATE_KEYS`): the collections, `backgroundColor` and the
 * brand binding keys, `templateRef` and `groups`.
 */
export interface PageState extends BaseCanvasState {
  backgroundColor: string;
  layerOrder: string[];
  bind?: Bindings;
  brandScheme?: string;
  brandStamp?: string;
  templateRef?: { id: string; version: number };
  groups?: PageGroup[];
}

/** What a template puts on a fresh page. */
export type PageSeed = Partial<
  Pick<
    PageState,
    | 'backgroundColor'
    | 'additionalTexts'
    | 'shapeInstances'
    | 'userImageInstances'
    | 'bind'
    | 'brandScheme'
    | 'brandStamp'
  >
>;

/** The brand binding and template keys a page keeps across a re-seed (read back, never invented). */
function brandKeysFrom(props: Record<string, unknown>): Partial<PageState> {
  const out: Partial<PageState> = {};
  const bind = props['bind'];
  if (typeof bind === 'object' && bind !== null && !Array.isArray(bind)) {
    out.bind = bind as NonNullable<PageState['bind']>;
  }
  if (typeof props['brandScheme'] === 'string') out.brandScheme = props['brandScheme'];
  if (typeof props['brandStamp'] === 'string') out.brandStamp = props['brandStamp'];
  if (isRef(props['templateRef'])) {
    out.templateRef = { id: props['templateRef'].id, version: props['templateRef'].version };
  }
  if (Array.isArray(props['groups'])) out.groups = props['groups'].filter(isGroup);
  return out;
}

/**
 * The page state from what is stored (`props`). A page that has never been
 * saved has no collections yet and gets the template's seed; a saved one keeps
 * exactly what it holds, also when the user emptied it.
 */
export function pageStateFrom(props: Record<string, unknown>, seed: PageSeed): PageState {
  const stored = Array.isArray(props['additionalTexts']) || Array.isArray(props['shapeInstances']);
  const seeded = stored ? props : { ...props, ...seed, layerOrder: seedLayerOrder(seed) };
  const background = seeded['backgroundColor'];
  return {
    isDesktop: typeof window !== 'undefined' && window.innerWidth >= 900,
    ...carryInstanceState(seeded),
    backgroundColor:
      typeof background === 'string'
        ? background
        : (seed.backgroundColor ?? activeBrand().defaultBackground),
    ...brandKeysFrom(seeded),
  };
}

function seedLayerOrder(seed: PageSeed): string[] {
  return [
    ...(seed.shapeInstances ?? []),
    ...(seed.userImageInstances ?? []),
    ...(seed.additionalTexts ?? []),
  ].map((e) => e.id);
}
