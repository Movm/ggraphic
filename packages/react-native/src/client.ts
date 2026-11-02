// SPDX-License-Identifier: MPL-2.0
/**
 * The native side of the bridge, without React: queues commands for the `commands` prop and
 * settles each one's promise when its `result` arrives through `onEvent`.
 */
import {
  parseEditorEvent,
  type EditorCommand,
  type EditorCommandBody,
  type EditorEvent,
  type GgraphicDocument,
} from './bridge.js';

export interface EditorClientOptions {
  /** The whole design after every change. */
  onChange?: (document: GgraphicDocument) => void;
  /** The editor mounted (again) and takes commands. */
  onReady?: () => void;
  /** How long a command may stay unanswered before its promise rejects. Default 30 s. */
  timeoutMs?: number;
}

export interface EditorClient {
  /** The pending commands, for the DOM component's `commands` prop. Same array until it changes. */
  getCommands: () => readonly EditorCommand[];
  /** Called whenever `getCommands()` changes; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** The DOM component's `onEvent`: reads anything, ignores what is not an event. */
  handleEvent: (event: unknown) => void;
  /** Opens a design, optionally with a new template pack (JSON, as `loadTemplatePack` takes it). */
  load: (input: { document?: GgraphicDocument | null; templates?: unknown }) => Promise<void>;
  /** The active page as a PNG, base64 without the data URL prefix. */
  exportPng: (options?: { pixelRatio?: number; transparent?: boolean }) => Promise<string>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /**
   * Rejects every pending command: the editor that would answer is gone. The client stays usable,
   * so a React Strict Mode remount (cleanup, then mount again) does not leave it dead.
   */
  cancelPending: () => void;
}

interface Pending {
  resolve: (value: string | null) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createEditorClient(options: EditorClientOptions = {}): EditorClient {
  const timeoutMs = options.timeoutMs ?? 30_000;
  let commands: readonly EditorCommand[] = [];
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const listeners = new Set<() => void>();

  const setCommands = (next: readonly EditorCommand[]) => {
    commands = next;
    for (const listener of listeners) listener();
  };

  /** Drops a command from the queue and from the pending map; its promise is the caller's. */
  const settle = (id: number): Pending | undefined => {
    const entry = pending.get(id);
    if (!entry) return undefined;
    pending.delete(id);
    clearTimeout(entry.timer);
    setCommands(commands.filter((command) => command.id !== id));
    return entry;
  };

  const send = (body: EditorCommandBody): Promise<string | null> => {
    const id = nextId++;
    return new Promise<string | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        settle(id)?.reject(new Error(`ggraphic editor did not answer "${body.type}" in time`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      setCommands([...commands, { ...body, id }]);
    });
  };

  const handle = (event: EditorEvent) => {
    switch (event.type) {
      case 'ready':
        options.onReady?.();
        return;
      case 'change':
        options.onChange?.(event.document);
        return;
      case 'result': {
        const entry = settle(event.id);
        if (!entry) return; // Timed out already, or answered twice.
        if (event.ok) entry.resolve(event.value);
        else entry.reject(new Error(event.error));
      }
    }
  };

  return {
    getCommands: () => commands,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    handleEvent: (value) => {
      const event = parseEditorEvent(value);
      if (event) handle(event);
    },
    load: async ({ document, templates }) => {
      await send({
        type: 'load',
        ...(document === undefined ? {} : { document }),
        ...(templates === undefined ? {} : { templates }),
      });
    },
    exportPng: async (exportOptions = {}) => {
      const png = await send({ type: 'exportPng', ...exportOptions });
      if (png === null) throw new Error('ggraphic editor sent no image');
      return png;
    },
    undo: async () => {
      await send({ type: 'undo' });
    },
    redo: async () => {
      await send({ type: 'redo' });
    },
    cancelPending: () => {
      for (const id of [...pending.keys()]) {
        settle(id)?.reject(new Error('ggraphic editor is gone'));
      }
    },
  };
}
