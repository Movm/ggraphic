// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Offers the library's blocks to the editor and drops one onto a page: laid out by the library
 * for the page's format and world, then added through the page's canvas handle as one undo step.
 */
import { activeBrand } from '@ggraphic/editor/brand';
import {
  BlockInsertContext,
  type BlockInsertApi,
  type BlockTarget,
  type EditorShellProviderProps,
} from '@ggraphic/editor/shell';
import { offeredSchemes } from '@ggraphic/core';
import { useCallback, useMemo } from 'react';

import { useHiddenTemplates } from '../../start/hiddenTemplates';
import { formatAspect, studioCatalog } from '../templates/catalog';

import { blockLibrary, liftLibraryBlock, type LibraryBlock } from './blockLibrary';

/** Six random base-36 characters: enough that two blocks on one page never share ids. */
const token = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

export function BlockInsertProvider({
  currentPageIndex,
  formatId,
  canvasRefsRef,
  children,
}: EditorShellProviderProps) {
  const brand = activeBrand();
  // Hidden for everyone: a page that already holds a block keeps it. Until the hidden list is in,
  // no block is offered, so a hidden one never flashes up.
  const { hiddenIds, settled } = useHiddenTemplates();
  const bloecke = useMemo<LibraryBlock[]>(() => {
    const aspect = formatId ? formatAspect(formatId) : null;
    if (!aspect || !settled) return [];
    const entries = studioCatalog().entries.filter(
      (e) =>
        !hiddenIds.has(e.id) &&
        e.formats.includes(aspect) &&
        offeredSchemes(e.template, brand).length > 0
    );
    return blockLibrary(entries);
  }, [formatId, brand, hiddenIds, settled]);

  const insert = useCallback(
    async (blockId: string, target: BlockTarget = {}): Promise<boolean> => {
      const pageIndex = target.pageIndex ?? currentPageIndex;
      const block = bloecke.find((b) => b.id === blockId);
      const ref = canvasRefsRef.current[pageIndex]?.current;
      if (!block || !ref || !formatId) return false;
      try {
        return await ref.insertBlock(
          (page) => Promise.resolve(liftLibraryBlock(block, { formatId, ...page }, token())),
          target.at
        );
      } catch (error) {
        console.error('Block could not be inserted', error);
        return false;
      }
    },
    [bloecke, currentPageIndex, canvasRefsRef, formatId]
  );

  const value = useMemo<BlockInsertApi | null>(
    () =>
      !settled
        ? { bloecke, isLoading: true, insert }
        : bloecke.length > 0
          ? { bloecke, isLoading: false, insert }
          : null,
    [bloecke, insert, settled]
  );
  return <BlockInsertContext.Provider value={value}>{children}</BlockInsertContext.Provider>;
}
