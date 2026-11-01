// SPDX-License-Identifier: MPL-2.0
/**
 * Two neutral packs for the tests of the document brand: `PACK_A` is the
 * editor's default, `PACK_B` shares nothing with it a test could mistake for it
 * (colours, palette ids, marker, headline family). The registry is set to
 * `[PACK_A, PACK_B]`, so a document of `PACK_B` is "the other one" exactly as an
 * Austrian document is next to a German first pack in a host.
 */
import { brandDefault, type BrandPack } from '@ggraphic/core';

export const PACK_A: BrandPack = brandDefault;

export const PACK_B: BrandPack = {
  ...brandDefault,
  id: 'fixture-b',
  name: 'Fixture B',
  colors: {
    ...brandDefault.colors,
    primary: '#0B6E4F',
    secondary: '#C1121F',
    accent: '#F9A03F',
    accentOnLight: '#6A040F',
    attention: '#E01E37',
    surface: '#FEFAE0',
  },
  palette: [
    { id: 'moss', label: 'Moss', color: '#0B6E4F' },
    { id: 'berry', label: 'Berry', color: '#C1121F' },
    { id: 'amber', label: 'Amber', color: '#F9A03F' },
    { id: 'plum', label: 'Plum', color: '#6A040F' },
    { id: 'white', label: 'White', color: '#FFFFFF' },
  ],
  markers: {
    swatches: [
      { id: 'lemon', label: 'Lemon', color: '#FFE45E' },
      { id: 'white', label: 'White', color: '#FFFFFF' },
    ],
    ink: '#1A3D5C',
  },
  chart: ['#0B6E4F', '#C1121F', '#F9A03F', '#6A040F'],
  effects: {
    tints: ['#0B6E4F', '#C1121F'],
    shadows: ['#101010', '#0B6E4F'],
    outlines: ['#FFFFFF', '#101010'],
  },
  fonts: { ...brandDefault.fonts, headline: 'Fixture Display' },
};
