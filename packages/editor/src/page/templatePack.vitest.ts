// SPDX-License-Identifier: AGPL-3.0-only
import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import { describe, expect, it } from 'vitest';

import { templatePackFromJson } from './templatePack.js';

type Raw = Record<string, unknown>;

const file = (patch: Raw = {}): Raw => ({
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
  slots: { headline: { role: 'headline', budget: { maxLines: 2 } } },
  pages: [
    {
      state: {
        additionalTexts: [
          {
            id: 'headline',
            type: 'header',
            text: 'Hello',
            x: 0.1,
            y: 0.3,
            width: 0.8,
            fontSize: 0.08,
            fontFamily: '',
            fill: '#ffffff',
            bind: { fill: 'ink', fontFamily: 'font.headline' },
          },
        ],
      },
    },
  ],
  provenance: { author: 'test', reviewed: '2026-11-01', licence: 'CC0-1.0' },
  ...patch,
});

describe('templatePackFromJson', () => {
  it('turns each template file into an editor template under its id', async () => {
    const pack = templatePackFromJson([file()]);
    expect(pack.problems).toEqual([]);
    expect(pack.templates.map((t) => t.id)).toEqual(['plain-headline']);
    expect(pack.definitions.map((d) => d.id)).toEqual(['plain-headline']);

    const config = await pack.definitions[0]!.load('post-portrait');
    expect(config.id).toBe('plain-headline');
    const page = config.createInitialState({});
    expect(page.additionalTexts.map((t) => t.id)).toEqual(['headline']);
    expect(page.templateRef).toEqual({ id: 'plain-headline', version: 1 });
    expect(page.layerOrder).toContain('headline');
  });

  it('keeps what a saved page holds instead of seeding it again', async () => {
    const config = await templatePackFromJson(file()).definitions[0]!.load('post-portrait');
    expect(config.createInitialState({ additionalTexts: [] }).additionalTexts).toEqual([]);
  });

  it('leaves a page on a format the template does not declare empty', async () => {
    const config = await templatePackFromJson([file()]).definitions[0]!.load('slide-16-9');
    expect(config.createInitialState({}).additionalTexts).toEqual([]);
  });

  it('looks its templates up by id, for slot budgets', () => {
    const pack = templatePackFromJson([file()]);
    expect(pack.templateOf('plain-headline')?.slots['headline']?.budget).toEqual({ maxLines: 2 });
    expect(pack.templateOf('other')).toBeNull();
  });

  it('reports and skips files that do not read, are newer, or repeat an id', () => {
    const pack = templatePackFromJson([
      file(),
      file({ formatVersion: 2, id: 'future' }),
      file({ title: 7, id: 'broken' }),
      file(),
      'not a file',
    ]);
    expect(pack.templates.map((t) => t.id)).toEqual(['plain-headline']);
    expect(pack.problems.map((p) => p.id)).toEqual(['future', 'broken', 'plain-headline', null]);
    expect(pack.problems[0]!.reason).toMatch(/newer/);
    expect(pack.problems[2]!.reason).toMatch(/duplicate/);
  });

  it('leaves blocks out: they are not pages', () => {
    const pack = templatePackFromJson([file({ kind: 'block', id: 'a-block' })]);
    expect(pack.templates).toEqual([]);
    expect(pack.definitions).toEqual([]);
    expect(pack.problems).toEqual([]);
  });
});
