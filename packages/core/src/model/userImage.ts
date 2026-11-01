// SPDX-License-Identifier: MPL-2.0
/**
 * Own images on the page.
 */
import { type Bindings } from '../brand/bindings.js';
import { type CornerRadius } from './cornerRadius.js';

/**
 * Stock credit as a host's image API returns it. This mirrors `StockImageAttribution` in
 * `@ggraphic/schema` so the core needs no dependency on it; the editor's `coreModelParity` test
 * fails if the two drift apart.
 */
interface ImageAttribution {
  photographer: string;
  profileUrl: string;
  photoUrl: string;
  downloadLocation?: string;
  /** Without the `@`; credited in the post text when present. */
  instagramUsername?: string;
}

export interface UserImageInstance {
  id: string;
  /** Fields that follow a brand role; see `brand/bindings`. */
  bind?: Bindings;
  src: string;
  fileName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
  /** Gaussian blur radius in px; omit/0 for no blur. */
  blur?: number;
  /** Drop shadow (Konva shadow* props); omit for no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  // --- Image adjustments (Konva.Filters); omit/default = no effect ---
  /** Konva Brighten: -1..1 */
  brightness?: number;
  /** Konva Contrast: -100..100 */
  contrast?: number;
  /** Konva HSL saturation: -2..10 */
  saturation?: number;
  /** Konva HSL hue: 0..360 */
  hue?: number;
  /** Color temperature -100..100 (custom warm/cool R/B shift) */
  temperature?: number;
  grayscale?: boolean;
  sepia?: boolean;
  invert?: boolean;
  /** Duotone: shadows to a dark shade of this colour, highlights to a pale one. */
  tint?: string | null;
  /** How far the tint replaces the photo's own colours: 0..1. */
  tintStrength?: number;
  /**
   * Two-colour duotone: shadows to `duotoneLow`, highlights to `duotoneHigh`. Active
   * only when both are set; the Duotone look binds them to the page world's
   * `duo-low` / `duo-high`. Stored, so the names are fixed.
   */
  duotoneLow?: string | null;
  duotoneHigh?: string | null;
  /** Darkened edges: 0..1. */
  vignette?: number;
  /** Mirrored left–right / top–bottom; flips the pixels, not the node. */
  flipX?: boolean;
  flipY?: boolean;
  /** `cover`: the source is cropped (Konva `crop`) to fill width × height. */
  fit?: 'cover';
  /** Magnification inside the crop frame; 1 just covers it. */
  cropZoom?: number;
  /** `cover` only: where the photo sits in its frame, a share of its overhang (-1 … 1, 0 centred). */
  panX?: number;
  panY?: number;
  /**
   * `cover` only: Begradigen, Grad (−45 … 45), das Foto dreht sich im Rahmen.
   * Fehlt es, gilt 0. Mit Winkel ist `panX`/`panY` der Anteil in den Achsen des
   * gedrehten Fotos (`straightFramedPhoto`).
   */
  cropRotation?: number;
  /** `kreis`: clipped to the circle inside width × height. */
  mask?: 'kreis';
  /** Rounded corners in px: one radius for all, or one per corner (tl, tr, br, bl). `mask` and `notch` win. */
  cornerRadius?: CornerRadius;
  /** Side of the square cut from the top-right corner, a share of the canvas width; wins over `mask`. */
  notch?: number;
  /** Stock credit (Unsplash): the photo is hotlinked, so the credit travels with it. */
  attribution?: ImageAttribution;
}

/** Where a new element goes; without `center` it lands in the canvas centre. */
export interface ElementPlacement {
  /** Centre of the new element (a drop point), in the template's reference space. */
  center?: { x: number; y: number };
}
