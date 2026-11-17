// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Guard: the editor's key lists and the key classes of `@ggraphic/core/ydoc` name the same keys.
 * The editor keeps its own lists because they carry types and action names the core does not
 * know; a key added on one side only would be stored in the wrong form, or not carried over to
 * a converted page.
 */
import { CANVAS_DOCUMENT_VERSION } from '@ggraphic/schema';
import {
  CORE_ELEMENT_COLLECTION_KEYS,
  ELEMENT_STORAGE_VERSION,
  ORDERED_ID_KEYS,
  RECORD_KEYS,
  stateKeyClasses,
} from '@ggraphic/core/ydoc';
import { beforeAll, describe, expect, it } from 'vitest';

import { CARRIED_INSTANCE_KEYS } from '../configs/factory/carryInstanceState.js';
import { registerStampKind, STAMP_KIND } from '../testing/stampKind.js';
import { ELEMENT_KINDS, hostElementKinds } from '../utils/elementKinds.js';

beforeAll(registerStampKind);

const sorted = (keys: Iterable<string>) => [...keys].sort();

describe('editor key lists against the core key classes', () => {
  it('ELEMENT_KINDS lives in the core collections plus selectedIcons', () => {
    expect(sorted(ELEMENT_KINDS.map((kind) => kind.stateKey))).toEqual(
      sorted([...CORE_ELEMENT_COLLECTION_KEYS, 'selectedIcons'])
    );
  });

  it('CARRIED_INSTANCE_KEYS is every classed core key plus the two background keys', () => {
    expect(sorted(CARRIED_INSTANCE_KEYS)).toEqual(
      sorted([
        ...CORE_ELEMENT_COLLECTION_KEYS,
        ...ORDERED_ID_KEYS,
        ...RECORD_KEYS,
        'backgroundImageAdjustments',
        'backgroundImageRotation',
      ])
    );
  });

  it('classes every registered host kind as a collection', () => {
    const hostKeys = hostElementKinds().map((kind) => kind.stateKey);
    expect(hostKeys).toContain(STAMP_KIND.stateKey);
    const classes = stateKeyClasses(hostKeys);
    for (const key of hostKeys) expect(classes.get(key)).toBe('elements');
  });

  it('binds ELEMENT_STORAGE_VERSION to CANVAS_DOCUMENT_VERSION', () => {
    // The editor writes structured page state and stamps the version it writes, so that version
    // must allow structure (rule 1 of "Version 4").
    expect(ELEMENT_STORAGE_VERSION).toBeLessThanOrEqual(CANVAS_DOCUMENT_VERSION);
  });
});
