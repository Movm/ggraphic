// SPDX-License-Identifier: AGPL-3.0-only
import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import { describe, expect, it } from 'vitest';

import { newDocument, parseDocument, serializeDocument } from './document';
import { HEADLINE_TEMPLATE_ID } from './templates/ids';

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

  it('accepts v1 and v2 (migrated) and v3, and refuses v4', () => {
    const base = v1Fixture();
    expect(parseDocument({ ...base, schemaVersion: 1 }).kind).toBe('ok');
    expect(parseDocument({ ...base, schemaVersion: 2 }).kind).toBe('ok');
    expect(parseDocument({ ...base, schemaVersion: 3 }).kind).toBe('ok');
    expect(parseDocument({ ...base, schemaVersion: 4 })).toEqual({
      kind: 'refused',
      reason: 'newer',
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

describe('templates on the free page', () => {
  it('newDocument puts the template on the free page config', () => {
    const doc = newDocument('post-portrait', HEADLINE_TEMPLATE_ID);
    expect(doc.pages[0]!.configId).toBe('studio-blank');
    expect((doc.pages[0]!.state['templateRef'] as { id: string }).id).toBe('studio-headline');
  });

  it('an unknown template leaves the page blank', () => {
    const page = newDocument('post-portrait', 'studio-gone').pages[0]!;
    expect(page.configId).toBe('studio-blank');
    expect(page.state['templateRef']).toBeUndefined();
  });

  it('a document naming a missing template opens as a free page', () => {
    const stored = newDocument('post-portrait', HEADLINE_TEMPLATE_ID);
    stored.pages[0]!.configId = 'studio-legacy-gone';
    const parsed = parseDocument(stored);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.doc.pages[0]!.configId).toBe('studio-blank');
    expect(parsed.doc.pages[0]!.state['additionalTexts']).toEqual(
      stored.pages[0]!.state['additionalTexts']
    );
  });

  it('keeps the config of a legacy template page', () => {
    const stored = newDocument('post-portrait', HEADLINE_TEMPLATE_ID);
    stored.pages[0]!.configId = 'studio-headline';
    const parsed = parseDocument(stored);
    expect(parsed.kind === 'ok' && parsed.doc.pages[0]!.configId).toBe('studio-headline');
  });
});
