// SPDX-License-Identifier: AGPL-3.0-only
import { brandDefault, type BrandPack } from '@ggraphic/core';

// Studio's own look: wine red as the ground, magenta as the accent, white and a blush
// white as the light surfaces. Fonts and layout parameters stay those of brandDefault.
const WINE = '#6B1632';
const WINE_DEEP = '#4A0E22';
const MAGENTA = '#D4146E';
const ROSE = '#FF7AB6';
const BLUSH = '#FDF0F5';
const CRIMSON = '#C8102E';
const WHITE = '#FFFFFF';
const BLACK = '#000000';

export const studioBrand: BrandPack = {
  ...brandDefault,
  id: 'studio',
  name: 'ggraphic Studio',
  colors: {
    primary: WINE,
    secondary: MAGENTA,
    accent: ROSE,
    accentOnLight: MAGENTA,
    attention: CRIMSON,
    textOnDark: WHITE,
    textOnLight: WINE,
    surface: BLUSH,
  },
  backgrounds: [
    { id: 'wine', label: 'Wine', color: WINE, ink: WHITE },
    { id: 'magenta', label: 'Magenta', color: MAGENTA, ink: WHITE },
    { id: 'blush', label: 'Blush', color: BLUSH, ink: WINE },
    { id: 'white', label: 'White', color: WHITE, ink: WINE },
  ],
  defaultBackground: WINE,
  palette: [
    { id: 'wine', label: 'Wine', color: WINE },
    { id: 'wine-deep', label: 'Deep wine', color: WINE_DEEP },
    { id: 'magenta', label: 'Magenta', color: MAGENTA },
    { id: 'rose', label: 'Rose', color: ROSE },
    { id: 'blush', label: 'Blush', color: BLUSH },
    { id: 'white', label: 'White', color: WHITE },
    { id: 'black', label: 'Black', color: BLACK },
  ],
  textPalette: [
    { id: 'white', label: 'White', color: WHITE },
    { id: 'wine', label: 'Wine', color: WINE },
    { id: 'magenta', label: 'Magenta', color: MAGENTA },
    { id: 'black', label: 'Black', color: BLACK },
  ],
  markers: {
    swatches: [
      { id: 'rose', label: 'Rose', color: ROSE },
      { id: 'blush', label: 'Blush', color: BLUSH },
      { id: 'white', label: 'White', color: WHITE },
    ],
    ink: WINE,
  },
  chart: [WINE, MAGENTA, ROSE, '#9E3358', WINE_DEEP],
  effects: {
    tints: [WINE, MAGENTA, ROSE, WINE_DEEP],
    shadows: [BLACK, WINE_DEEP, WINE, '#33041A'],
    outlines: [WHITE, BLACK, WINE, MAGENTA],
  },
};
