// SPDX-License-Identifier: MPL-2.0
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/** The part of the window the editor occupies: its root's size, clipped to the window. */
export interface EditorBox {
  width: number;
  height: number;
}

interface EditorBoxState {
  box: EditorBox | null;
  measure: (root: HTMLElement | null) => (() => void) | undefined;
}

const EditorBoxContext = createContext<EditorBoxState | null>(null);

/**
 * Measures the editor root (`useEditorBoxRef`) so layout and canvas fit follow the box the host
 * gives the editor, not the window. Clipped to the window, a full-screen host measures exactly
 * the window, also where `min-h-[500px]` makes the root taller than a landscape phone.
 */
export function EditorBoxProvider({ children }: { children: ReactNode }) {
  const [box, setBox] = useState<EditorBox | null>(null);

  const measure = useCallback((root: HTMLElement | null) => {
    if (!root) return undefined;
    const update = () => {
      const rect = root.getBoundingClientRect();
      // A root without a box (hidden by the host, or no layout at all) says nothing about the
      // space the editor will get; until it has one, the window decides.
      if (rect.width === 0 || rect.height === 0) {
        setBox(null);
        return;
      }
      const width = Math.min(rect.width, window.innerWidth);
      const height = Math.min(rect.height, window.innerHeight);
      setBox((prev) =>
        prev?.width === width && prev.height === height ? prev : { width, height }
      );
    };
    // Measured while React commits, so the first paint already uses the box.
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const value = useMemo(() => ({ box, measure }), [box, measure]);
  return <EditorBoxContext.Provider value={value}>{children}</EditorBoxContext.Provider>;
}

/** Ref for the editor root; without an `EditorBoxProvider` it measures nothing. */
export function useEditorBoxRef():
  ((root: HTMLElement | null) => (() => void) | undefined) | undefined {
  return useContext(EditorBoxContext)?.measure;
}

/** The measured box, or `null` outside an editor or before its root mounted. */
export function useMeasuredEditorBox(): EditorBox | null {
  return useContext(EditorBoxContext)?.box ?? null;
}

const SERVER_WINDOW: EditorBox = { width: Infinity, height: Infinity };
let windowBox: EditorBox = SERVER_WINDOW;

function readWindow(): EditorBox {
  const { innerWidth: width, innerHeight: height } = window;
  if (windowBox.width !== width || windowBox.height !== height) windowBox = { width, height };
  return windowBox;
}

function subscribeWindow(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

/** The editor's box; the window where nothing was measured (a canvas outside the editor). */
export function useEditorBox(): EditorBox {
  const measured = useMeasuredEditorBox();
  const viewport = useSyncExternalStore(subscribeWindow, readWindow, () => SERVER_WINDOW);
  return measured ?? viewport;
}
