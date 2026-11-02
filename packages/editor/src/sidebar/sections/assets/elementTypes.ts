// SPDX-License-Identifier: AGPL-3.0-only
import {
  ELEMENT_DRAG_TYPE,
  MEDIA_DRAG_TYPE,
  type ElementDragPayload,
  type MediaDragPayload,
} from '../../../utils/mediaDrop.js';

import type { HostElementKindName, HostElementPayload } from '../../../utils/canvasItem.js';
import type { ChartType } from '../../../utils/chartUtils.js';
import type { FrameClipType } from '../../../utils/frameUtils.js';
import type { KawaiiIllustrationType, SvgDef } from '../../../utils/illustrations/types.js';
import type { ShapeType } from '../../../utils/shapes.js';
import type { StickerRef } from '@ggraphic/schema';

/** What a tile does: an element add (icons toggle) or a photo placed as image. */
export type ElementAction = ElementDragPayload | ({ kind: 'media' } & MediaDragPayload);

/**
 * How a tile previews its element. Plain data, so a recent tile can be stored
 * and drawn again without the catalogue that produced it.
 */
export type ElementThumbSpec =
  | { t: 'img'; src: string; inverse?: boolean }
  | { t: 'share'; src: string }
  | { t: 'photo'; src: string }
  | { t: 'shape'; shapeType: ShapeType }
  | { t: 'chart'; chartType: ChartType }
  | { t: 'frame'; clipType: FrameClipType }
  | { t: 'kawaii'; id: KawaiiIllustrationType }
  | { t: 'svg'; def: SvgDef }
  | { t: 'icon'; iconId: string }
  /** A host kind's tile, drawn by the host (`ElementPanelHost.HostThumb`). */
  | HostElementThumb;

/** The preview of a host kind's tile: its `kind` as `t`, and its payload. */
export type HostElementThumb = {
  [K in HostElementKindName]: { t: K } & HostElementPayload<K>;
}[HostElementKindName];

export interface ElementItem {
  /** Stable across sessions: the recent list and React keys use it. */
  key: string;
  label: string;
  keywords: readonly string[];
  action: ElementAction;
  thumb: ElementThumbSpec;
}

/** Drag type and JSON for a tile. */
export function dragDataFor(action: ElementAction): { type: string; data: string } {
  if (action.kind === 'media') {
    const payload: MediaDragPayload = {
      url: action.url,
      name: action.name,
      ...(action.attribution ? { attribution: action.attribution } : {}),
    };
    return { type: MEDIA_DRAG_TYPE, data: JSON.stringify(payload) };
  }
  return { type: ELEMENT_DRAG_TYPE, data: JSON.stringify(action) };
}

/** A shared-gallery sticker as a tile, for the recent list and its drag. */
export function galleryStickerItem(ref: StickerRef): ElementItem {
  return {
    key: `sticker:${ref.id}`,
    label: 'Sticker',
    keywords: ['sticker'],
    action: { kind: 'sticker', ref },
    thumb: { t: 'share', src: ref.src },
  };
}
