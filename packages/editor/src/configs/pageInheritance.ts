// SPDX-License-Identifier: MPL-2.0
/**
 * Which parts of a page's state carry over when adding a page or converting
 * it to another template. One module so every path (add, setPageConfig)
 * shares the same contract.
 */

import { COMPOSER_PLANE_IDS, type ShapeInstance } from '../utils/shapes.js';

/** Templates that draw the composer's background planes as free shapes. */
const PLANE_TEMPLATES: readonly string[] = ['freeform', 'freeform-at'];

/** Background keys copied verbatim when present on the source page. */
const BACKGROUND_KEYS = [
  'backgroundColor',
  'imageOffset',
  'imageScale',
  // Der Begradigungs-Winkel gehört zur Lage des Fotos und wandert mit ihr.
  'backgroundImageRotation',
  'backgroundImageOpacity',
  'imageAttribution',
  'backgroundMode',
] as const;

/** Brand keys copied verbatim when present on the source page. */
const BRAND_KEYS = [
  'colorScheme',
  'colorSchemeId',
  // Brand bindings (F0): an added or converted page stays bound to its brand.
  'bind',
  'brandScheme',
  'brandStamp',
  // `templateRef` and `groups` (F0) are deliberately not inheritable: they
  // describe one page's origin and its element groups, not a style to carry on.
] as const;

/**
 * What a new page takes from the active one: its brand (scheme and brand
 * bindings) and its background (photo, colour, composer planes). A host's
 * blank page wants the brand without the background (#166).
 */
export interface PageInheritance {
  brand: boolean;
  background: boolean;
}

const copyPresent = (
  state: Record<string, unknown>,
  keys: readonly string[],
  into: Record<string, unknown>
) => {
  for (const key of keys) {
    if (state[key] !== undefined && state[key] !== null && state[key] !== '') {
      into[key] = state[key];
    }
  }
};

export function extractInheritablePageState(
  state: Record<string, unknown>,
  /** The template the new page uses; decides what happens to composer planes. */
  targetConfigId?: string,
  parts: PageInheritance = { brand: true, background: true }
): Record<string, unknown> {
  const inherited: Record<string, unknown> = {};
  if (parts.brand) copyPresent(state, BRAND_KEYS, inherited);
  if (!parts.background) return inherited;

  // Image background source — templates read it under either key, so mirror
  // whichever one is set into both.
  const imageSrc = state.currentImageSrc || state.imageSrc;
  if (imageSrc) {
    inherited.currentImageSrc = imageSrc;
    inherited.imageSrc = imageSrc;
  }

  copyPresent(state, BACKGROUND_KEYS, inherited);

  // Cross-template rule: a source with an image background but no explicit
  // mode (zitat, …) lands in mode-aware templates (freeform) as
  // an image page, not the 'color' default.
  if (imageSrc && !state.backgroundMode) {
    inherited.backgroundMode = 'image';
  }

  // A composed sharepic's background is more than the keys above: a gradient
  // (`sc-bg`), the colour beside a photo strip (`sc-panel`, with the photo
  // shifted into the strip via imageOffset), the AT strip tint and the photo
  // scrim are shapes. Without them a new page from a strip slide shows
  // a blank band where the panel was, and one from a gradient slide is flat.
  const shapes = Array.isArray(state.shapeInstances)
    ? (state.shapeInstances as ShapeInstance[])
    : [];
  const planes = shapes.filter((shape) => COMPOSER_PLANE_IDS.includes(shape.id));
  if (planes.length > 0 && targetConfigId && PLANE_TEMPLATES.includes(targetConfigId)) {
    inherited.shapeInstances = planes.map((plane) => ({ ...plane }));
    const order = Array.isArray(state.layerOrder) ? (state.layerOrder as string[]) : [];
    const ids = planes.map((plane) => plane.id);
    inherited.layerOrder = [
      ...order.filter((id) => ids.includes(id)),
      ...ids.filter((id) => !order.includes(id)),
    ];
    const locked = Array.isArray(state.lockedLayerIds) ? (state.lockedLayerIds as string[]) : [];
    if (locked.some((id) => ids.includes(id))) {
      inherited.lockedLayerIds = locked.filter((id) => ids.includes(id));
    }
  } else if (planes.some((plane) => plane.id === 'sc-panel')) {
    // Another template lays out its own content, which free planes would
    // cover; it gets the photo back centred instead of shifted towards a
    // panel it does not have.
    delete inherited.imageOffset;
    delete inherited.imageScale;
    delete inherited.backgroundImageRotation;
  }

  return inherited;
}
