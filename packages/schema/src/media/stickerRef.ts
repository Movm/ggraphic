// SPDX-License-Identifier: AGPL-3.0-only

/** A placed or saved sticker: the catalog id and src, or `asset:<uuid>` and a share path. */
export interface StickerRef {
  id: string;
  src: string;
}
