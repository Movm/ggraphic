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
import { contrastRatio, parseColor } from '../color/color.js';
import {
  forEachElement,
  instantiateTemplatePage,
  offeredSchemes,
  type GeometryTable,
  type TemplateInput,
} from './instantiate.js';

/**
 * What the render gate needs to know of an editor's element kinds. The editor fills it
 * in (`TEMPLATE_GATE_ADAPTER`); the checks that use it are `checkTemplate`.
 */
export interface GateAdapter {
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
    /** Set when the text's colour is not the flat `fill` (a gradient): the reason it cannot be checked. */
    notCheckable?: string;
  } | null;
  /**
   * What the element paints under later layers: `solid` is an opaque flat fill, `unknown` is
   * anything else (an image, a gradient, a translucent fill, a chart, a badge), null is nothing
   * (a text).
   */
  cover(
    stateKey: string,
    el: Readonly<Record<string, unknown>>
  ): { kind: 'solid'; fill: string } | { kind: 'unknown' } | null;
}

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
/** Breaking whitespace only: a no-break or narrow no-break space (\u00a0, \u202f) joins "73 %" into one word. */
const BREAKING_SPACE = /[ \t\n\r\f\v\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+/;
const words = (text: string): number => text.split(BREAKING_SPACE).filter(Boolean).length;
const fmt = (n: number): string => String(Math.round(n * 100) / 100);

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
      if (maxChars !== undefined && [...text].length > maxChars) {
        problem(
          'budget',
          `placeholder of ${id} has ${[...text].length} characters, over maxChars ${maxChars}`
        );
      }
      if (maxWords !== undefined && words(text) > maxWords) {
        problem(
          'budget',
          `placeholder of ${id} has ${words(text)} words, over maxWords ${maxWords}`
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
          const result = instantiateTemplatePage(t, {
            brand: placedBrand,
            canvas,
            format,
            geometry: ctx.adapter.geometry,
            schemeId,
            logoSizeOf: () => GATE_LOGO_SIZE,
          });
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
    // A text of unknown width cannot be placed against any frame: fail closed.
    if (box && text && !(box.width > 0)) {
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
    // The ground: the badge's own fill, else the topmost layer below the text that overlaps
    // it (it must hold the whole box), else the page background.
    let ground: string | null = text.ground ?? null;
    if (ground === null) {
      const at = order.indexOf(id);
      if (!box || at === -1) {
        fail(`${NOT_DETERMINABLE} (the text is not in layerOrder)`);
        continue;
      }
      ground = typeof state['backgroundColor'] === 'string' ? state['backgroundColor'] : '';
      for (const belowId of order.slice(0, at).reverse()) {
        const below = placed.get(belowId);
        // The logo is owned by logo-overlap; a text on it is reported there.
        if (below && below.key === 'userImageInstances' && isLogo(below.el)) continue;
        const cover = below && ctx.adapter.cover(below.key, below.el);
        if (!below || !cover) continue;
        const area = ctx.adapter.box(below.key, below.el, 1);
        if (!area) {
          // An element of unknown extent could lie under the text.
          if (cover.kind === 'unknown') ground = null;
          if (cover.kind === 'unknown') break;
          continue;
        }
        if (!overlaps(box, area)) continue;
        // Only a shape holding the whole text box is its ground; one that covers part of it
        // puts the text on two grounds (or an edge), which is not judged by either.
        ground = cover.kind === 'solid' && inside(box, area) ? cover.fill : null;
        break;
      }
    }
    if (ground === null || !opaque(ground)) {
      fail(`${NOT_DETERMINABLE} under ${text.fill}`);
      continue;
    }
    const ratio = contrastRatio(text.fill, ground);
    const large = text.fontSize >= (text.bold ? 18.67 : 24) * (short / 1080);
    const need = large ? LARGE_TEXT_CONTRAST : TEXT_CONTRAST;
    if (ratio === null || ratio < need) {
      fail(
        `${text.fill} on ${ground} is ${ratio === null ? 'unreadable' : fmt(ratio)}, needs ${need}`
      );
    }
  }
}
