// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useSyncExternalStore } from 'react';

import { MOBILE_BREAKPOINT } from '../utils/viewport.js';
import { useMeasuredEditorBox } from './editorBox.js';

/** Mirrors the `max-canvas-mobile:` variant for a window without a measured editor box. */
export const CANVAS_MOBILE_QUERY = '(max-width: 899px)';

// A `useMediaQuery` kept here so the editor needs nothing from the host.
// Fires only when the result changes.
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Mobile layout: the editor's box (`EditorBoxProvider`) is narrower than 900px. Outside an editor,
 * or before its root mounted, the window decides, like the `max-canvas-mobile:` media fallback.
 */
export function useIsCanvasMobile(): boolean {
  const box = useMeasuredEditorBox();
  const narrowWindow = useMediaQuery(CANVAS_MOBILE_QUERY);
  return box ? box.width < MOBILE_BREAKPOINT : narrowWindow;
}
