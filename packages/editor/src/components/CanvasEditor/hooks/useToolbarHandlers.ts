// SPDX-License-Identifier: MPL-2.0
import { useMemo } from 'react';

import { type HistoryStamps, routeHistory } from '../../../utils/historyStamp.js';

import type { GenericCanvasRef } from '../../GenericCanvas.js';
import type { FontRole } from '@ggraphic/core';
import type { ShadowPatch } from '../../../hooks/useFloatingModuleHandlers.js';
import type { PageCommandId } from '../../../utils/canvasCommandRegistry.js';
import { type SelectionGeometry } from '../../../utils/canvasCommands.js';
import type { CropAspectId } from '../../../utils/cropAspect.js';
import type { GradientFill } from '../../../utils/gradientFill.js';
import type { ImageLookId } from '../../../utils/imageLook.js';
import type { TextAlign } from '../../../utils/textAlign.js';
import type React from 'react';

interface UseToolbarHandlersParams {
  canvasRefsRef: React.MutableRefObject<React.RefObject<GenericCanvasRef | null>[]>;
  currentPageIndex: number;
  pageOpStamps: () => HistoryStamps;
  undoPageOp: () => void;
  redoPageOp: () => void;
  discardReplaceDeck: () => void;
}

/**
 * Bundles the toolbar action handlers for the active page. Undo/Redo walk the
 * active page's element history and the page-level history (page ops, a
 * replaced deck) in the order the steps were taken (`utils/historyStamp`).
 *
 * The active page's handle is looked up inside each handler, at call time.
 * Reading `canvasRefsRef.current[currentPageIndex]` once while building the
 * memo froze whatever the array held on the first render: the React Compiler
 * treats a value derived from a ref as non-reactive and creates these closures
 * exactly once. In the collab editor the pages arrive after the first render,
 * so every handler except undo/redo called into `undefined` for the whole
 * session — the mobile selection bar and pill looked alive and did nothing.
 */
export function useToolbarHandlers({
  canvasRefsRef,
  currentPageIndex,
  pageOpStamps,
  undoPageOp,
  redoPageOp,
  discardReplaceDeck,
}: UseToolbarHandlersParams) {
  return useMemo(() => {
    const page = () => canvasRefsRef.current[currentPageIndex]?.current ?? null;
    const route = (kind: 'undo' | 'redo') =>
      routeHistory(kind, page()?.historyStamps?.() ?? null, pageOpStamps());
    return {
      undo: () => {
        const target = route('undo');
        if (target === 'page') page()?.undo?.();
        else if (target === 'pageOps') undoPageOp();
      },
      // The spec path replaced the whole deck in one page-level step; Verwerfen
      // takes it back for good, so Redo cannot re-apply it.
      undoPages: discardReplaceDeck,
      redo: () => {
        const target = route('redo');
        if (target === 'page') page()?.redo?.();
        else if (target === 'pageOps') redoPageOp();
      },
      handleMoveLayer: (direction: 'up' | 'down') => page()?.handleMoveLayer?.(direction),
      handleDuplicate: () => page()?.handleDuplicate?.(),
      handleDeleteElement: () => page()?.handleDeleteElement?.(),
      handleCopy: () => page()?.runCommand?.('copy', null),
      handleToggleLock: () => page()?.runCommand?.('toggleLock', null),
      handleFlip: (axis: 'x' | 'y') =>
        page()?.runCommand?.(axis === 'x' ? 'flipHorizontal' : 'flipVertical', null),
      handleColorSelect: (color: string) => page()?.handleColorSelect?.(color),
      handleOpacityChange: (id: string, opacity: number, type: string) =>
        page()?.handleOpacityChange?.(id, opacity, type),
      handleFontSizeChange: (id: string, size: number) => page()?.handleFontSizeChange?.(id, size),
      handleFontRoleChange: (id: string, role: FontRole) =>
        page()?.handleFontRoleChange?.(id, role),
      handleTextFormatChange: (id: string, text: string) =>
        page()?.handleTextFormatChange?.(id, text),
      runCommand: (id: PageCommandId) => page()?.runCommand?.(id, null),
      getGeometry: (): SelectionGeometry | null => page()?.getGeometry?.() ?? null,
      handlePositionChange: (patch: { x?: number; y?: number }) => page()?.setPosition?.(patch),
      handleSizeChange: (patch: { width?: number; height?: number }) => page()?.setSize?.(patch),
      handleShadowChange: (id: string, patch: ShadowPatch, type: string) =>
        page()?.handleShadowChange?.(id, patch, type),
      handleOutlineChange: (id: string, patch: { stroke?: string; strokeWidth?: number }) =>
        page()?.handleOutlineChange?.(id, patch),
      handleBlurChange: (id: string, blur: number) => page()?.handleBlurChange?.(id, blur),
      handleImageLookChange: (id: string, look: ImageLookId) =>
        page()?.handleImageLookChange?.(id, look),
      handleCropImage: () => page()?.handleCropImage?.(),
      handleCancelCrop: () => page()?.handleCancelCrop?.(),
      handleFinishCrop: () => page()?.handleFinishCrop?.(),
      handleCropAspect: (id: CropAspectId) => page()?.handleCropAspect?.(id),
      handleCropRotation: (deg: number) => page()?.handleCropRotation?.(deg),
      handleSmartCrop: () => page()?.handleSmartCrop?.(),
      handleExpandImage: () => page()?.handleExpandImage?.(),
      handleGradientSelect: (gradient: GradientFill | null) =>
        page()?.handleGradientSelect?.(gradient),
      handleTextAlignChange: (id: string, align: TextAlign) =>
        page()?.handleTextAlignChange?.(id, align),
    };
  }, [canvasRefsRef, currentPageIndex, pageOpStamps, undoPageOp, redoPageOp, discardReplaceDeck]);
}
