// SPDX-License-Identifier: MPL-2.0
import { type BrandPack } from '../brand/brandPack.js';
import {
  BRAND_LAYOUT_BOUNDS,
  brandLayout,
  logoEnvelope,
  safeArea,
  type BrandLayout,
} from '../brand/layout.js';
import type { Box } from '../brand/logoFit.js';
import type { SchemeId } from '../brand/schemes.js';
import { mixColors, parseColor, relativeLuminance } from '../color/color.js';
import { duotoneRamp } from '../color/duotone.js';
import { SHADE_STOPS, shadeAlphaAt, type ShadeDirection } from '../color/shade.js';
import {
  forEachElement,
  instantiateTemplatePage,
  roomBelow,
  type FitText,
  offeredSchemes,
  type GeometryTable,
  type TemplateInput,
} from './instantiate.js';
import { hugPlates, type HugAdapter } from './hug.js';
import { countChars, countWords } from './slotBudget.js';

/**
 * What the render gate needs to know of an editor's element kinds. The editor fills it
 * in (`TEMPLATE_GATE_ADAPTER`); the checks that use it are `checkTemplate`.
 */
export interface GateAdapter extends Partial<Pick<HugAdapter, 'textExtent' | 'placeBox'>> {
  geometry: GeometryTable;
  /** stateKey → fields that hold a colour value and may carry a binding (no font or image fields). */
  colorFields: Readonly<Record<string, readonly string[]>>;
  /** stateKey → fields that name an image file; each must be bound to the logo or listed in the pack manifest. */
  assetFields: Readonly<Record<string, readonly string[]>>;
  /** Colours an element holds inside nested fields (gradient stops, chart colours, text accent and marker); `field` is the top-level field. */
  nestedColors(
    stateKey: string,
    el: Readonly<Record<string, unknown>>
  ): readonly { field: string; value: string }[];
  /**
   * Why an element cannot be placed against a frame at all (a rotated image, say), or null.
   * `bounds` then fails closed for it.
   */
  boundsProblem?(stateKey: string, el: Readonly<Record<string, unknown>>): string | null;
  /**
   * The assets an element names by id rather than by file: icons, illustrations, stickers,
   * emoji. `id` is the element's id (an icon's key in `iconStates`). The ids are checked against
   * `GateContext.allowedAssets`.
   */
  assetRefs(
    stateKey: string,
    el: Readonly<Record<string, unknown>>,
    id: string
  ): readonly { kind: string; id: string }[];
  /**
   * How many lines a text element's own content takes at its width (explicit breaks and an
   * estimate of wrapping); 1 for an element that is not a text. Used for a text the template
   * has no `maxLines` for, which would otherwise be measured as one line.
   */
  lineCount(stateKey: string, el: Readonly<Record<string, unknown>>): number;
  /**
   * Fits a text with `maxFontSize` to its box (see `FitText`). Optional: without it a text is
   * judged at the size it is placed at.
   */
  fitText?: FitText;
  /** The box an element covers in canvas px, or null if it has none. `lines` is a text's line count. */
  box(stateKey: string, el: Readonly<Record<string, unknown>>, lines: number): Box | null;
  /**
   * A text the element draws, or null. `ground` is set when the element paints its own ground
   * (a badge's fill), which the text is then held against. `opacity` is 1 when none is set.
   */
  text(
    stateKey: string,
    el: Readonly<Record<string, unknown>>
  ): {
    fill: string;
    fontSize: number;
    bold: boolean;
    opacity: number;
    ground?: string;
    /** Set when the text cannot be placed against a frame (rotated, width not measurable): `bounds` then fails closed. */
    boundsProblem?: string;
    /** Set when the text's colour is not the flat `fill` (a gradient): the reason it cannot be checked. */
    notCheckable?: string;
  } | null;
  /**
   * What the element paints under later layers: `solid` is an opaque flat fill; `photo` is an
   * image the gate judges against every colour it can paint: all 256 greys when `low` and `high`
   * are black and white (an untreated photo), else the 256 entries of `duotoneRamp(low, high)`.
   * Its pixels are assumed opaque (a transparent cut-out would show what lies beneath); `veil` is a flat fill of `fill` at `alpha`; `shade` is `fill` fading in along
   * `SHADE_STOPS[direction]` over the element's box; `unknown` is anything else (a gradient,
   * a chart, a badge, an adjusted image), null is nothing (a text).
   */
  cover(
    stateKey: string,
    el: Readonly<Record<string, unknown>>,
    canvasWidth: number
  ): GateCover | null;
}

