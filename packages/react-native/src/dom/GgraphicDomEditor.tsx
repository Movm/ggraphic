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
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  MAX_PNG_BASE64,
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
  templates: TemplatePack | Promise<TemplatePack>;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const idOf = (raw: unknown): number | null => {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === 'number' && Number.isSafeInteger(id) ? id : null;
};

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
      if (png.length > MAX_PNG_BASE64) throw new Error('the PNG is too large for the bridge');
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

/** Catches what the editor throws (a broken template pack or design), so the bridge can say so. */
class Crash extends Component<{ onCrash: (error: unknown) => void; children: ReactNode }> {
  override state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.onCrash(error);
  }
  override render() {
    return this.state.crashed ? null : this.props.children;
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
  // What the editor threw; commands are answered with it until a `load` opens another design.
  const [crash, setCrash] = useState<string | null>(null);
  // A `load` is reading its template pack; the commands after it wait for the editor it opens.
  const [loading, setLoading] = useState(false);
  // Commands run in id order, each once: everything up to `done` has run or is running.
  const done = useRef(0);
  const emit = useRef(onEvent);
  useEffect(() => {
    emit.current = onEvent;
  });
  // In an Expo DOM component `onEvent` is a call into the app and returns a promise.
  const [send] = useState(() => (event: EditorEvent) => {
    Promise.resolve()
      .then(() => emit.current(event))
      .catch((error: unknown) => console.error('ggraphic: onEvent failed', error));
  });

  // Once per mount: the editor hands over a new api object whenever its handlers change.
  const mounted = api !== null;
  useEffect(() => {
    if (mounted) send({ type: 'ready' });
  }, [mounted, send]);

  useEffect(() => {
    if (loading) return;
    const answer = (result: EditorResult) => send(result);
    for (const raw of commands) {
      const id = idOf(raw);
      if (id === null || id <= done.current) continue;
      const command = parseEditorCommand(raw);
      if (!command) {
        // Answer what carries an id, so the host's promise does not wait for its timeout.
        done.current = id;
        answer({ type: 'result', id, ok: false, error: 'not a ggraphic editor command' });
        continue;
      }
      if (command.type === 'load') {
        done.current = id;
        setLoading(true);
        // A broken pack is answered here and leaves the open design as it is.
        const pack = command.templates === undefined ? null : loadTemplatePack(command.templates);
        Promise.resolve(pack)
          .then((next) => {
            setApi(null);
            setCrash(null);
            setOpened((prev) => ({
              key: prev.key + 1,
              document: command.document ?? undefined,
              templates: next ?? prev.templates,
            }));
            answer({ type: 'result', id, ok: true, value: null });
          })
          .catch((error: unknown) =>
            answer({ type: 'result', id, ok: false, error: message(error) })
          )
          .finally(() => setLoading(false));
        return;
      }
      if (crash !== null) {
        done.current = id;
        answer({ type: 'result', id, ok: false, error: crash });
        continue;
      }
      // The editor is (re)mounting; this and everything after it run when it is there.
      if (!api) return;
      done.current = id;
      run(command, api).then(
        (value) => answer({ type: 'result', id, ok: true, value }),
        (error: unknown) => answer({ type: 'result', id, ok: false, error: message(error) })
      );
    }
  }, [commands, api, crash, loading, send]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Crash key={opened.key} onCrash={(error) => setCrash(message(error))}>
        <GgraphicEditor
          key={opened.key}
          brand={brand}
          templates={opened.templates}
          {...(opened.document ? { document: opened.document } : {})}
          onChange={(next) => send({ type: 'change', document: next })}
          exportApiRef={setApi}
          {...(locale ? { locale } : {})}
          {...(title ? { title } : {})}
        />
      </Crash>
    </div>
  );
}
