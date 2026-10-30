// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Sample photos for previews and render-gate goldens. `withSamplePhotos` is called in exactly two
 * places: `PreviewJobView` and the gate page. Its output is drawn and thrown away; it must never
 * reach the editor's document store, an export or a saved document.
 */
import { type SamplePhoto, type SamplePhotoRole } from '@ggraphic/templates-open';

type Obj = Record<string, unknown>;

/**
 * Which roles suit a slot, by its shape (the template file declares no per-slot photo hint):
 * tall slots take a portrait first, then a scene; wide slots a crowd, then a scene; square-ish
 * ones a scene, then a detail. The n-th empty slot of a page takes the (n mod pool size)-th
 * photo of that pool, so the choice is deterministic and a page with two empty slots shows two
 * different photos.
 */
function rolesFor(width: number, height: number): readonly SamplePhotoRole[] {
  const ratio = height > 0 ? width / height : 1;
  if (ratio < 0.85) return ['portrait', 'scene'];
  if (ratio > 1.3) return ['crowd', 'scene'];
  return ['scene', 'detail'];
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);

/** `state` with every empty photo (`src === ''`) filled from `samples`; a non-empty `src` and every other instance stay the same object. */
export function withSamplePhotos(state: Obj, samples: readonly SamplePhoto[]): Obj {
  const list = state['userImageInstances'];
  if (!Array.isArray(list) || samples.length === 0) return state;
  let empties = 0;
  let changed = false;
  const next = list.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) return item;
    const image = item as Obj;
    if (image['src'] !== '') return item;
    const roles = rolesFor(num(image['width'], 1), num(image['height'], 1));
    const pool = roles.flatMap((role) => samples.filter((s) => s.role === role));
    const pick = (pool.length > 0 ? pool : samples)[empties % (pool.length || samples.length)];
    empties += 1;
    if (!pick) return item;
    changed = true;
    return { ...image, src: pick.src };
  });
  return changed ? { ...state, userImageInstances: next } : state;
}