/**
 * What an element paints (see `GateAdapter.cover`). `range` is `fill` at an alpha anywhere in
 * `alpha` (a glow: full in the middle, nothing at the edge). Any kind may carry: `cut`, a box the
 * element leaves bare (a notch), so a text lying wholly inside it is not on this element; `dots`,
 * a dot pattern over the element, which no text lying on it can be judged against; `grain`, a
 * layer of `fill` at any alpha in `alpha` over it.
 */
export type GateCover = (
  | { kind: 'solid'; fill: string }
  | { kind: 'photo'; low: string; high: string }
  | { kind: 'veil'; fill: string; alpha: number }
  | { kind: 'shade'; fill: string; direction: ShadeDirection }
  | { kind: 'range'; fill: string; alpha: [number, number] }
  | { kind: 'unknown' }
) & {
  cut?: Box;
  dots?: true;
  grain?: { fill: string; alpha: [number, number] };
};

export const GATE_RULES = [
  'bounds',
  'logo-overlap',
  'contrast',
  'budget',
  'unbound-colour',
  'asset-licence',
  'marker-role',
  'scheme-coverage',
  'logo-corners',
] as const;
export type GateRule = (typeof GATE_RULES)[number];

export interface GateProblem {
  /** `schema` for a file that does not read, or a page the gate could not place; the other rules are `GATE_RULES`. */
  rule: GateRule | 'schema';
  templateId: string;
  detail: string;
  brand?: string;
  scheme?: SchemeId;
  format?: string;
}

export interface GateBudget {
  maxWords?: number;
  maxLines?: number;
  maxChars?: number;
}

