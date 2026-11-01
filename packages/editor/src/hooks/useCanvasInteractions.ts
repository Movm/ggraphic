// SPDX-License-Identifier: MPL-2.0
/**
 * useCanvasInteractions - Shared canvas interaction handlers
 *
 * NOTE: This hook does NOT subscribe to selectedElement reactively.
 * Selection state is in the Zustand store — read via store.getState().selectedElement
 * at call time in event handlers. Components that need reactive selection
 * should use useCanvasStoreSelector((s) => s.selectedElement) directly.
 */

import { useCallback, useEffect, useRef } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider.js';

import { groupClickSelection, type PageGroup } from '../groups/pageGroups.js';

import { useMarqueeSelection } from './useMarqueeSelection.js';

import type { CanvasStageRef } from '../primitives/CanvasStage.js';
import type { SnapTarget } from '../utils/snapping.js';
import type Konva from 'konva';

export interface UseCanvasInteractionsOptions {
  stageRef: React.RefObject<CanvasStageRef | null>;
  /** Auswahlrahmen per Maus (aus in der Vorschau). */
  marqueeEnabled: boolean;
  /** The page's groups, read at click time: a click on a member selects its whole group. */
  getGroups?: () => readonly PageGroup[];
}

export interface UseCanvasInteractionsResult {
  setSelectedElement: (element: string | null) => void;
  /** Klick auf ein Element: ersetzt die Auswahl, mit Shift schaltet er es in der Auswahl um. */
  selectElement: (id: string) => void;
  /** Rahmenzug, der außerhalb der Bühne begonnen hat (Arbeitsfläche um das Bild). */
  beginMarquee: (evt: MouseEvent) => void;
  handleStageClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  handleSnapChange: (h: boolean, v: boolean) => void;
  handlePositionChange: (id: string, x: number, y: number, width: number, height: number) => void;
  getSnapTargets: (excludeId: string) => SnapTarget[];
}

export function useCanvasInteractions({
  stageRef,
  marqueeEnabled,
  getGroups,
}: UseCanvasInteractionsOptions): UseCanvasInteractionsResult {
  const store = useCanvasStore();
  const { setSelectedElement, selectLayer, setSnapGuides, updateElementPosition } =
    store.getState();
  const { consumeMarqueeClick, beginMarquee } = useMarqueeSelection(stageRef, marqueeEnabled);
  // Die Primitive melden ihre Auswahl ohne Event, meist schon beim Druck.
  // Shift und „Zeiger ist unten" stehen deshalb vorher fest: ein nativer
  // Capture-Listener läuft vor Konvas eigenem Handler.
  const additiveRef = useRef(false);
  const pointerDownRef = useRef(false);

  useEffect(() => {
    const container = stageRef.current?.getStage()?.container();
    if (!container) return;
    const onDown = (e: PointerEvent) => {
      additiveRef.current = e.shiftKey;
      pointerDownRef.current = true;
    };
    const onUp = () => {
      pointerDownRef.current = false;
    };
    container.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      container.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [stageRef]);

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (e.target === e.target.getStage() && !e.evt.shiftKey) {
        setSelectedElement(null);
        setSnapGuides(false, false);
      }
    },
    [setSelectedElement, setSnapGuides]
  );

  const selectElement = useCallback(
    (id: string) => {
      if (consumeMarqueeClick()) return;
      const additive = additiveRef.current;
      const { selectedLayerIds } = store.getState();
      const groups = getGroups?.() ?? [];
      const apply = () => {
        if (additive) selectLayer(id, true);
        else if (groups.length === 0) setSelectedElement(id);
        else store.getState().setSelectedLayers(groupClickSelection(groups, selectedLayerIds, id));
      };
      const stage = stageRef.current?.getStage();
      // Druck auf ein Element der Mehrfachauswahl: es könnte der Beginn eines
      // Gruppenzugs sein. Erst ein Loslassen ohne Ziehen klappt die Auswahl
      // auf dieses Element zusammen (mit Shift: nimmt es heraus).
      if (
        pointerDownRef.current &&
        stage &&
        selectedLayerIds.length > 1 &&
        selectedLayerIds.includes(id)
      ) {
        let dragged = false;
        stage.on('dragstart.multiSelect', () => {
          dragged = true;
        });
        window.addEventListener(
          'pointerup',
          () => {
            stage.off('dragstart.multiSelect');
            if (!dragged) apply();
          },
          { once: true }
        );
        return;
      }
      apply();
    },
    [consumeMarqueeClick, getGroups, selectLayer, setSelectedElement, stageRef, store]
  );

  const handleSnapChange = useCallback(
    (h: boolean, v: boolean) => {
      setSnapGuides(h, v);
    },
    [setSnapGuides]
  );

  const handlePositionChange = useCallback(
    (id: string, x: number, y: number, width: number, height: number) => {
      updateElementPosition(id, x, y, width, height);
    },
    [updateElementPosition]
  );

  const getSnapTargets = useCallback(
    (excludeId: string) => {
      const positions = store.getState().elementPositions;
      return Object.values(positions).filter((t) => t.id !== excludeId);
    },
    [store]
  );

  return {
    setSelectedElement,
    selectElement,
    beginMarquee,
    handleStageClick,
    handleSnapChange,
    handlePositionChange,
    getSnapTargets,
  };
}
