// SPDX-License-Identifier: MPL-2.0
/**
 * The editor side of the bridge: `<GgraphicEditor>` driven by the host's `commands`, answering
 * through `onEvent`. Render it from the host's own `'use dom'` file, so that Expo bundles it for
 * the web view; it imports nothing from React Native or Expo.
 */
import {
  GgraphicEditor,
  loadTemplatePack,
  type CanvasEditorExportApi,
  type GgraphicDocument,
  type GgraphicEditorProps,
  type TemplatePack,
} from '@ggraphic/editor';
import { useEffect, useRef, useState } from 'react';

import {
  parseEditorCommand,
  pngBase64,
  type EditorCommand,
  type EditorEvent,
  type EditorResult,
} from '../bridge.js';

export interface GgraphicDomEditorProps {
  /** The brand pack. Import it in the `'use dom'` file: it does not need to cross the bridge. */
  brand: GgraphicEditorProps['brand'];
  /** The template pack to start with, as JSON (`loadTemplatePack`); a `load` command replaces it. */
  templates?: unknown;
  /** The design to start with; a `load` command replaces it. */
  document?: GgraphicDocument | null;
  /** The pending commands of `useGgraphicEditor` on the native side. */
  commands: readonly EditorCommand[];
  /** The `onEvent` of `useGgraphicEditor`. */
  onEvent: (event: EditorEvent) => unknown;
  locale?: GgraphicEditorProps['locale'];
  title?: string;
}

interface Opened {
  /** Bumped by every `load`: a new key remounts the editor, which reads its document on mount. */
  key: number;
  document: GgraphicDocument | undefined;
  templates: Promise<TemplatePack>;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function run(
  command: Exclude<EditorCommand, { type: 'load' }>,
  api: CanvasEditorExportApi
): Promise<string | null> {
  switch (command.type) {
    case 'exportPng': {
      const url = await api.captureActivePage({
        ...(command.pixelRatio === undefined ? {} : { pixelRatio: command.pixelRatio }),
        ...(command.transparent === undefined ? {} : { transparent: command.transparent }),
      });
      const png = url === null ? null : pngBase64(url);
      if (png === null) throw new Error('no page to export');
      return png;
    }
    case 'undo':
      api.undo();
      return null;
    case 'redo':
      api.redo();
      return null;
  }
}

export function GgraphicDomEditor({
  brand,
  templates,
  document,
  commands,
  onEvent,
  locale,
  title,
}: GgraphicDomEditorProps) {
  const [opened, setOpened] = useState<Opened>(() => ({
    key: 0,
    document: document ?? undefined,
    templates: loadTemplatePack(templates ?? []),
  }));
  // Set by the editor once it is mounted, emptied when a `load` remounts it.
  const [api, setApi] = useState<CanvasEditorExportApi | null>(null);
  const handled = useRef(new Set<number>());
  const emit = useRef(onEvent);
  useEffect(() => {
    emit.current = onEvent;
  });

  useEffect(() => {
    if (api) void emit.current({ type: 'ready' });
  }, [api]);

  useEffect(() => {
    const answer = (result: EditorResult) => void emit.current(result);
    for (const raw of commands) {
      const command = parseEditorCommand(raw);
      if (!command) {
        // Answer what carries an id, so the host's promise does not wait for its timeout.
        const id = (raw as { id?: unknown } | null)?.id;
        if (typeof id === 'number' && !handled.current.has(id)) {
          handled.current.add(id);
          answer({ type: 'result', id, ok: false, error: 'not a ggraphic editor command' });
        }
        continue;
      }
      if (handled.current.has(command.id)) continue;
      if (command.type === 'load') {
        handled.current.add(command.id);
        setApi(null);
        setOpened((prev) => ({
          key: prev.key + 1,
          document: command.document ?? undefined,
          templates:
            command.templates === undefined ? prev.templates : loadTemplatePack(command.templates),
        }));
        answer({ type: 'result', id: command.id, ok: true, value: null });
        continue;
      }
      // Everything else needs the mounted editor; it runs when `api` arrives.
      if (!api) continue;
      handled.current.add(command.id);
      run(command, api).then(
        (value) => answer({ type: 'result', id: command.id, ok: true, value }),
        (error: unknown) =>
          answer({ type: 'result', id: command.id, ok: false, error: message(error) })
      );
    }
  }, [commands, api]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <GgraphicEditor
        key={opened.key}
        brand={brand}
        templates={opened.templates}
        {...(opened.document ? { document: opened.document } : {})}
        onChange={(next) => void emit.current({ type: 'change', document: next })}
        exportApiRef={setApi}
        {...(locale ? { locale } : {})}
        {...(title ? { title } : {})}
      />
    </div>
  );
}
