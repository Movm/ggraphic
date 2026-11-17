// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Illustrations: Kawaii figures and SVG sets.
 */
import { type Bindings } from '../brand/bindings.js';

// React Kawaii types
export type KawaiiMood = 'sad' | 'shocked' | 'happy' | 'blissful' | 'lovestruck' | 'excited' | 'ko';

export type KawaiiIllustrationType =
  | 'planet'
  | 'cat'
  | 'ghost'
  | 'iceCream'
  | 'browser'
  | 'mug'
  | 'speechBubble'
  | 'backpack'
  | 'creditCard'
  | 'file'
  | 'folder';

/**
 * The SVG illustration sets, by name. A host that ships a set of its own adds
 * it here, so documents and catalogues that name it typecheck:
 *
 * ```ts
 * declare module '@ggraphic/core' {
 *   interface SvgSources {
 *     mine: true;
 *   }
 * }
 * ```
 */
export interface SvgSources {
  opendoodles: true;
  illlustrations: true;
  gophers: true;
  transhumans: true;
  humaaans: true;
  openpeeps: true;
}

export type SvgSource = keyof SvgSources;

export interface KawaiiInstance {
  id: string;
  /** Fields that follow a brand role; see `brand/bindings`. */
  bind?: Bindings;
  illustrationId: KawaiiIllustrationType;
  source: 'kawaii';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color: string;
  opacity: number;
  mood: KawaiiMood;
  flipX?: boolean;
  flipY?: boolean;
}

export interface SvgInstance {
  id: string;
  /** Fields that follow a brand role; see `brand/bindings`. */
  bind?: Bindings;
  illustrationId: string;
  source: SvgSource;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  color?: string;
  flipX?: boolean;
  flipY?: boolean;
}

export type IllustrationInstance = KawaiiInstance | SvgInstance;