export interface GateContext {
  brands: readonly BrandPack[];
  /** Aspect → canvas size. */
  canvases: Readonly<Record<string, { width: number; height: number }>>;
  adapter: GateAdapter;
  /** Paths of the assets the pack ships (its manifest). */
  manifestPaths: ReadonlySet<string>;
  /**
   * Licence-ok assets by kind (as `GateAdapter.assetRefs` names them), supplied by the caller.
   * An entry is an exact id, or a prefix when it ends in `:` (a whole set). A kind with no
   * entry allows nothing. A template cannot carry attribution, so attribution-only sets stay off.
   */
  allowedAssets: Readonly<Record<string, readonly string[]>>;
  /** The template's slots by element id; `role` is what the `budget` rule reads for the word cap. */
  slots: Readonly<Record<string, { role?: string; budget: GateBudget }>>;
  /** Placeholder text by element id, checked against the slot's budget (the template's own locales are checked too). */
  placeholderTexts: Readonly<Record<string, string>>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The word cap above which only a body or quote slot may go (Global Constraints). */
const MAX_WORDS_OUTSIDE_BODY = 60;
const TEXT_CONTRAST = 4.5;
const LARGE_TEXT_CONTRAST = 3.0;
/** A box may overshoot its frame by this much (rounding) before it counts as leaving it. */
const SLACK = 1;
/** Stand-in logo, so a placed template shows the logo element the way a brand with a logo does. */
const GATE_LOGO = { src: '/gate-logo.png', label: 'Gate logo' };
const GATE_LOGO_SIZE = { width: 400, height: 100 };

const refOf = (entry: unknown): unknown => (isObj(entry) ? entry['ref'] : entry);
const bindOf = (el: Obj): Obj => (isObj(el['bind']) ? el['bind'] : {});
const isLogo = (el: Obj): boolean => refOf(bindOf(el)['src']) === 'brand.logo';
const fmt = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * The smallest and largest alpha a shade has over the vertical span of `box` inside the shade's
 * `area`: the alpha is piecewise linear, so both lie at an end of the span or at a stop inside it.
 */
function shadeAlphaRange(direction: ShadeDirection, box: Box, area: Box): [number, number] {
  const top = Math.min(Math.max((box.y - area.y) / area.height, 0), 1);
  const bottom = Math.min(Math.max((box.y + box.height - area.y) / area.height, 0), 1);
  const at = [
    top,
    bottom,
    ...SHADE_STOPS[direction].map(([o]) => o).filter((o) => o > top && o < bottom),
  ].map((t) => shadeAlphaAt(direction, t));
  return [Math.min(...at), Math.max(...at)];
}

/**
 * Null if the text passes on every ground in every interval, else the failure. Contrast only
 * depends on relative luminance: a text whose luminance lies inside an interval meets a ground
 * of contrast 1; otherwise the worst contrast is at an interval end.
 */
function judge(textFill: string, intervals: [Ground, Ground][], need: number): string | null {
  const text = parseColor(textFill);
  if (!text) return `${textFill} is unreadable`;
  const lt = relativeLuminance(text);
  const ends = intervals.flatMap(([lo, hi]) => [lo, hi]);
  const hit = intervals.find(([lo, hi]) => lo.lum <= lt && lt <= hi.lum);
  if (hit) {
    return `${textFill} on ${(lt - hit[0].lum < hit[1].lum - lt ? hit[0] : hit[1]).hex}: the ground can match the text's luminance (contrast 1), needs ${need}`;
  }
  const ratioOf = (g: Ground) => (Math.max(lt, g.lum) + 0.05) / (Math.min(lt, g.lum) + 0.05);
  const worst = ends.reduce((w, g) => (ratioOf(g) < ratioOf(w) ? g : w));
  return ratioOf(worst) < need
    ? `${textFill} on ${worst.hex} is ${fmt(ratioOf(worst))}, needs ${need}`
    : null;
}

type Overlay = { fill: string; alpha: [number, number]; shade?: true };
type Ground = { hex: string; lum: number };

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/** The colours a photo can paint: every grey, or the duotone ramp. Null if a colour is unparseable. */
function photoColours(low: string, high: string): string[] | null {
  const lo = parseColor(low);
  const hi = parseColor(high);
  if (!lo || !hi) return null;
  if (toHexOf(lo) === '#000000' && toHexOf(hi) === '#ffffff') {
    return Array.from({ length: 256 }, (_, i) => `#${hex2(i)}${hex2(i)}${hex2(i)}`);
  }
  const ramp = duotoneRamp(low, high);
  return Array.from(
    { length: 256 },
    (_, i) => `#${hex2(ramp[i * 3]!)}${hex2(ramp[i * 3 + 1]!)}${hex2(ramp[i * 3 + 2]!)}`
  );
}
const toHexOf = (c: { r: number; g: number; b: number }): string =>
  `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

const SEARCH_STEPS = 60;

/**
 * The interval under a stack holding one shade (bottom first). The composite is linear in the
 * shade's alpha per channel and the luminance is convex in it (channels may move in opposite
 * directions), so the maximum sits at an end of the alpha range and the minimum is found by
 * ternary search, which is exact for a convex function.
 */
function shadeInterval(base: string, overlays: Overlay[]): [Ground, Ground] | null {
  const start = parseColor(base);
  if (!start || start.a !== 1) return null;
  const fills = overlays.map((o) => parseColor(o.fill));
  if (fills.some((f) => !f || f.a !== 1)) return null;
  const at = (shadeAlpha: number): Ground => {
    let c = [start.r, start.g, start.b];
    overlays.forEach((o, i) => {
      const f = fills[i]!;
      const a = o.shade ? shadeAlpha : o.alpha[0];
      c = [c[0]! + (f.r - c[0]!) * a, c[1]! + (f.g - c[1]!) * a, c[2]! + (f.b - c[2]!) * a];
    });
    const [r, g, b] = c as [number, number, number];
    return {
      hex: `#${hex2(Math.round(r))}${hex2(Math.round(g))}${hex2(Math.round(b))}`,
      lum: relativeLuminance({ r, g, b, a: 1 }),
    };
  };
  const [lo, hi] = overlays.find((o) => o.shade)!.alpha;
  const ends = [at(lo), at(hi)];
  let a = lo;
  let b = hi;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const m1 = a + (b - a) / 3;
    const m2 = b - (b - a) / 3;
    if (at(m1).lum < at(m2).lum) b = m2;
    else a = m1;
  }
  const inner = at((a + b) / 2);
  const all = [...ends, inner].sort((x, y) => x.lum - y.lum);
  return [all[0]!, all[all.length - 1]!];
}

