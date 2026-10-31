// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import {
  CANVAS_DOCUMENT_VERSION,
  registerStateKeyMigrations,
  documentMigrations,
} from '../document/migrations.js';
import {
  TEMPLATE_FORMAT_MIGRATIONS,
  TEMPLATE_FORMAT_VERSION,
  readTemplateFile,
  templateElementIds,
} from './templateFile.js';

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

  it('a slot key outside the offer-id pattern is invalid, even on a record entry', () => {
    // `iconStates` keys are element ids too, but not held to the pattern as elements.
    const state = { iconStates: { Icon_1: { x: 0.5, y: 0.5 } }, texts: [] };
    const result = readTemplateFile(
      with_({
        pages: [{ state }],
        slots: { Icon_1: { role: 'headline', budget: { maxWords: 5 } } },
      })
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('slots.Icon_1');
    // Without the slot the same file reads.
    expect(readTemplateFile(with_({ pages: [{ state }] })).status).toBe('ok');
  });

  it.each(['normal', 'italic', 'bold', 'bold italic'])('accepts fontStyle "%s"', (fontStyle) => {
    const state = { texts: [{ id: 't1', text: 'Hello', fontStyle, bind: { fill: 'ink' } }] };
    expect(readTemplateFile(with_({ pages: [{ state }] })).status).toBe('ok');
  });

  it.each(['800', '600 italic', 'Bold', 'heavy', 5])('rejects fontStyle %j', (fontStyle) => {
    const state = { texts: [{ id: 't1', text: 'Hello', fontStyle, bind: { fill: 'ink' } }] };
    const result = readTemplateFile(with_({ pages: [{ state }] }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('fontStyle');
  });

  it.each([100, 400, 800, 900])('accepts fontWeight %d', (fontWeight) => {
    const state = { texts: [{ id: 't1', text: 'Hello', fontWeight, bind: { fill: 'ink' } }] };
    expect(readTemplateFile(with_({ pages: [{ state }] })).status).toBe('ok');
  });

  it.each([0, 450, 1000, '800'])('rejects fontWeight %j', (fontWeight) => {
    const state = { texts: [{ id: 't1', text: 'Hello', fontWeight, bind: { fill: 'ink' } }] };
    const result = readTemplateFile(with_({ pages: [{ state }] }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('fontWeight');
  });

  it.each([-0.1, 0, 0.08, 0.3])('accepts letterSpacing %d', (letterSpacing) => {
    const state = { texts: [{ id: 't1', text: 'Hello', letterSpacing, bind: { fill: 'ink' } }] };
    expect(readTemplateFile(with_({ pages: [{ state }] })).status).toBe('ok');
  });

  it.each([-0.2, 0.31, 12, '0.1', null])('rejects letterSpacing %j', (letterSpacing) => {
    const state = { texts: [{ id: 't1', text: 'Hello', letterSpacing, bind: { fill: 'ink' } }] };
    const result = readTemplateFile(with_({ pages: [{ state }] }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('letterSpacing');
  });

  it('accepts a maxFontSize at or above fontSize', () => {
    for (const maxFontSize of [60, 84]) {
      const state = { texts: [{ id: 't1', text: 'Hi', fontSize: 60, maxFontSize }] };
      expect(readTemplateFile(with_({ pages: [{ state }] })).status).toBe('ok');
    }
  });

  it.each([59, 0, -4, '84', null])('rejects maxFontSize %j (fontSize 60)', (maxFontSize) => {
    const state = { texts: [{ id: 't1', text: 'Hi', fontSize: 60, maxFontSize }] };
    const result = readTemplateFile(with_({ pages: [{ state }] }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('maxFontSize');
  });

  it('accepts a decorative text, and one that is not decorative', () => {
    for (const decorative of [true, undefined]) {
      const state = { texts: [{ id: 'ghost', text: '5', opacity: 0.15, decorative }] };
      expect(readTemplateFile(with_({ pages: [{ state }] })).status).toBe('ok');
    }
  });

  it.each([false, 1, 'true', null])('rejects decorative %j', (decorative) => {
    const state = { texts: [{ id: 'ghost', text: '5', decorative }] };
    const result = readTemplateFile(with_({ pages: [{ state }] }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('decorative');
  });

  it('rejects a slot on a decorative text: the AI fills slots, a ghost is no content', () => {
    const state = { texts: [{ id: 'ghost', text: '5', decorative: true }] };
    const result = readTemplateFile(
      with_({ pages: [{ state }], slots: { ghost: { role: 'headline', budget: { maxWords: 1 } } } })
    );
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('slots.ghost');
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

  it('an element id the AI offer cannot carry is invalid', () => {
    for (const id of ['Head_1', 'a b', 'x'.repeat(65)]) {
      const result = readTemplateFile(with_({ pages: [{ state: { texts: [{ id }] } }] }));
      expect(result.status, id).toBe('invalid');
    }
    expect(
      readTemplateFile(with_({ pages: [{ state: { texts: [{ id: 'head-1' }] } }] })).status
    ).toBe('ok');
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

describe('bounds and rules', () => {
  const slot = (budget: Raw) => ({ t1: { role: 'headline', budget } });
  it('bounds slot budgets', () => {
    for (const budget of [
      { maxWords: 0 },
      { maxWords: 201 },
      { maxLines: 21 },
      { maxChars: 2001 },
    ]) {
      expect(readTemplateFile(with_({ slots: slot(budget) })).status).toBe('invalid');
    }
  });
  it('allows 12 tags and refuses 13', () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);
    expect(readTemplateFile(with_({ tags: { occasions: tags(12), topics: [] } })).status).toBe(
      'ok'
    );
    expect(readTemplateFile(with_({ tags: { occasions: tags(13), topics: [] } })).status).toBe(
      'invalid'
    );
  });
  it('refuses unknown nested keys', () => {
    expect(readTemplateFile(with_({ tags: { occasions: [], topics: [], x: 1 } })).status).toBe(
      'invalid'
    );
    expect(
      readTemplateFile(with_({ slots: { t1: { role: 'headline', budget: {}, extra: 1 } } })).status
    ).toBe('invalid');
    expect(
      readTemplateFile(
        with_({ provenance: { author: 'a', reviewed: '2026-10-28', licence: 'x', y: 1 } })
      ).status
    ).toBe('invalid');
  });
  it('refuses an unreal date, huge versions and long text', () => {
    const prov = (p: Raw) => ({ author: 'a', reviewed: '2026-10-28', licence: 'x', ...p });
    expect(readTemplateFile(with_({ provenance: prov({ reviewed: '2026-02-31' }) })).status).toBe(
      'invalid'
    );
    expect(readTemplateFile(with_({ provenance: prov({ author: 'a'.repeat(201) }) })).status).toBe(
      'invalid'
    );
    expect(readTemplateFile(with_({ version: 10001 })).status).toBe('invalid');
    expect(readTemplateFile(with_({ placeholders: { en: { t1: 'x'.repeat(161) } } })).status).toBe(
      'invalid'
    );
  });
  it('refuses the element id "page"', () => {
    const result = readTemplateFile(with_({ pages: [{ state: { texts: [{ id: 'page' }] } }] }));
    expect(result.status).toBe('invalid');
  });
  it('refuses a non-string element id', () => {
    expect(readTemplateFile(with_({ pages: [{ state: { texts: [{ id: 5 }] } }] })).status).toBe(
      'invalid'
    );
  });
  it('refuses a field that is both fixed and bound', () => {
    const result = readTemplateFile(with_({ fixed: { t1: ['fill'] } }));
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('fixed.t1');
  });
  it('refuses duplicate block ids and an element in two blocks', () => {
    const block = (id: string) => ({ id, title: { en: 'B' }, elementIds: ['t1'] });
    expect(readTemplateFile(with_({ blocks: [block('a'), block('a')] })).status).toBe('invalid');
    const two = readTemplateFile(with_({ blocks: [block('a'), block('b')] }));
    expect(two.status).toBe('invalid');
    if (two.status === 'invalid') expect(two.reason).toContain('already in block');
  });
  it('refuses a newer per-kind version as newer/pages', () => {
    registerStateKeyMigrations('texts', []);
    try {
      expect(readTemplateFile(with_({ kindVersions: { texts: 4 } }))).toEqual({
        status: 'newer',
        scope: 'pages',
        version: 4,
      });
    } finally {
      documentMigrations.unregisterStateKey('texts');
    }
  });
  it('keeps kindVersions when pages are lifted', () => {
    registerStateKeyMigrations('texts', []);
    try {
      const result = readTemplateFile(with_({ schemaVersion: 1, kindVersions: { texts: 1 } }));
      expect(result.status).toBe('ok');
      if (result.status !== 'ok') return;
      expect(result.migrated).toBe(true);
      expect(result.template.kindVersions).toEqual({ texts: 1 });
    } finally {
      documentMigrations.unregisterStateKey('texts');
    }
  });
});

describe('format steps', () => {
  const step = {
    from: 1,
    migrate: (f: Raw): Raw => ({ ...f, formatVersion: 2, family: 'lifted' }),
  };
  it('ships none, and the version agrees', () => {
    expect(TEMPLATE_FORMAT_MIGRATIONS.length + 1).toBe(TEMPLATE_FORMAT_VERSION);
  });
  it('runs an injected 1 to 2 step and reports migrated', () => {
    const result = readTemplateFile(minimal(), [step]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.migrated).toBe(true);
    expect(result.template.family).toBe('lifted');
  });
  it('treats format 2 as newer when no step exists', () => {
    expect(readTemplateFile(with_({ formatVersion: 3 }), [step]).status).toBe('newer');
  });
  it('turns a throwing step into invalid', () => {
    const boom = {
      from: 1,
      migrate: (): Raw => {
        throw new Error('boom');
      },
    };
    const result = readTemplateFile(minimal(), [boom]);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') expect(result.reason).toContain('boom');
  });
  it('refuses non-contiguous steps and a step that misses the version', () => {
    expect(readTemplateFile(minimal(), [{ ...step, from: 2 }]).status).toBe('invalid');
    expect(readTemplateFile(minimal(), [{ from: 1, migrate: (f) => f }]).status).toBe('invalid');
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
