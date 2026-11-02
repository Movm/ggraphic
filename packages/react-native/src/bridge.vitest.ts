// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { isGgraphicDocument, parseEditorCommand, parseEditorEvent, pngBase64 } from './bridge.js';

const doc = { formatId: 'post-portrait', pages: [{ configId: 'studio-blank', state: { a: 1 } }] };

describe('parseEditorCommand', () => {
  it('reads every command type', () => {
    expect(parseEditorCommand({ id: 1, type: 'load', document: doc, templates: [{}] })).toEqual({
      id: 1,
      type: 'load',
      document: doc,
      templates: [{}],
    });
    expect(parseEditorCommand({ id: 2, type: 'load', document: null })).toEqual({
      id: 2,
      type: 'load',
      document: null,
    });
    expect(parseEditorCommand({ id: 3, type: 'load' })).toEqual({ id: 3, type: 'load' });
    expect(
      parseEditorCommand({ id: 4, type: 'exportPng', pixelRatio: 2, transparent: true })
    ).toEqual({ id: 4, type: 'exportPng', pixelRatio: 2, transparent: true });
    expect(parseEditorCommand({ id: 5, type: 'undo' })).toEqual({ id: 5, type: 'undo' });
    expect(parseEditorCommand({ id: 6, type: 'redo', extra: 'dropped' })).toEqual({
      id: 6,
      type: 'redo',
    });
  });

  it('rejects what is not a command', () => {
    for (const value of [
      null,
      'undo',
      [],
      { type: 'undo' },
      { id: 0, type: 'undo' },
      { id: 1.5, type: 'undo' },
      { id: '1', type: 'undo' },
      { id: 1, type: 'print' },
      { id: 1, type: 'load', document: { formatId: 'x' } },
      { id: 1, type: 'exportPng', pixelRatio: 0 },
      { id: 1, type: 'exportPng', pixelRatio: Number.NaN },
      { id: 1, type: 'exportPng', transparent: 'yes' },
    ]) {
      expect(parseEditorCommand(value)).toBeNull();
    }
  });
});

describe('parseEditorEvent', () => {
  it('reads ready, change and both kinds of result', () => {
    expect(parseEditorEvent({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseEditorEvent({ type: 'change', document: doc })).toEqual({
      type: 'change',
      document: doc,
    });
    expect(parseEditorEvent({ type: 'result', id: 3, ok: true, value: 'iVBO' })).toEqual({
      type: 'result',
      id: 3,
      ok: true,
      value: 'iVBO',
    });
    expect(parseEditorEvent({ type: 'result', id: 3, ok: true, value: null })).toEqual({
      type: 'result',
      id: 3,
      ok: true,
      value: null,
    });
    expect(parseEditorEvent({ type: 'result', id: 3, ok: false, error: 'no page' })).toEqual({
      type: 'result',
      id: 3,
      ok: false,
      error: 'no page',
    });
  });

  it('rejects what is not an event', () => {
    for (const value of [
      undefined,
      { type: 'change' },
      { type: 'change', document: { formatId: 'x', pages: [{ configId: 1, state: {} }] } },
      { type: 'result', ok: true, value: 'x' },
      { type: 'result', id: 1, value: 'x' },
      { type: 'result', id: 1, ok: true },
      { type: 'result', id: 1, ok: false },
      { type: 'saved' },
    ]) {
      expect(parseEditorEvent(value)).toBeNull();
    }
  });
});

describe('isGgraphicDocument', () => {
  it('needs a format and pages with a config and a state object', () => {
    expect(isGgraphicDocument(doc)).toBe(true);
    expect(isGgraphicDocument({ formatId: 'x', pages: [] })).toBe(true);
    expect(isGgraphicDocument({ formatId: 'x', pages: [{ configId: 'c', state: [] }] })).toBe(
      false
    );
    expect(isGgraphicDocument({ pages: [] })).toBe(false);
  });
});

describe('pngBase64', () => {
  it('strips the PNG data URL prefix and refuses anything else', () => {
    expect(pngBase64('data:image/png;base64,iVBORw0KGgo=')).toBe('iVBORw0KGgo=');
    expect(pngBase64('data:image/png;base64,')).toBeNull();
    expect(pngBase64('data:image/jpeg;base64,/9j/')).toBeNull();
  });
});
