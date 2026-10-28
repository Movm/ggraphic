// SPDX-License-Identifier: AGPL-3.0-only
import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import { describe, expect, it } from 'vitest';

import { newDocument, parseDocument, serializeDocument } from './document';

const v1Fixture = () => ({
  ...newDocument('post-portrait'),
});

describe('parseDocument', () => {
  it('parses a v1 project and round-trips it', () => {
    const fixture = v1Fixture();
    const parsed = parseDocument(fixture);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(serializeDocument(parsed.doc)).toEqual({
      ...fixture,
      schemaVersion: CANVAS_DOCUMENT_VERSION,
    });
  });

  it('refuses a newer document', () => {
    expect(parseDocument({ schemaVersion: 99, formatId: 'post-portrait', pages: [] })).toEqual({
      kind: 'refused',
      reason: 'newer',
    });
  });

  it('refuses a malformed envelope', () => {
    expect(parseDocument({ schemaVersion: 'x', pages: [] })).toEqual({
      kind: 'refused',
      reason: 'invalid',
    });
  });

  it('keeps formatId and unknown top-level keys through migrate', () => {
    const parsed = parseDocument({ ...v1Fixture(), formatId: 'slide-16-9', cover: { a: 1 } });
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.doc.formatId).toBe('slide-16-9');
    expect(parsed.doc['cover']).toEqual({ a: 1 });
    expect(serializeDocument(parsed.doc)['cover']).toEqual({ a: 1 });
  });
});
