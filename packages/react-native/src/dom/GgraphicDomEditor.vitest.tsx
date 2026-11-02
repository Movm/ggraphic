// SPDX-License-Identifier: MPL-2.0
// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { Suspense, use, useImperativeHandle, useReducer, type Ref } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type EditorCommand, type EditorEvent } from '../bridge.js';

// A stand-in for the editor, inside a Suspense boundary like the real one: it exports a "PNG"
// that names the design it shows, counts undo, throws on a design called `crash`, and reads its
// template pack the way the editor does.
const undo = vi.hoisted(() => vi.fn());
// Hands the bridge a new api object without a remount, as the editor does when its handlers change.
const renewApi = vi.hoisted(() => ({ current: () => undefined as void }));
vi.mock('@ggraphic/editor', () => ({
  loadTemplatePack: (json: unknown) =>
    json === 'bad' ? Promise.reject(new Error('bad pack')) : Promise.resolve({ definitions: [] }),
  GgraphicEditor: (props: object) => (
    <Suspense fallback={null}>
      <FakeEditor {...(props as Parameters<typeof FakeEditor>[0])} />
    </Suspense>
  ),
}));

function FakeEditor({
  templates,
  document,
  exportApiRef,
}: {
  templates: unknown;
  document?: { formatId: string };
  exportApiRef: Ref<unknown>;
}) {
  if (templates instanceof Promise) use(templates);
  if (document?.formatId === 'crash') throw new Error('editor crashed');
  const [generation, renew] = useReducer((n: number) => n + 1, 0);
  renewApi.current = renew;
  useImperativeHandle(
    exportApiRef,
    () => ({
      captureActivePage: () =>
        Promise.resolve(`data:image/png;base64,${document?.formatId ?? 'blank'}`),
      undo,
      redo: () => undefined,
    }),
    [document, generation]
  );
  return null;
}

const { GgraphicDomEditor } = await import('./GgraphicDomEditor.js');

const design = (formatId: string) => ({ formatId, pages: [] });

async function mount(initial: ReturnType<typeof design> | null = null) {
  const events: EditorEvent[] = [];
  const onEvent = (event: EditorEvent) => void events.push(event);
  const view = (commands: EditorCommand[]) => (
    <GgraphicDomEditor
      brand={{} as never}
      document={initial}
      commands={commands}
      onEvent={onEvent}
    />
  );
  let rerender: (ui: ReturnType<typeof view>) => void = () => undefined;
  await act(async () => {
    rerender = render(view([])).rerender;
  });
  return {
    events,
    send: async (commands: EditorCommand[]) => {
      await act(async () => rerender(view(commands)));
      // The answers go out a microtask later; the template pack resolves before that.
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    },
    results: () => events.filter((event) => event.type === 'result'),
  };
}

afterEach(() => {
  cleanup();
  undo.mockClear();
});

describe('GgraphicDomEditor', () => {
  it('runs a command queued behind a load on the design the load opened', async () => {
    const editor = await mount(design('first'));
    await editor.send([
      { type: 'load', id: 1, document: design('second') },
      { type: 'exportPng', id: 2 },
    ]);
    expect(editor.results()).toEqual([
      { type: 'result', id: 1, ok: true, value: null },
      { type: 'result', id: 2, ok: true, value: 'second' },
    ]);
  });

  it('answers a load whose template pack fails and keeps the open design', async () => {
    const editor = await mount(design('first'));
    await editor.send([
      { type: 'load', id: 1, document: design('second'), templates: 'bad' },
      { type: 'exportPng', id: 2 },
    ]);
    expect(editor.results()).toEqual([
      { type: 'result', id: 1, ok: false, error: 'bad pack' },
      { type: 'result', id: 2, ok: true, value: 'first' },
    ]);
  });

  it('answers commands with the error once the editor crashed, until a load opens another', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const editor = await mount(design('crash'));
    await editor.send([{ type: 'undo', id: 1 }]);
    await editor.send([
      { type: 'load', id: 2, document: design('second') },
      { type: 'exportPng', id: 3 },
    ]);
    expect(editor.results()).toEqual([
      { type: 'result', id: 1, ok: false, error: 'editor crashed' },
      { type: 'result', id: 2, ok: true, value: null },
      { type: 'result', id: 3, ok: true, value: 'second' },
    ]);
    vi.mocked(console.error).mockRestore();
  });

  it('runs each command once, however often the queue arrives again', async () => {
    const editor = await mount(design('first'));
    const queue: EditorCommand[] = [{ type: 'undo', id: 1 }];
    await editor.send(queue);
    await editor.send([...queue]);
    await editor.send([...queue, { type: 'undo', id: 2 }]);
    expect(undo).toHaveBeenCalledTimes(2);
    expect(editor.results().map((result) => result.id)).toEqual([1, 2]);
  });

  it('says ready once per mount, not whenever the editor renews its api', async () => {
    const editor = await mount(design('first'));
    await act(async () => renewApi.current());
    await editor.send([]);
    expect(editor.events.filter((event) => event.type === 'ready')).toHaveLength(1);
    await editor.send([{ type: 'load', id: 1, document: design('second') }]);
    expect(editor.events.filter((event) => event.type === 'ready')).toHaveLength(2);
  });

  it('answers a malformed command that carries an id', async () => {
    const editor = await mount(design('first'));
    await editor.send([{ type: 'paint', id: 1 } as unknown as EditorCommand]);
    expect(editor.results()).toEqual([
      { type: 'result', id: 1, ok: false, error: 'not a ggraphic editor command' },
    ]);
  });
});
