// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Sample photos for previews and render-gate goldens. `withSamplePhotos` is called in exactly two
 * places: `PreviewJobView` and the gate page. Its output is drawn and thrown away; it must never
 * reach the editor's document store, an export or a saved document.
 */
import { type SamplePhoto, type SamplePhotoRole } from '@ggraphic/templates-open/photos';

type Obj = Record<string, unknown>;
export type PageSize = { width: number; height: number };

/** A slot of at least this share of the page area counts as a (near) full-bleed background. */
const COVER_SHARE = 0.6;

/**
 * Which roles suit a slot, by its shape (the template file declares no per-slot photo hint):
 * tall slots take portraits (a scene only if there is none); wide slots crowds (then scenes);
 * square-ish ones scenes and details together. The first group that has any photo is the pool.
 */
function roleGroupsFor(
  width: number,
  height: number,
  page: PageSize | null
): readonly (readonly SamplePhotoRole[])[] {
  // A slot that covers most of the page is a background: a scene, never a giant cropped face.
  if (page && width * height >= COVER_SHARE * page.width * page.height)
    return [['scene', 'detail']];
  const ratio = height > 0 ? width / height : 1;
  if (ratio < 0.85) return [['portrait'], ['scene']];
  if (ratio > 1.3) return [['crowd'], ['scene']];
  return [['scene', 'detail']];
}

/** FNV-1a; an empty seed hashes to 0 so a call without a template id starts at the first photo. */
function hashSeed(seed: string): number {
  if (seed === '') return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

/**
 * `state` with every empty photo (`src === ''`) filled from `samples`; a non-empty `src` and every
 * other instance stay the same object. The n-th empty slot takes the ((hash of `seed`) + n)-th
 * photo of its pool (`page` is the canvas size; slots covering most of it get scenes): with the template id as `seed`, different templates start at different
 * photos and the slots of one template get consecutive, hence different, ones.
 */
export function withSamplePhotos(
  state: Obj,
  samples: readonly SamplePhoto[],
  seed = '',
  page: PageSize | null = null
): Obj {
  const list = state['userImageInstances'];
  if (!Array.isArray(list) || samples.length === 0) return state;
  const offset = hashSeed(seed);
  let empties = 0;
  let changed = false;
  const next = list.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) return item;
    const image = item as Obj;
    if (image['src'] !== '') return item;
    const groups = roleGroupsFor(num(image['width'], 1), num(image['height'], 1), page);
    const pools = groups.map((roles) => samples.filter((s) => roles.includes(s.role)));
    const pool = pools.find((p) => p.length > 0) ?? samples;
    const pick = pool[(offset + empties) % pool.length];
    empties += 1;
    if (!pick) return item;
    changed = true;
    return { ...image, src: pick.src };
  });
  return changed ? { ...state, userImageInstances: next } : state;
}
