// SPDX-License-Identifier: MPL-2.0
/**
 * Which renderer draws a text: one Konva `Text` node, or `CanvasRichText` (lists, inline marks,
 * a word wider than the box). `CanvasText` and the template render gate both ask here, so the
 * gate lays a text out with the code path the canvas takes.
 */

import { hasInlineMarks, hasListMarkers, PLAIN_STYLE, type MeasureRun } from '@ggraphic/schema';

export interface TextRoutingProps {
  text: string;
  richText?: boolean;
  width?: number;
  wrap?: 'word' | 'char' | 'none';
  padding?: number;
}

/** A word wider than the field: Konva would break it mid-word, the rich layout hyphenates. */
export function hasOverlongWord(props: TextRoutingProps, measure: MeasureRun): boolean {
  const { width, text, wrap = 'word' } = props;
  if (!width || wrap !== 'word') return false;
  const inner = width - 2 * (props.padding ?? 0);
  return text.split(/\s+/).some((word) => word !== '' && measure(word, PLAIN_STYLE) > inner);
}

/** True when the text is drawn by `CanvasRichText`. */
export function usesRichText(props: TextRoutingProps, measure: MeasureRun): boolean {
  return (
    !!props.richText ||
    hasListMarkers(props.text) ||
    hasInlineMarks(props.text) ||
    hasOverlongWord(props, measure)
  );
}
