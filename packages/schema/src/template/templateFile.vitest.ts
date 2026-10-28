// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { CANVAS_DOCUMENT_VERSION } from '../document/migrations.js';
import { readTemplateFile, templateElementIds } from './templateFile.js';

type Raw = Record<string, unknown>;

const minimal = (): Raw => ({
  formatVersion: 1,
  id: 'plain-headline',
  version: 1,
  kind: 'template',
  family: 'headline',
  title: { en: 'Headline' },
  description: { en: 'A plain headline.' },
  tags: { occasions: [], topics: [] },
  formats: ['4:5'],
  schemes: ['primary'],
  schemaVersion: CANVAS_DOCUMENT_VERSION,
  pages: [
    {
      state: {
        texts: [{ id: 't1', text: 'Hello', bind: { fill: 'ink' } }],
      },
    },
  ],
  provenance: { author: 'test', reviewed: '2026-10-28', licence: 'CC0-1.0' },
});

const with_ = (patch: Raw): Raw => ({ ...minimal(), ...patch });

describe('readTemplateFile', () => {
  it('reads a minimal file', () => {
    const result = readTemplateFile(minimal());
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.migrated).toBe(false);
    expect(result.template.slots).toEqual({});
    expect(result.template.locks).toEqual([]);
  });

  it('refuses formatVersion 2 as newer/format', () => {
    expect(readTemplateFile(with_({ formatVersion: 2 }))).toEqual({
      status: 'newer',
      scope: 'format',
      version: 2,
    });
  });

  it('refuses a formatVersion that is not a positive int', () => {
    expect(readTemplateFile(with_({ formatVersion: 0 })).status).toBe('invalid');
    expect(readTemplateFile(with_({ formatVersion: '1' })).status).toBe('invalid');
  });

  it('refuses page schemaVersion 99 as newer/pages', () => {
    expect(readTemplateFile(with_({ schemaVersion: 99 }))).toEqual({
      status: 'newer',
      scope: 'pages',
      version: 99,
    });
  });

  it('lifts pages written at canvas version 1', () => {
    const result = readTemplateFile(with_({ schemaVersion: 1 }));
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.migrated).toBe(true);
    expect(result.template.schemaVersion).toBe(CANVAS_DOCUMENT_VERSION);
  });

  it('a slot naming a missing element is invalid and says which', () => {
    const result = readTemplateFile(
      with_({ slots: { ghost: { role: 'headline', budget: { maxWords: 5 } } } })
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('slots.ghost');
  });

  it('a slot on an existing element is ok', () => {
    const result = readTemplateFile(
      with_({ slots: { t1: { role: 'headline', budget: { maxWords: 5 } } } })
    );
    expect(result.status).toBe('ok');
  });

  it('a block naming a missing element is invalid', () => {
    const result = readTemplateFile(
      with_({ blocks: [{ id: 'b', title: { en: 'B' }, elementIds: ['nope'] }] })
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('blocks');
  });

  it('frames, locks, fixed and placeholders must name existing elements', () => {
    for (const patch of [
      { frames: { ghost: 'canvas' } },
      { locks: ['ghost'] },
      { fixed: { ghost: ['fill'] } },
      { placeholders: { en: { ghost: 'x' } } },
    ]) {
      const result = readTemplateFile(with_(patch));
      expect(result.status).toBe('invalid');
      if (result.status === 'invalid') expect(result.reason).toContain('ghost');
    }
  });

  it('a duplicate element id is invalid', () => {
    const result = readTemplateFile(
      with_({
        pages: [{ state: { texts: [{ id: 't1' }], shapes: [{ id: 't1' }] } }],
      })
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('t1');
  });

  it('an unknown top-level key is invalid', () => {
    expect(readTemplateFile(with_({ extra: 1 })).status).toBe('invalid');
  });

  it('two pages are invalid in format 1', () => {
    const page = { state: { texts: [{ id: 't1' }] } };
    expect(readTemplateFile(with_({ pages: [page, page] })).status).toBe('invalid');
  });

  it('title needs en', () => {
    expect(readTemplateFile(with_({ title: { de: 'Zitat' } })).status).toBe('invalid');
  });

  it('fixed may name the page', () => {
    expect(readTemplateFile(with_({ fixed: { page: ['backgroundColor'] } })).status).toBe('ok');
  });

  it('rejects bad slugs, duplicate formats and bad dates', () => {
    expect(readTemplateFile(with_({ id: 'Not A Slug' })).status).toBe('invalid');
    expect(readTemplateFile(with_({ formats: ['4:5', '4:5'] })).status).toBe('invalid');
    expect(readTemplateFile(with_({ formats: [] })).status).toBe('invalid');
    expect(
      readTemplateFile(
        with_({ provenance: { author: 'a', reviewed: '28.10.2026', licence: 'CC0-1.0' } })
      ).status
    ).toBe('invalid');
  });

  it('rejects a non-object', () => {
    expect(readTemplateFile(null).status).toBe('invalid');
  });
});

describe('templateElementIds', () => {
  it('lists array ids and record keys', () => {
    expect(
      templateElementIds({
        texts: [{ id: 'a' }, { id: 'b' }],
        images: { x: { src: '' }, y: {} },
        backgroundColor: '#fff',
        list: ['plain'],
      }).sort()
    ).toEqual(['a', 'b', 'x', 'y']);
  });
});