/**
 * The luminance interval of a ground under an overlay stack (bottom first). Veils have one
 * alpha; compositing moves the colour towards the fill. Null when a colour cannot be composited.
 */
function groundInterval(base: string, overlays: Overlay[]): [Ground, Ground] | null {
  if (overlays.some((o) => o.shade)) return shadeInterval(base, overlays);
  let colours = [base];
  for (const o of overlays) {
    const alphas = o.alpha[0] === o.alpha[1] ? [o.alpha[0]] : o.alpha;
    const next: string[] = [];
    for (const c of colours) {
      for (const a of alphas) {
        const mixed = mixColors(c, o.fill, a);
        if (mixed === null) return null;
        next.push(mixed);
      }
    }
    colours = next;
  }
  const grounds: Ground[] = [];
  for (const hex of colours) {
    const c = parseColor(hex);
    if (!c || c.a !== 1) return null;
    grounds.push({ hex, lum: relativeLuminance(c) });
  }
  grounds.sort((x, y) => x.lum - y.lum);
  return [grounds[0]!, grounds[grounds.length - 1]!];
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Overlap of more than the rounding slack on both axes. */
function overlaps(a: Box, b: Box): boolean {
  return (
    a.x + SLACK < b.x + b.width &&
    b.x + SLACK < a.x + a.width &&
    a.y + SLACK < b.y + b.height &&
    b.y + SLACK < a.y + a.height
  );
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x - SLACK &&
    inner.y >= outer.y - SLACK &&
    inner.x + inner.width <= outer.x + outer.width + SLACK &&
    inner.y + inner.height <= outer.y + outer.height + SLACK
  );
}

/**
 * Stage 1 of the render gate: every rule of `GATE_RULES` against a template, on each brand ×
 * colour world × declared format of the context, on the placed page. Returns every problem
 * (one per rule, detail, brand, world and format).
 */
