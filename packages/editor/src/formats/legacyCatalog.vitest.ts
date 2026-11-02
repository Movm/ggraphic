// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest';

import {
  CANVAS_FORMATS,
  getCanvasFormatOrDefault,
  isPrintFormat,
  registerCanvasFormatGroups,
  registerCanvasFormats,
  UnsupportedCanvasFormatError,
} from './index.js';
import { LEGACY_CANVAS_FORMAT_GROUPS, LEGACY_CANVAS_FORMATS } from './legacyCatalog.js';

/** Every id built in up to 0.1.0-alpha.1. Documents store these, so they must keep resolving. */
const ALPHA_1_IDS = [
  'post-portrait',
  'post-portrait-tall',
  'profile-square',
  'slide-16-9',
  'print-visitenkarte-quer',
  'print-visitenkarte-hoch',
  'print-a3-hoch',
  'print-a4-hoch',
  'print-a3-quer',
  'print-a1-hoch',
  'print-a1-quer',
  'print-grossflaeche',
  'print-citylight',
  'print-flyer-dinlang',
  'print-a6-hoch',
  'print-a6-quer',
  'print-briefbogen-a4',
  'print-zeitung-a4',
];

afterEach(() => {
  registerCanvasFormats([]);
  registerCanvasFormatGroups([]);
});

describe('the legacy catalogue', () => {
  it('together with the built-ins covers every alpha.1 id exactly once', () => {
    const ids = [...CANVAS_FORMATS, ...LEGACY_CANVAS_FORMATS].map((f) => f.id);
    expect([...ids].sort()).toEqual([...ALPHA_1_IDS].sort());
  });

  it('without it a stored print id is refused, not drawn as 4:5', () => {
    expect(() => getCanvasFormatOrDefault('print-briefbogen-a4')).toThrow(
      UnsupportedCanvasFormatError
    );
  });

  it('registered by the host, every stored id resolves to itself again', () => {
    registerCanvasFormatGroups(LEGACY_CANVAS_FORMAT_GROUPS);
    registerCanvasFormats(LEGACY_CANVAS_FORMATS);
    for (const id of ALPHA_1_IDS) expect(getCanvasFormatOrDefault(id).id).toBe(id);
    expect(isPrintFormat(getCanvasFormatOrDefault('print-zeitung-a4'))).toBe(true);
  });
});
