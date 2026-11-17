// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';

import { contextPressSelection } from './deepSelect.js';

describe('contextPressSelection', () => {
  it('wählt das oberste Element, wenn nichts Ausgewähltes darunter liegt', () => {
    expect(contextPressSelection(['top', 'below'], ['other'])).toEqual(['top']);
  });

  it('lässt eine Mehrfachauswahl stehen, wenn eins ihrer Elemente getroffen ist', () => {
    expect(contextPressSelection(['b'], ['a', 'b'])).toBeNull();
  });

  it('lässt ein verdecktes, tief gewähltes Element ausgewählt', () => {
    expect(contextPressSelection(['cover', 'photo'], ['photo'])).toBeNull();
  });

  it('hebt die Auswahl auf leerer Fläche auf', () => {
    expect(contextPressSelection([], ['a'])).toEqual([]);
  });
});