export function checkTemplate(t: TemplateInput, ctx: GateContext): GateProblem[] {
  const out: GateProblem[] = [];
  const seen = new Set<string>();
  const add = (p: GateProblem) => {
    const key = `${p.rule}|${p.detail}|${p.brand ?? ''}|${p.scheme ?? ''}|${p.format ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  const problem = (rule: GateRule, detail: string, where: Partial<GateProblem> = {}) =>
    add({ rule, templateId: t.id, detail, ...where });

  const source = t.pages[0]?.state;
  if (!source) return out;
  const elements: { el: Obj; key: string; id: string }[] = [];
  forEachElement(source, (el, key, id) => elements.push({ el, key, id }));
  const hasLogo = elements.some(({ el, key }) => key === 'userImageInstances' && isLogo(el));

  // marker-role, unbound-colour, asset-licence: on the file as written.
  const bound = (id: string, el: Obj, field: string) =>
    bindOf(el)[field] !== undefined || (t.fixed?.[id] ?? []).includes(field);
  for (const { el, key, id } of [...elements, { el: source as Obj, key: 'page', id: 'page' }]) {
    for (const [field, entry] of Object.entries(bindOf(el))) {
      const ref = refOf(entry);
      if (ref === 'marker' || ref === 'marker-ink') {
        problem(
          'marker-role',
          `${id}.${field} is bound to "${ref}"; marker roles are not for templates`
        );
      }
    }
    // Any non-empty string in a colour field is a colour, readable or not (a named colour
    // or hsl() renders just the same); it must follow the brand or be listed as fixed.
    for (const field of ctx.adapter.colorFields[key] ?? []) {
      const value = el[field];
      if (typeof value === 'string' && value.trim() !== '' && !bound(id, el, field)) {
        problem('unbound-colour', `${id}.${field} holds ${value} with no bind and no fixed entry`);
      }
    }
    for (const { field, value } of ctx.adapter.nestedColors(key, el)) {
      if (value.trim() !== '' && !bound(id, el, field)) {
        problem('unbound-colour', `${id}.${field} holds ${value} with no bind and no fixed entry`);
      }
    }
    for (const ref of ctx.adapter.assetRefs(key, el, id)) {
      const allowed = ctx.allowedAssets[ref.kind] ?? [];
      if (!allowed.some((a) => (a.endsWith(':') ? ref.id.startsWith(a) : ref.id === a))) {
        problem(
          'asset-licence',
          `${id} uses ${ref.kind} "${ref.id}", which is not on the licence allowlist`
        );
      }
    }
    for (const field of ctx.adapter.assetFields[key] ?? []) {
      const src = el[field];
      if (typeof src !== 'string' || src === '') continue;
      if (field === 'src' && isLogo(el)) continue;
      if (!ctx.manifestPaths.has(src)) {
        problem('asset-licence', `${id}.${field} "${src}" is not in the pack manifest`);
      }
    }
  }

  // budget
  const texts: [string, string][] = [
    ...Object.entries(ctx.placeholderTexts),
    ...Object.values(t.placeholders ?? {}).flatMap((byId) => Object.entries(byId)),
  ];
  for (const [id, slot] of Object.entries(ctx.slots)) {
    const { maxChars, maxWords } = slot.budget;
    if (maxChars === undefined && maxWords === undefined) {
      problem('budget', `slot ${id} has neither maxChars nor maxWords`);
    }
    if (
      maxWords !== undefined &&
      maxWords > MAX_WORDS_OUTSIDE_BODY &&
      slot.role !== 'body' &&
      slot.role !== 'quote'
    ) {
      problem(
        'budget',
        `slot ${id} (${slot.role ?? 'no role'}) allows ${maxWords} words, over ${MAX_WORDS_OUTSIDE_BODY}`
      );
    }
    for (const [textId, text] of texts) {
      if (textId !== id) continue;
      if (maxChars !== undefined && countChars(text) > maxChars) {
        problem(
          'budget',
          `placeholder of ${id} has ${countChars(text)} characters, over maxChars ${maxChars}`
        );
      }
      if (maxWords !== undefined && countWords(text) > maxWords) {
        problem(
          'budget',
          `placeholder of ${id} has ${countWords(text)} words, over maxWords ${maxWords}`
        );
      }
    }
  }

  // The renderer draws icons from `selectedIcons`; one without an `iconStates` entry would sit
  // at the stage centre, where no frame check can see it.
  const states = isObj(source['iconStates']) ? source['iconStates'] : {};
  for (const iconId of Array.isArray(source['selectedIcons']) ? source['selectedIcons'] : []) {
    if (!isObj(states[String(iconId)])) {
      problem(
        'bounds',
        `icon ${String(iconId)} is in selectedIcons but has no iconStates entry; its place is unknown`
      );
    }
  }

  // logo-corners
  if (hasLogo) {
    if ((t.logoCorners ?? []).length === 0) {
      problem('logo-corners', 'the template has a logo but no logoCorners');
    }
    const logoIds = new Set(
      elements.filter(({ el, key }) => key === 'userImageInstances' && isLogo(el)).map((e) => e.id)
    );
    for (const block of t.blocks ?? []) {
      const hit = block.elementIds.find((id) => logoIds.has(id));
      if (hit) problem('logo-corners', `block ${block.id} contains the logo element ${hit}`);
    }
  }

  // The rules that read the placed page: per brand, world, format and logo corner of the grid.
  for (const brand of ctx.brands) {
    const offered = offeredSchemes(t, brand);
    if (offered.length === 0) {
      problem(
        'scheme-coverage',
        `brand ${brand.id} keeps none of the worlds ${t.schemes.join(', ')}`,
        {
          brand: brand.id,
        }
      );
      continue;
    }
    for (const schemeId of offered) {
      for (const format of t.formats) {
        const canvas = ctx.canvases[format];
        if (!canvas) {
          add({
            rule: 'schema',
            templateId: t.id,
            detail: `no canvas for format ${format}`,
            format,
          });
          continue;
        }
        for (const layout of layoutsOf(brand, t)) {
          const placedBrand: BrandPack = {
            ...brand,
            layout,
            ...(hasLogo ? { logo: GATE_LOGO } : {}),
          };
          const result = instantiateTemplatePage(
            { ...t, slots: ctx.slots },
            {
              brand: placedBrand,
              canvas,
              format,
              geometry: ctx.adapter.geometry,
              ...(ctx.adapter.fitText
                ? { fitText: ctx.adapter.fitText, boxOf: (k, e) => ctx.adapter.box(k, e, 1) }
                : {}),
              ...(hugAdapter(ctx.adapter) ? { hug: hugAdapter(ctx.adapter)! } : {}),
              schemeId,
              logoSizeOf: () => GATE_LOGO_SIZE,
            }
          );
          const where = { brand: brand.id, scheme: schemeId, format };
          if (!result.ok) {
            add({
              rule: 'schema',
              templateId: t.id,
              detail: `placing failed: ${result.reason}`,
              ...where,
            });
            continue;
          }
          checkPlaced(t, ctx, result.state, { canvas, layout, hasLogo, where }, problem);
        }
      }
    }
  }
  return out;
}

/** Layouts a brand may set: the margin and logo box at their limits (`BRAND_LAYOUT_BOUNDS`). */
const LAYOUT_EXTREMES = [BRAND_LAYOUT_BOUNDS.margin.min, BRAND_LAYOUT_BOUNDS.margin.max].flatMap(
  (margin) =>
    (['max', 'min'] as const).map((end) => ({
      margin,
      logoMaxWidth: BRAND_LAYOUT_BOUNDS.logoMaxWidth[end],
      logoMaxHeight: BRAND_LAYOUT_BOUNDS.logoMaxHeight[end],
    }))
);

/**
 * The brand's own layout and the extremes, each with every corner the template declares
 * (the logo is only ever placed in one of them, whatever corner the brand asks for).
 */
function layoutsOf(brand: BrandPack, t: TemplateInput): BrandLayout[] {
  const own = brandLayout(brand);
  const corners = t.logoCorners?.length ? t.logoCorners : [own.logoCorner];
  return [own, ...LAYOUT_EXTREMES.map((l) => ({ ...own, ...l }))].flatMap((l) =>
    corners.map((logoCorner) => ({ ...l, logoCorner }))
  );
}

const layoutLabel = (l: BrandLayout): string =>
  `layout margin ${l.margin}, logo ${l.logoMaxWidth}×${l.logoMaxHeight} at ${l.logoCorner}`;

/** The adapter's hug parts, when it has them all. */
function hugAdapter(a: GateAdapter): HugAdapter | null {
  return a.textExtent && a.placeBox
    ? { box: a.box, textExtent: a.textExtent, placeBox: a.placeBox }
    : null;
}

function checkPlaced(
  t: TemplateInput,
  ctx: GateContext,
  state: Obj,
  at: {
    canvas: { width: number; height: number };
    layout: ReturnType<typeof brandLayout>;
    hasLogo: boolean;
    where: Partial<GateProblem>;
  },
  problem: (rule: GateRule, detail: string, where?: Partial<GateProblem>) => void
): void {
  const { canvas, layout, where } = at;
  // A plate that hugs its text is judged at the most the slot allows: the text may take its full
  // budget in lines, and then the plate is that tall (and as wide as the text box).
  const hugs = hugAdapter(ctx.adapter);
  if (hugs) {
    state = hugPlates(state, hugs, { minLines: (id) => ctx.slots[id]?.budget.maxLines ?? 1 });
  }
  const short = Math.min(canvas.width, canvas.height);
  const frames = {
    canvas: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    safe: safeArea(layout, canvas),
  };
  const corner = t.logoCorners?.includes(layout.logoCorner)
    ? layout.logoCorner
    : t.logoCorners?.[0];
  const envelope = at.hasLogo && corner ? logoEnvelope(layout, canvas, corner) : null;

  const placed = new Map<string, { el: Obj; key: string }>();
  forEachElement(state, (el, key, id) => placed.set(id, { el, key }));
  const order = Array.isArray(state['layerOrder'])
    ? (state['layerOrder'] as unknown[]).map(String)
    : [];
  // A slot's maxLines is what the user may type; the text on the page (the placeholder) is
  // measured too, and the larger count counts.
  const lines = (id: string, key: string, el: Obj) =>
    Math.max(ctx.slots[id]?.budget.maxLines ?? 1, ctx.adapter.lineCount(key, el), 1);

  const NOT_DETERMINABLE = 'ground not determinable';
  const opaque = (color: string): boolean => parseColor(color)?.a === 1;

  for (const [id, { el, key }] of placed) {
    const box = ctx.adapter.box(key, el, lines(id, key, el));
    const text = ctx.adapter.text(key, el);
    const placement = ctx.adapter.boundsProblem?.(key, el) ?? null;
    // A text of unknown width cannot be placed against any frame: fail closed.
    if (placement) {
      problem('bounds', `${id}: ${placement}`, where);
    } else if (text?.boundsProblem) {
      problem('bounds', `${id}: ${text.boundsProblem}`, where);
    } else if (box && text && !(box.width > 0)) {
      problem('bounds', `${id} has no width (width unknown)`, where);
    } else if (box && text && !(text.fontSize > 0)) {
      problem('bounds', `${id} has no font size (font size unknown)`, where);
    } else if (box) {
      const frame = t.frames?.[id] ?? 'safe';
      if (!inside(box, frames[frame])) {
        problem(
          'bounds',
          `${id} leaves the ${frame} frame: box ${fmt(box.x)},${fmt(box.y)} ${fmt(box.width)}×${fmt(box.height)} (${layoutLabel(layout)})`,
          where
        );
      }
    }
    if (!text) continue;
    // A fitted text is judged at its fitted size (the page was placed that way); one that does not
    // fit even at the floor fails.
    if (key === 'additionalTexts' && typeof el['maxFontSize'] === 'number') {
      const maxLines = ctx.slots[id]?.budget.maxLines;
      const maxHeight = roomBelow(state, key, el, (k, e) => ctx.adapter.box(k, e, 1));
      const fit = ctx.adapter.fitText?.(el, {
        ...(maxLines === undefined ? {} : { maxLines }),
        ...(maxHeight === undefined ? {} : { maxHeight }),
        canvasHeight: canvas.height,
      });
      if (fit && !fit.fits) {
        problem(
          'bounds',
          `${id} does not fit its box at the minimum size (${fmt(fit.fontSize)} px)`,
          where
        );
      }
    }
    if (box && envelope && intersects(box, envelope)) {
      problem('logo-overlap', `${id} runs into the logo envelope (${layoutLabel(layout)})`, where);
    }

    // contrast fails closed: a ground that cannot be proven opaque and flat is a failure.
    const fail = (why: string) => problem('contrast', `${id}: ${why}`, where);
    if (text.notCheckable) {
      fail(text.notCheckable);
      continue;
    }
    if (parseColor(text.fill) === null) {
      fail('text colour not parseable');
      continue;
    }
    if (text.opacity < 1 || !opaque(text.fill)) {
      fail(`text opacity or alpha is below 1, contrast not determinable`);
      continue;
    }
    // The possible grounds: the badge's own fill, else what lies below the text. Walking down
    // from the text, a veil or shade holding the whole box is laid on a stack and the walk goes
    // on; a solid or photo holding the whole box ends it, as does the page background. A photo
    // yields every colour it can paint, a shade an alpha range: each ground is judged as a
    // luminance interval.
    let grounds: string[] | null = text.ground === undefined ? null : [text.ground];
    const overlays: Overlay[] = [];
    let stackedShades = false;
    if (grounds === null) {
      const at = order.indexOf(id);
      if (!box || at === -1) {
        fail(`${NOT_DETERMINABLE} (the text is not in layerOrder)`);
        continue;
      }
      grounds = [typeof state['backgroundColor'] === 'string' ? state['backgroundColor'] : ''];
      for (const belowId of order.slice(0, at).reverse()) {
        const below = placed.get(belowId);
        // The logo is owned by logo-overlap; a text on it is reported there.
        if (below && below.key === 'userImageInstances' && isLogo(below.el)) continue;
        const cover = below && ctx.adapter.cover(below.key, below.el, canvas.width);
        if (!below || !cover) continue;
        const area = ctx.adapter.box(below.key, below.el, 1);
        if (!area) {
          // An element of unknown extent could lie under the text.
          if (cover.kind === 'unknown') grounds = null;
          if (cover.kind === 'unknown') break;
          continue;
        }
        if (!overlaps(box, area)) continue;
        // Only an element holding the whole text box is its ground; one that covers part of it
        // puts the text on two grounds (or an edge), which is not judged by either.
        if (cover.cut && overlaps(box, cover.cut)) {
          // A text wholly in the cut is not on this element; one half in it lies on two grounds.
          if (inside(box, cover.cut)) continue;
          grounds = null;
          break;
        }
        if (!inside(box, area) || cover.kind === 'unknown' || cover.dots) {
          grounds = null;
          break;
        }
        // Two alpha ranges over one text: the alphas move together, not independently. Not judged.
        const ranges =
          (cover.grain ? 1 : 0) + (cover.kind === 'shade' || cover.kind === 'range' ? 1 : 0);
        if (ranges > 0 && (ranges > 1 || overlays.some((o) => o.shade))) {
          grounds = null;
          stackedShades = true;
          break;
        }
        if (cover.grain) {
          overlays.push({ shade: true, fill: cover.grain.fill, alpha: cover.grain.alpha });
        }
        if (cover.kind === 'veil') {
          overlays.push({ fill: cover.fill, alpha: [cover.alpha, cover.alpha] });
        } else if (cover.kind === 'shade' || cover.kind === 'range') {
          overlays.push({
            shade: true,
            fill: cover.fill,
            alpha:
              cover.kind === 'shade' ? shadeAlphaRange(cover.direction, box, area) : cover.alpha,
          });
        } else {
          grounds = cover.kind === 'solid' ? [cover.fill] : photoColours(cover.low, cover.high);
          break;
        }
      }
    }
    // Bottom-up: the overlay nearest the ground goes on first.
    overlays.reverse();
    const bad = overlays.some((o) => !opaque(o.fill) || !(o.alpha[0] >= 0 && o.alpha[1] <= 1));
    const intervals = grounds && !bad ? grounds.map((g) => groundInterval(g, overlays)) : [];
    if (intervals.length === 0 || intervals.some((i) => i === null)) {
      fail(`${NOT_DETERMINABLE}${stackedShades ? ' (stacked shades)' : ''} under ${text.fill}`);
      continue;
    }
    const large = text.fontSize >= (text.bold ? 18.67 : 24) * (short / 1080);
    const need = large ? LARGE_TEXT_CONTRAST : TEXT_CONTRAST;
    const verdict = judge(text.fill, intervals as [Ground, Ground][], need);
    if (verdict) fail(verdict);
  }
}
