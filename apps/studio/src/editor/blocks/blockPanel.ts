// SPDX-License-Identifier: AGPL-3.0-only
/** The Elements panel's "Blocks" category: the library blocks the active page can take, under their family. */
import { useBlockInsert } from '@ggraphic/editor/components/CanvasEditor/blockInsertContext';
import { type ElementItem } from '@ggraphic/editor/sidebar/sections/assets/elementTypes';
import {
  type ElementBlocks,
  type ElementPanelHost,
} from '@ggraphic/editor/sidebar/sections/assets/elementPanelHost';

import { FAMILY_LABELS } from '../templates/catalog';

import { type LibraryBlock } from './blockLibrary';

/** A plain sketch of the family's layout, as the tile's picture; the colour works on either theme. */
function sketch(family: string): string {
  const bar = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#8a8a8a"/>`;
  const body =
    family === 'quote'
      ? `<text x="8" y="40" font-size="40" font-family="serif" fill="#8a8a8a">&#8220;</text>${bar(8, 46, 48, 6)}${bar(8, 56, 28, 4)}`
      : family === 'number'
        ? `<text x="8" y="40" font-size="32" font-weight="700" font-family="sans-serif" fill="#8a8a8a">42</text>${bar(8, 48, 48, 4)}${bar(8, 56, 36, 4)}`
        : `${bar(8, 12, 20, 4)}${bar(8, 22, 48, 8)}${bar(8, 34, 40, 8)}${bar(8, 50, 30, 4)}`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`
  )}`;
}

const familyLabel = (family: string) => FAMILY_LABELS[family] ?? family;

function itemOf(block: LibraryBlock): ElementItem {
  return {
    key: block.id,
    label: block.title,
    keywords: [block.title.toLowerCase(), familyLabel(block.family).toLowerCase()],
    action: { kind: 'block', blockId: block.id },
    thumb: { t: 'img', src: sketch(block.family) },
  };
}

/** Hook: the panel's blocks; null while no provider offers any (no page format, no block). */
function useStudioBlocks(): ElementBlocks | null {
  const api = useBlockInsert();
  if (!api) return null;
  const blocks = api.blocks as LibraryBlock[];
  const groups: { label: string; keys: string[] }[] = [];
  for (const block of blocks) {
    const label = familyLabel(block.family);
    const group = groups.find((g) => g.label === label);
    if (group) group.keys.push(block.id);
    else groups.push({ label, keys: [block.id] });
  }
  return {
    label: 'Blocks',
    items: blocks.map(itemOf),
    groups,
    isLoading: api.isLoading,
    has: (blockId) => blocks.some((b) => b.id === blockId),
    insert: (blockId) => api.insert(blockId),
  };
}

export const STUDIO_ELEMENT_PANEL: ElementPanelHost = { useBlocks: useStudioBlocks };
