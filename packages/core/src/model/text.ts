// SPDX-License-Identifier: MPL-2.0
/**
 * Text on the page: the free text (`additionalTexts`) and how its runs look.
 */
import { type Bindings } from '../brand/bindings.js';
import { type GradientFill } from './fill.js';

/** Ausrichtung eines Textes in seiner Box; ohne Angabe links. */
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;

export type TextAlign = (typeof TEXT_ALIGNS)[number];

/**
 * Wie ein `==Akzent==`-Lauf aussieht. Die Marke entscheidet das, nicht der
 * Text: AT setzt das Wort gelb in Fraunces kursiv, DE nur in einer
 * anderen Farbe. Ohne `accent` am Text bleibt ein Akzentlauf unauffällig.
 */
export interface TextAccent {
  fill: string;
  fontFamily?: string;
  fontStyle?: 'normal' | 'bold' | 'italic' | 'bold italic';
}

/**
 * Wie ein `++Marker++`-Lauf aussieht: ein Kasten hinter dem Lauf, je
 * Zeilenstück einer, mit dunkler Schrift darin. Nur DE setzt ihn (die
 * Textmarker-Box der Posts); ohne `marker` am Text bleibt ein Markerlauf
 * unauffällig. Abstände in Vielfachen der Schriftgröße.
 */
export interface TextMarker {
  /** Farbe des Kastens. */
  fill: string;
  /** Schriftfarbe im Kasten — der Kasten steht oft auf dunklem Grund. */
  color: string;
  /** Innenabstand links/rechts; Vorgabe 0.18. */
  padX?: number;
  /** Innenabstand oben/unten; Vorgabe 0.04. */
  padY?: number;
}

/** Numeric font weight; the nine CSS steps. */
export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

/** Dynamic additional text element */
export interface AdditionalText {
  id: string;
  /** Fields that follow a brand role; see `brand/bindings`. */
  bind?: Bindings;
  text: string;
  type: 'header' | 'subheader' | 'body';
  x: number;
  y: number;
  width: number;
  fontSize: number;
  /**
   * The prototype's size of a template text. A text with it has its `fontSize` fitted to the
   * brand's font, never above this; omit for a text whose size is fixed.
   */
  maxFontSize?: number;
  fontFamily: string;
  fontStyle?: 'normal' | 'italic' | 'bold' | 'bold italic';
  /** Numeric weight; wins over the bold part of `fontStyle`. Absent = `fontStyle` alone. */
  fontWeight?: FontWeight;
  /** Spacing after every glyph, in em (-0.1 to 0.3); the pixel value is `letterSpacing * fontSize`. */
  letterSpacing?: number;
  /** A line through the whole text (a struck-out myth). Only `true` means anything. */
  strikethrough?: boolean;
  /**
   * `'page'`: the text shows the number of its page (from 1) instead of `text`, which is only
   * drawn where no page is known. Not editable; never a slot.
   */
  counter?: 'page';
  fill: string;
  rotation?: number;
  scale?: number;
  opacity?: number;
  /** Outline color; omit for no outline. */
  stroke?: string;
  /** Outline width in px (only applied when `stroke` is set). */
  strokeWidth?: number;
  /** Drop shadow (Konva shadow* props); omit for no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  /** Linear gradient fill; when set, overrides `fill`. */
  fillGradient?: GradientFill | null;
  /** Horizontal alignment inside `width`; omit for left. */
  align?: 'left' | 'center' | 'right';
  /** Line height as a factor of `fontSize`; omit for the default 1.2. */
  lineHeight?: number;
  /** How `==accent==` runs look; omit and they render like the rest. */
  accent?: TextAccent | null;
  /** How `++marker++` runs look (a box behind the run); omit and they render like the rest. */
  marker?: TextMarker | null;
  /** Flat plate fill; wins over `marker.fill`, so a template can bind it. */
  markerFill?: string;
  /** Flat ink on the plate; wins over `marker.color`. */
  markerColor?: string;
  /** Flat accent colour; wins over `accent.fill`. */
  accentFill?: string;
  /**
   * A picture made of type (a ghost numeral): huge, translucent, allowed to bleed off the page.
   * Exempt from the gate's bounds, contrast and size rules, never filled by the AI, never a
   * neighbour that other text must make room for, never listed as content. Still selectable
   * and editable like any text. Absent = ordinary text.
   */
  decorative?: true;
}
