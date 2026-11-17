// SPDX-License-Identifier: AGPL-3.0-only
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BINDABLE_FIELDS, EXEMPT_FIELDS, type Exempt } from './bindableFields.js';
import { pagePersistedStateKeys } from '../collab/pageElementStateKeys.js';
import { type ShapeInstance } from '../utils/shapes.js';
import { CATALOG, defaults, registerAssetCatalog, type Fields } from '../templates/testKinds.js';

const COLOUR = /^#|^rgba?\(/;

describe('bindable fields', () => {
  let kinds: Record<string, Fields[]>;
  beforeAll(async () => {
    registerAssetCatalog(CATALOG);
    kinds = await defaults();
  });
  afterAll(() => {
    registerAssetCatalog({ assets: [], isInstanceSrc: () => false });
    delete (globalThis as { Image?: unknown }).Image;
  });

  it('every colour or font field of every kind is bindable or exempt', () => {
    const unlisted: string[] = [];
    for (const [stateKey, instances] of Object.entries(kinds)) {
      const known = new Set([
        ...(BINDABLE_FIELDS[stateKey] ?? []),
        ...Object.keys(EXEMPT_FIELDS[stateKey] ?? {}),
      ]);
      for (const instance of instances) {
        for (const [field, value] of Object.entries(instance)) {
          const isColour = typeof value === 'string' && COLOUR.test(value);
          if ((isColour || field === 'fontFamily') && !known.has(field)) {
            unlisted.push(`${stateKey}.${field}`);
          }
        }
      }
    }
    expect([...new Set(unlisted)]).toEqual([]);
  });

  it('lists a kind only if the editor has it', () => {
    const known = new Set([...Object.keys(kinds), 'assetInstances', 'page']);
    for (const stateKey of [...Object.keys(BINDABLE_FIELDS), ...Object.keys(EXEMPT_FIELDS)]) {
      expect(known, stateKey).toContain(stateKey);
    }
  });

  it('never lists a field as both bindable and exempt', () => {
    for (const [stateKey, exempt] of Object.entries(EXEMPT_FIELDS)) {
      for (const field of Object.keys(exempt)) {
        expect(BINDABLE_FIELDS[stateKey] ?? [], `${stateKey}.${field}`).not.toContain(field);
      }
    }
  });

  it('lists only page fields the page state persists', () => {
    const persisted = pagePersistedStateKeys();
    expect(BINDABLE_FIELDS['page']!.filter((field) => !persisted.includes(field))).toEqual([]);
  });

  it('a dead exempt entry does not type-check', () => {
    // @ts-expect-error `noSuchField` is not a field of a shape
    const dead: Exempt<ShapeInstance> = { noSuchField: 'x' };
    expect(Object.keys(dead)).toEqual(['noSuchField']);
  });
});
