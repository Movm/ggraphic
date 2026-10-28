// SPDX-License-Identifier: MPL-2.0
import { type BrandPack } from '../brand/brandPack.js';
import { brandLayout, logoEnvelope, LOGO_CORNERS, safeArea } from '../brand/layout.js';
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
  /** stateKey → fields that may carry a colour binding. */
  colorFields: Readonly<Record<string, readonly string[]>>;
  /** The box an element covers in canvas px, or null if it has none. `lines` is a text's line count. */
  box(stateKey: string, el: Readonly<Record<string, unknown>>, lines: number): Box | null;
  text(
    stateKey: string,
    el: Readonly<Record<string, unknown>>
  ): { fill: string; fontSize: number; bold: boolean } | null;
  fill(stateKey: string, el: Readonly<Record<string, unknown>>): string | null;
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
  /** `schema` is not raised here: the caller reports a file that does not read under it. */
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
const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const fmt = (n: number): string => String(Math.round(n * 100) / 100);

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
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
 * (identical findings on other brands, worlds and formats are listed once).
 */
export function checkTemplate(t: TemplateInput, ctx: GateContext): GateProblem[] {
  const out: GateProblem[] = [];
  const seen = new Set<string>();
  const add = (p: GateProblem) => {
    const key = `${p.rule}|${p.detail}`;
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
    for (const field of ctx.adapter.colorFields[key] ?? []) {
      const value = el[field];
      if (typeof value === 'string' && parseColor(value) && !bound(id, el, field)) {
        problem('unbound-colour', `${id}.${field} holds ${value} with no bind and no fixed entry`);
      }
    }
    const src = el['src'];
    if (typeof src === 'string' && src !== '' && !isLogo(el) && !ctx.manifestPaths.has(src)) {
      problem('asset-licence', `${id}.src "${src}" is not in the pack manifest`);
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
        for (const corner of LOGO_CORNERS) {
          const layout = { ...brandLayout(brand), logoCorner: corner };
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
  const lines = (id: string) => ctx.slots[id]?.budget.maxLines ?? 1;

  for (const [id, { el, key }] of placed) {
    const box = ctx.adapter.box(key, el, lines(id));
    if (!box) continue;
    const frame = t.frames?.[id] ?? 'safe';
    if (!inside(box, frames[frame])) {
      problem(
        'bounds',
        `${id} leaves the ${frame} frame: box ${fmt(box.x)},${fmt(box.y)} ${fmt(box.width)}×${fmt(box.height)}`,
        where
      );
    }
    const text = ctx.adapter.text(key, el);
    if (!text) continue;
    if (envelope && intersects(box, envelope)) {
      problem('logo-overlap', `${id} runs into the logo envelope at ${corner}`, where);
    }
    // contrast: the topmost shape below the text that holds its centre, else the page background.
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    let ground = typeof state['backgroundColor'] === 'string' ? state['backgroundColor'] : '';
    for (const belowId of order.slice(0, order.indexOf(id)).reverse()) {
      const below = placed.get(belowId);
      if (!below) continue;
      const fill = ctx.adapter.fill(below.key, below.el);
      const shape = fill === null ? null : ctx.adapter.box(below.key, below.el, 1);
      if (
        fill !== null &&
        shape &&
        cx >= shape.x &&
        cx <= shape.x + shape.width &&
        cy >= shape.y &&
        cy <= shape.y + shape.height
      ) {
        ground = fill;
        break;
      }
    }
    const ratio = contrastRatio(text.fill, ground);
    const large = text.fontSize >= (text.bold ? 18.67 : 24) * (short / 1080);
    const need = large ? LARGE_TEXT_CONTRAST : TEXT_CONTRAST;
    if (ratio === null || ratio < need) {
      problem(
        'contrast',
        `${id}: ${text.fill} on ${ground || 'no ground'} is ${ratio === null ? 'unreadable' : fmt(ratio)}, needs ${need}`,
        where
      );
    }
  }
}
