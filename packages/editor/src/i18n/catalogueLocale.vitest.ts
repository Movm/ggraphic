// SPDX-License-Identifier: MPL-2.0
import { afterEach, describe, expect, it } from 'vitest';

import { formatDescription, formatLabel, getCanvasFormatOrDefault } from '../formats/index.js';
import { PLACEHOLDER_TEXT } from '../configs/placeholders.js';
import { photoCreditLine } from '../utils/photoCredit.js';
import { attributionLine } from '../utils/externalIcons.js';

import { messages, registerMessages } from './messages.js';

afterEach(() => registerMessages('de'));

const credit = {
  photographer: 'Ann',
  photoUrl: 'https://unsplash.com/photos/1',
  profileUrl: 'https://unsplash.com/@ann',
  instagramUsername: null,
} as never;
const icon = {
  kind: 'iconify',
  prefix: 'lets',
  name: 'tree',
  setTitle: 'Lets Icons',
  licence: 'CC-BY-4.0',
  author: 'Leonid',
} as never;

describe('the catalogue decides the language of texts that end up in posts and menus', () => {
  it('speaks German on a German host', () => {
    registerMessages('de');
    expect(photoCreditLine([credit])).toBe('Foto: Ann auf Unsplash');
    expect(attributionLine(icon)).toBe('Icon: Lets Icons von Leonid, CC-BY-4.0');
    expect(PLACEHOLDER_TEXT.headline).toBe('Ihre Überschrift hier');
    expect(formatLabel(getCanvasFormatOrDefault('slide-16-9'))).toBe('Präsentation');
    expect(formatDescription(getCanvasFormatOrDefault('slide-16-9'))).toContain('Folien');
  });

  it('speaks English on an English host', () => {
    registerMessages('en');
    expect(photoCreditLine([credit])).toBe('Photo: Ann on Unsplash');
    expect(attributionLine(icon)).toBe('Icon: Lets Icons by Leonid, CC-BY-4.0');
    expect(PLACEHOLDER_TEXT.headline).toBe('Your headline here');
    expect(formatLabel(getCanvasFormatOrDefault('slide-16-9'))).toBe('Presentation');
    expect(formatDescription(getCanvasFormatOrDefault('slide-16-9'))).toContain('Slides');
    expect(messages().common.elements(1)).toBe('1 element');
  });
});
