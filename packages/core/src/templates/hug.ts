// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Hugging plates: a plate (a `rect` in `shapeInstances`) that carries `hug` is as tall as the
 * lines of its text plus padding, and with `width: 'text'` as wide as the longest line. Placing a
 * template, a new brand font, a committed edit and an AI fill all move the text's geometry; this
 * brings the plate back to it. Pure: the page is not touched, and it comes back as the same
 * object when no plate moves.
 */

/** Where a plate hugs: the text it follows, padding in px (a fraction of the short side in a template file). */
export interface PlateHug {
  /** Id of the text element (in `additionalTexts`) the plate follows; several ids: the plate spans all of them. */
  text: string | string[];
  padX: number;
  padY: number;
  /** `box` (default): the text box plus `padX` on both sides. `text`: the longest line plus `padX`, anchored by the text's `align`. */
  width?: 'box' | 'text';
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What hugging needs of an editor's element kinds (`GateAdapter` carries all three). */
export interface HugAdapter {
  box(stateKey: string, el: Readonly<Record<string, unknown>>, lines: number): Box | null;
  /** Lines of the text at its width, and the width of its longest line, in canvas px (scale included); null if it cannot be measured. */
  textExtent(el: Readonly<Record<string, unknown>>): { lines: number; width: number } | null;
  /** `el` moved and sized so that `box(stateKey, el, 1)` is `box`: the inverse of `box`. */
  placeBox(stateKey: string, el: Record<string, unknown>, box: Box): Record<string, unknown>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The hug of a plate, or null when it carries none or a malformed one. */
export function hugOf(plate: Readonly<Record<string, unknown>>): PlateHug | null {
  const h = plate['hug'];
  if (!isObj(h)) return null;
  const ids = h['text'];
  const named =
    typeof ids === 'string' ||
    (Array.isArray(ids) && ids.length > 0 && ids.every((i) => typeof i === 'string'));
  if (!named) return null;
  if (!isNum(h['padX']) || !isNum(h['padY'])) return null;
  return h as unknown as PlateHug;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

export function hugPlates(
  state: Readonly<Record<string, unknown>>,
  a: HugAdapter,
  opts: {
    /** At least this many lines for the text of that id. Given, the plate is the worst case a slot allows: full text width too. */
    minLines?: (textId: string) => number;
  } = {}
): Record<string, unknown> {
  const plates = state['shapeInstances'];
  const texts = state['additionalTexts'];
  if (!Array.isArray(plates) || !Array.isArray(texts)) return state as Obj;
  let next: unknown[] | null = null;
  plates.forEach((raw, i) => {
    if (!isObj(raw)) return;
    const hug = hugOf(raw);
    if (!hug || (isNum(raw['rotation']) && raw['rotation'] % 360 !== 0)) return;
    const ids = typeof hug.text === 'string' ? [hug.text] : hug.text;
    const followed = ids.map(
      (id) => texts.find((t) => isObj(t) && t['id'] === id) as Obj | undefined
    );
    // Without all of its texts, or with one turned, the plate stays as placed.
    if (followed.some((t) => !t || ((t['rotation'] as number | undefined) ?? 0) % 360 !== 0))
      return;
    let x0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const [n, text] of followed.entries()) {
      const extent = a.textExtent(text!);
      if (!extent) return;
      const lines = Math.max(extent.lines, opts.minLines?.(ids[n]!) ?? 0, 1);
      const box = a.box('additionalTexts', text!, lines);
      if (!box) return;
      const wide =
        hug.width === 'text' && !opts.minLines ? Math.min(extent.width, box.width) : box.width;
      const align = text!['align'];
      const left =
        wide === box.width || align === undefined || align === 'left'
          ? box.x
          : align === 'center'
            ? box.x + (box.width - wide) / 2
            : box.x + box.width - wide;
      x0 = Math.min(x0, left);
      x1 = Math.max(x1, left + wide);
      y0 = Math.min(y0, box.y);
      y1 = Math.max(y1, box.y + box.height);
    }
    x0 = Math.floor(x0 - hug.padX);
    x1 = Math.ceil(x1 + hug.padX);
    y0 = Math.floor(y0 - hug.padY);
    y1 = Math.ceil(y1 + hug.padY);
    const target = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const current = a.box('shapeInstances', raw, 1);
    if (
      current &&
      near(current.x, target.x) &&
      near(current.y, target.y) &&
      near(current.width, target.width) &&
      near(current.height, target.height)
    ) {
      return;
    }
    (next ??= [...plates])[i] = a.placeBox('shapeInstances', raw, target);
  });
  return next ? { ...state, shapeInstances: next } : (state as Obj);
}
