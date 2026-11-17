// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { type EditorCommand } from './bridge.js';
import { createEditorClient, type EditorClient, type EditorClientOptions } from './client.js';

export interface GgraphicEditorBridge {
  /** Load, export and undo/redo; every call resolves when the editor has answered. */
  editor: Omit<EditorClient, 'getCommands' | 'subscribe' | 'handleEvent' | 'cancelPending'>;
  /** Pass both to the DOM component: `<Editor commands={commands} onEvent={onEvent} />`. */
  commands: readonly EditorCommand[];
  onEvent: (event: unknown) => void;
}

/**
 * The native side of the bridge for one editor. The callbacks may change between renders; the
 * latest ones are called. Pending commands reject when the component unmounts.
 */
export function useGgraphicEditor(options: EditorClientOptions = {}): GgraphicEditorBridge {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const [client] = useState(() =>
    createEditorClient({
      onChange: (document) => latest.current.onChange?.(document),
      onReady: () => latest.current.onReady?.(),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    })
  );
  useEffect(() => () => client.cancelPending(), [client]);
  const commands = useSyncExternalStore(client.subscribe, client.getCommands, client.getCommands);
  const [editor] = useState(() => ({
    load: client.load,
    exportPng: client.exportPng,
    undo: client.undo,
    redo: client.redo,
  }));
  return { editor, commands, onEvent: client.handleEvent };
}
