// SPDX-License-Identifier: MPL-2.0
/**
 * The template keys of a page (`templateRef`, `groups`) go through the doors
 * a page key has: the persisted and emitted lists and the PPTX classification.
 * They are deliberately not inherited: they describe one page's origin and
 * its element groups, which a new page does not share.
 */
import { describe, expect, it } from 'vitest';

import { extractInheritablePageState } from '../configs/pageInheritance.js';
import { buildPptxModel } from '../export/pptx/buildPptxModel.js';

import { hostEmittedStateKeys, pagePersistedStateKeys } from './pageElementStateKeys.js';

const TEMPLATE_KEYS = ['templateRef', 'groups'] as const;

const templateState = () => ({
  templateRef: { id: 'studio-headline', version: 1 },
  groups: [{ id: 'g1', elementIds: ['a', 'b'] }],
});

describe("a page's templateRef and groups", () => {
  it('are persisted and emitted back to the host', () => {
    expect(pagePersistedStateKeys()).toEqual(expect.arrayContaining([...TEMPLATE_KEYS]));
    expect(hostEmittedStateKeys()).toEqual(expect.arrayContaining([...TEMPLATE_KEYS]));
  });

  it('an added page does not inherit templateRef or groups', () => {
    const inherited = extractInheritablePageState(templateState());
    for (const key of TEMPLATE_KEYS) expect(inherited).not.toHaveProperty(key);
  });

  it('pptx export reports no unknown keys for templateRef and groups', () => {
    const slide = buildPptxModel([templateState() as never], { width: 100, height: 200 } as never)
      .slides[0]!;
    expect(slide.unknownKeys).toEqual([]);
  });
});
