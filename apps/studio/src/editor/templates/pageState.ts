// SPDX-License-Identifier: AGPL-3.0-only
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { type BaseCanvasState } from '@ggraphic/editor/configs/factory/baseTypes';
import { carryInstanceState } from '@ggraphic/editor/configs/factory/carryInstanceState';

/**
 * A Studio page: the editor's element collections plus a colour ground. Only
 * keys the editor writes back into the pages document persist
 * (`PAGE_PERSISTED_STATE_KEYS`): the collections, `backgroundColor` and the
 * brand binding keys.
 */
export interface StudioPageState extends BaseCanvasState {
  backgroundColor: string;
  layerOrder: string[];
  bind?: Record<string, { ref: string; value: string }>;
  brandScheme?: string;
  brandStamp?: string;
}

/** What a template puts on a fresh page. */
export type PageSeed = Partial<
  Pick<
    StudioPageState,
    'backgroundColor' | 'additionalTexts' | 'shapeInstances' | 'userImageInstances'
  >
>;

/** The brand binding keys a page keeps across a re-seed (read back, never invented). */
function brandKeysFrom(props: Record<string, unknown>): Partial<StudioPageState> {
  const out: Partial<StudioPageState> = {};
  const bind = props['bind'];
  if (typeof bind === 'object' && bind !== null && !Array.isArray(bind)) {
    out.bind = bind as NonNullable<StudioPageState['bind']>;
  }
  if (typeof props['brandScheme'] === 'string') out.brandScheme = props['brandScheme'];
  if (typeof props['brandStamp'] === 'string') out.brandStamp = props['brandStamp'];
  return out;
}

/**
 * The page state from what is stored (`props`). A page that has never been
 * saved has no collections yet and gets the template's seed; a saved one keeps
 * exactly what it holds, also when the user emptied it.
 */
export function pageStateFrom(props: Record<string, unknown>, seed: PageSeed): StudioPageState {
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
    ...brandKeysFrom(props),
  };
}

function seedLayerOrder(seed: PageSeed): string[] {
  return [
    ...(seed.shapeInstances ?? []),
    ...(seed.userImageInstances ?? []),
    ...(seed.additionalTexts ?? []),
  ].map((e) => e.id);
}
