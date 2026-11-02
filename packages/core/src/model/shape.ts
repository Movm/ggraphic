// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shapes on the page. The centre is (x, y).
 */
import { type Bindings } from '../brand/bindings.js';
import { type PlateHug } from '../templates/hug.js';
import { type CornerRadius } from './cornerRadius.js';
import { type GradientFill } from './fill.js';

export type ShapeType =
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'heart'
  | 'cloud'
  | 'hexagon'
  | 'pentagon'
  | 'diamond'
  | 'ellipse'
  | 'rounded-rect'
  | 'ring'
  | 'chevron'
  | 'double-arrow'
  | 'wavy'
  | 'speech-round'
  | 'speech-rect'
  | 'sparkle'
  | 'checkmark'
  | 'blob'
  | 'leaf'
  | 'line'
  | 'line-thick'
  | 'line-dashed'
  | 'line-dotted'
  | 'line-double'
  | 'line-arrow'
  | 'speech-cloud'
  | 'speech-pointed'
  | 'cloud-fluffy'
  | 'cloud-puff'
  | 'cloud-thin'
  | 'heart-broken'
  | 'heart-double'
  | 'heart-arrow'
  | 'drop'
  | 'drop-pin'
  | 'drop-tear'
  | 'drop-flame'
  | 'banner-ribbon'
  | 'banner-flag'
  | 'banner-tag'
  | 'banner-scroll'
  | 'gear'
  | 'gear-12'
  | 'gear-6'
  | 'gear-fine'
  | 'asterisk'
  | 'star-burst'
  | 'flower'
  | 'flower-8'
  | 'blob-2'
  | 'tree'
  | 'mountain'
  | 'sun'
  | 'plus'
  | 'minus'
  | 'x-mark'
  | 'arrow-curved'
  | 'hand-kreis'
  | 'hand-unterstrich'
  | 'hand-pfeil'
  | 'hand-ausruf'
  | 'hand-marker'
  | 'hand-marker-box'
  | 'hand-winken'
  | 'hand-pfeil-schlaufe'
  | 'hand-pfeil-welle'
  | 'hand-pfeil-bogen'
  | 'hand-pfeil-haken'
  | 'hand-pfeil-herz'
  | 'hand-pfeil-spirale';

/** `color`: hue and saturation of the fill, brightness of what lies beneath — a duotone. */
export type ShapeBlendMode = 'color';

export type TailSide = 'top' | 'right' | 'bottom' | 'left';

export interface ShapeInstance {
  id: string;
  /** Fields that follow a brand role; see `brand/bindings`. */
  bind?: Bindings;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  /** `rounded-rect`: one radius for all corners, or one per corner (tl, tr, br, bl). */
  cornerRadius?: CornerRadius;
  /** Canvas px a composer card grew with its text (cardFollowsText); not a hand resize. */
  textGrowth?: number;
  strokeWidth?: number;
  dash?: number[];
  /** Drop shadow (Konva shadow* props); omit for no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  /** Linear gradient fill; when set, overrides `fill`. */
  fillGradient?: GradientFill | null;
  /**
   * Photo gradient: `fill` fading in from the bottom or top edge (see `shadeGradient`).
   * When set it wins over `fillGradient`. Stored, so never renamed.
   */
  shade?: 'bottom' | 'top' | null;
  /** Blends the fill into what lies beneath (Konva `globalCompositeOperation`); omit for normal. */
  blendMode?: ShapeBlendMode;
  /** Mirrored about the centre (negative node scale); omit for upright. */
  flipX?: boolean;
  flipY?: boolean;
  /**
   * `rect` only: side of the square cut from the top-right corner, as a share of the
   * canvas width (0.0519 = 56 px on 1080). Stored, so never renamed.
   */
  notch?: number;
  /**
   * `ellipse` and `rect`: the fill fades from full strength in the middle to nothing at the
   * edge (a soft colour field). Wins over `fillGradient`, loses to `shade`. Stored, so never renamed.
   */
  glow?: boolean;
  /** `rect` only: opacity (0–1) of a noise layer over the fill. Stored, so never renamed. */
  grain?: number;
  /** `dark`: dark specks; `light`: soft white specks. Absent: `dark`. */
  grainTone?: 'dark' | 'light';
  /** `rect` only: a grid of dots, or vertical stripes (every second band), over the fill. */
  pattern?: 'dots' | 'stripes';
  /** Colour of the dots or stripes (bindable). */
  patternColor?: string;
  /**
   * Distance between the dots (0.037 = 40 px on 1080), or the width of one stripe band
   * (0.0667 = 72 px on 1080), as a share of the canvas width.
   */
  patternSpacing?: number;
  /** `rect` only: the plate follows a text's lines (see `hugPlates`); padding in px. Not drawn. Stored, so never renamed. */
  hug?: PlateHug;
  /**
   * `ring`: stroke thickness in px, measured inwards from the outer edge. Without it (and
   * without `arc`) the ring keeps its old fixed inner radius. Stored, so never renamed.
   */
  ringWidth?: number;
  /** `ring`: the share (0..1) of the circle drawn, from 12 o'clock clockwise; absent or 1 is the whole ring. */
  arc?: number;
  /** `line-arrow`: the shaft's middle sags by this share of its length (positive: down); absent is straight. */
  bend?: number;
  /**
   * `rounded-rect`: a speech-bubble tail drawn into the same outline. `tailSide` turns it on;
   * `tailAt` (0..1, default 0.5) is where its base is centred along that edge, from the left or
   * the top; `tailSize` (px, default 40) is how far it reaches out of the box, and how wide its
   * base is. The tail lies outside `width` × `height`. Stored, so never renamed.
   */
  tailSide?: TailSide;
  tailAt?: number;
  tailSize?: number;
}
