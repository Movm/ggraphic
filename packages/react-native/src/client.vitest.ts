// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseEditorCommand } from './bridge.js';
import { createEditorClient } from './client.js';

const doc = { formatId: 'post-portrait', pages: [] };

afterEach(() => {
  vi.useRealTimers();
});

describe('createEditorClient', () => {
  it('queues commands with growing ids, each one a valid command for the DOM side', () => {
    const client = createEditorClient();
    void client.undo();
    void client.exportPng({ pixelRatio: 2 });
    void client.load({ document: doc, templates: [] });
    const commands = client.getCommands();
    expect(commands.map((c) => [c.id, c.type])).toEqual([
      [1, 'undo'],
      [2, 'exportPng'],
      [3, 'load'],
    ]);
    for (const command of commands) expect(parseEditorCommand(command)).toEqual(command);
  });

  it('settles each promise by its result and drops the command from the queue', async () => {
    const client = createEditorClient();
    const listener = vi.fn();
    client.subscribe(listener);
    const png = client.exportPng();
    const undo = client.undo();
    client.handleEvent({ type: 'result', id: 2, ok: true, value: null });
    await expect(undo).resolves.toBeUndefined();
    expect(client.getCommands().map((c) => c.id)).toEqual([1]);
    client.handleEvent({ type: 'result', id: 1, ok: true, value: 'iVBO' });
    await expect(png).resolves.toBe('iVBO');
    expect(client.getCommands()).toEqual([]);
    // Two queued, two answered.
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('keeps the same array until the queue changes', () => {
    const client = createEditorClient();
    void client.redo();
    expect(client.getCommands()).toBe(client.getCommands());
  });

  it('rejects with the error the editor sent, and an export without an image', async () => {
    const client = createEditorClient();
    const failed = client.redo();
    const empty = client.exportPng();
    client.handleEvent({ type: 'result', id: 1, ok: false, error: 'nothing to redo' });
    client.handleEvent({ type: 'result', id: 2, ok: true, value: null });
    await expect(failed).rejects.toThrow('nothing to redo');
    await expect(empty).rejects.toThrow('sent no image');
  });

  it('passes ready and change on, and ignores what is not an event or answers nothing pending', () => {
    const onReady = vi.fn();
    const onChange = vi.fn();
    const client = createEditorClient({ onReady, onChange });
    client.handleEvent({ type: 'ready' });
    client.handleEvent({ type: 'change', document: doc });
    client.handleEvent({ type: 'change', document: 'not a document' });
    client.handleEvent({ type: 'result', id: 99, ok: true, value: null });
    client.handleEvent('garbage');
    expect(onReady).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(doc);
  });

  it('rejects an unanswered command after the timeout and ignores its late result', async () => {
    vi.useFakeTimers();
    const client = createEditorClient({ timeoutMs: 1000 });
    const undo = client.undo();
    const assertion = expect(undo).rejects.toThrow('did not answer "undo"');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(client.getCommands()).toEqual([]);
    client.handleEvent({ type: 'result', id: 1, ok: true, value: null });
    expect(client.getCommands()).toEqual([]);
  });

  it('cancelPending rejects what is pending and stays usable', async () => {
    const client = createEditorClient();
    const undo = client.undo();
    client.cancelPending();
    await expect(undo).rejects.toThrow('gone');
    expect(client.getCommands()).toEqual([]);
    const redo = client.redo();
    client.handleEvent({ type: 'result', id: 2, ok: true, value: null });
    await expect(redo).resolves.toBeUndefined();
  });
});
