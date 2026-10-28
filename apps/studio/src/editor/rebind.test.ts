// SPDX-License-Identifier: AGPL-3.0-only
import { normalizeColor } from '@ggraphic/core';
import { registerBrandPacks } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, describe, expect, it } from 'vitest';

import { studioBrand } from '../brand';

import { newDocument } from './document';
import { rebindStudioDocument } from './rebind';
import { HEADLINE_TEMPLATE_ID } from './templates/ids';

afterEach(() => registerBrandPacks([studioBrand]));

const NEW_PRIMARY = '#336699';
const orgBrand = {
  ...studioBrand,
  id: 'org-x',
  colors: { ...studioBrand.colors, primary: NEW_PRIMARY },
};

describe('rebindStudioDocument', () => {
  it('a seeded headline page follows a new org primary', () => {
    registerBrandPacks([studioBrand]);
    const doc = newDocument('post-portrait', HEADLINE_TEMPLATE_ID);
    const { doc: next, changed } = rebindStudioDocument(doc, { brand: orgBrand });
    expect(changed).toBe(true);
    const state = next.pages[0]!.state as { backgroundColor: string; brandStamp: string };
    expect(normalizeColor(state.backgroundColor)).toBe(NEW_PRIMARY);
    expect(state.brandStamp).not.toBe((doc.pages[0]!.state as { brandStamp: string }).brandStamp);
    // The input is not touched.
    expect(
      normalizeColor((doc.pages[0]!.state as { backgroundColor: string }).backgroundColor)
    ).not.toBe(NEW_PRIMARY);
  });

  it('a v1 document comes back unchanged', () => {
    const doc = {
      formatId: 'post-portrait',
      pages: [{ configId: 'blank', state: { backgroundColor: '#112233', additionalTexts: [] } }],
    };
    const result = rebindStudioDocument(doc, { brand: orgBrand });
    expect(result.changed).toBe(false);
    expect(result.doc).toBe(doc);
  });
});
