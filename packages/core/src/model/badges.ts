// SPDX-License-Identifier: MPL-2.0
/**
 * Circle and pill badges.
 */
import { type Bindings } from '../brand/bindings.js';

export interface CircleBadgeTextLine {
  text: string;
  yOffset: number;
  fontFamily: string;
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
}

export interface CircleBadgeInstance {
  id: string;
  /** Fields that follow a brand role; see `brand/bindings`. */
  bind?: Bindings;
  x: number;
  y: number;
  radius: number;
  backgroundColor: string;
  textColor: string;
  rotation: number;
  scale: number;
  opacity?: number;
  textLines: CircleBadgeTextLine[];
  /**
   * The badge's outline: a circle (absent), a jagged burst inside `radius`,
   * or an ellipse wider than `radius` and flatter. Stored, so never renamed.
   */
  outline?: 'circle' | 'burst' | 'ellipse';
}

export type PillBadgeFontStyle = 'normal' | 'italic' | 'bold' | 'bold italic';

export interface PillBadgeInstance {
  id: string;
  /** Fields that follow a brand role; see `brand/bindings`. */
  bind?: Bindings;
  text: string;
  x: number;
  y: number;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: PillBadgeFontStyle;
  rotation: number;
  scale: number;
  opacity: number;
  paddingX: number;
  paddingY: number;
  cornerRadius: number;
}
