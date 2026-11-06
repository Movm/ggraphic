// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it } from 'vitest';

import { documentFontFaces } from './fontFiles.js';

const families = () =>
  [...documentFontFaces()].map((rule) =>
    rule.style.getPropertyValue('font-family').replace(/['"]/g, '')
  );

function addSheet(css: string): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  return style;
}

describe('documentFontFaces', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('finds @font-face rules at the top level and inside grouping rules, across sheets', () => {
    addSheet(
      '@font-face { font-family: "A"; } @media screen { @font-face { font-family: "B"; } } p { color: red; }'
    );
    addSheet('@supports (display: grid) { @font-face { font-family: "C"; } }');
    expect(families()).toEqual(['A', 'B', 'C']);
  });

  it('skips a sheet the browser will not let us read', () => {
    const hidden = addSheet('@font-face { font-family: "Hidden"; }');
    Object.defineProperty(hidden.sheet!, 'cssRules', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    addSheet('@font-face { font-family: "Seen"; }');
    expect(families()).toEqual(['Seen']);
  });

  it('is empty for a document without style sheets', () => {
    expect(families()).toEqual([]);
  });
});
