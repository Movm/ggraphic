// SPDX-License-Identifier: AGPL-3.0-only
import { messages } from '../i18n/catalogue.js';
/**
 * Icons from a host's icon search (Iconify, say), as opposed to the sets the
 * editor bundles. A placed one is stored in the design as a COPY of its SVG
 * (`IconState.svg`) next to where it came from (`IconState.source`), so exports
 * and reloads work offline and no link can rot.
 *
 * This module is the in-memory registry the renderer reads. It carries no
 * `@iconify` import, so it works in the node lane like `iconInstances.ts`.
 * Catalog ids are namespaced (`iconify:<prefix>:<name>`), so they never collide
 * with the bundled sets.
 */

import { type IconSource } from '@ggraphic/core';
import { sanitizeSvg } from '@ggraphic/schema';

import type { IconDef } from './canvasIcons.js';

export { type IconSource } from '@ggraphic/core';

/** What a placed external icon adds to its `IconState`. */
export interface ExternalIconPayload {
  svg: string;
  source: IconSource;
}

const NAMESPACE = 'iconify:';

interface Entry {
  def: IconDef;
  svg: string;
}

/** Keyed by id AND content (`externalIconKey`), so one id with two markups is two icons. */
const registry = new Map<string, Entry>();
let version = 0;

export const externalIconId = (prefix: string, name: string): string =>
  `${NAMESPACE}${prefix}:${name}`;

export const isExternalIconId = (id: string): boolean => id.startsWith(NAMESPACE);

/** Bumps whenever the registry changes; lets a cache of derived views know. */
export const externalIconsVersion = (): number => version;

let hashOverride: ((text: string) => string) | null = null;

/** Test seam: force a hash function, to provoke collisions. `null` restores the real one. */
export function setIconHashForTest(fn: ((text: string) => string) | null): void {
  hashOverride = fn;
}

/** A short non-cryptographic hash (cyrb53): enough to tell two markups apart. */
function shortHash(text: string): string {
  return hashOverride ? hashOverride(text) : cyrb53(text);
}

function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Sanitising is the expensive part; a page redraws often, so remember the answers. */
const cleaned = new Map<string, string | null>();
const MAX_CLEANED = 500;

/** The sanitised markup, or null when it cannot be made safe. */
export function cleanIconSvg(svg: unknown): string | null {
  if (typeof svg !== 'string') return null;
  if (cleaned.has(svg)) return cleaned.get(svg) ?? null;
  const result = sanitizeSvg(svg);
  if (cleaned.size >= MAX_CLEANED) cleaned.clear();
  cleaned.set(svg, result);
  return result;
}

/**
 * The registry key of an icon: its catalog id plus a hash of its sanitised
 * markup (`iconify:lets:tree@1abc…`), or null when the markup is not safe.
 * Two documents can carry different markup for the same catalog id; the
 * content decides which icon is drawn, so neither changes the other's.
 */
export function externalIconKey(id: string, svg: unknown): string | null {
  const clean = cleanIconSvg(svg);
  return clean === null ? null : keyFor(id, clean);
}

/**
 * `id@hash`, unless that key already belongs to different markup: a collision. Then the
 * full markup is the key, so neither icon can stand in for the other.
 */
function keyFor(id: string, clean: string): string {
  const key = `${id}@${shortHash(clean)}`;
  const taken = registry.get(key);
  return taken && taken.svg !== clean ? `${id}@${clean}` : key;
}

const formatName = (name: string) =>
  name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** Registers the (sanitised) icon and returns its key; null when it is not an external icon or not safe. */
export function registerExternalIcon(
  id: string,
  svg: string,
  source: IconSource | null
): string | null {
  const clean = cleanIconSvg(svg);
  if (!isExternalIconId(id) || clean === null) return null;
  const key = keyFor(id, clean);
  if (registry.has(key)) return key;
  const name = source?.name ?? id.slice(id.lastIndexOf(':') + 1);
  registry.set(key, {
    svg: clean,
    def: { id: key, name: formatName(name), library: source?.setTitle ?? 'Iconify' },
  });
  version++;
  return key;
}

export function getExternalIcon(key: string): Entry | null {
  return registry.get(key) ?? null;
}

/** The registered icons by key, for the renderer's lookup map. */
export function externalIconDefs(): Record<string, IconDef> {
  return Object.fromEntries([...registry].map(([id, entry]) => [id, entry.def]));
}

/** Test seam: forget every registered icon. */
export function resetExternalIcons(): void {
  registry.clear();
  cleaned.clear();
  version++;
}

export interface StoredIcon {
  iconId?: string;
  svg?: string;
  source?: IconSource;
}

/**
 * Registers the SVG a document carries for each of its external icons, so the
 * renderer can draw them after a reload or on a collaborator's screen.
 */
export function registerStoredExternalIcons(
  selectedIcons: readonly string[] | undefined,
  iconStates: Record<string, StoredIcon> | undefined
): void {
  for (const instanceId of selectedIcons ?? []) {
    const state = iconStates?.[instanceId];
    const catalogId = state?.iconId ?? instanceId;
    if (state?.svg && isExternalIconId(catalogId)) {
      registerExternalIcon(catalogId, state.svg, state.source ?? null);
    }
  }
}

/** UTF-8 safe base64: `btoa` alone throws on anything beyond Latin-1. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const HEX_OR_NAME = /^(?:#[0-9a-f]{3,8}|[a-z]{3,30})$/;
/** `none`, or a number with an optional percent sign or angle unit: one channel of a colour. */
const CHANNEL = /^(?:none|[+-]?(?:\d+\.?\d*|\.\d+)(?:%|deg|grad|rad|turn)?)$/;
const COLOR_FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\((.*)\)$/;
const MIX_HEAD = /^in [a-z]+(?: (?:shorter|longer|increasing|decreasing) hue)?$/;
const MIX_PERCENT = /^(.*?)(?:\s+(?:\d+\.?\d*|\.\d+)%)?$/;
const MAX_LENGTH = 200;
const MAX_DEPTH = 3;

/** The top-level comma-separated parts of `args`, or null when the parentheses do not balance. */
function splitTopLevel(args: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return null;
    else if (c === ',' && depth === 0) {
      parts.push(args.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) return null;
  parts.push(args.slice(start));
  return parts;
}

function safeColor(color: string, depth: number): boolean {
  const value = color.trim();
  if (HEX_OR_NAME.test(value)) return true;
  const fn = COLOR_FUNCTION.exec(value);
  if (!fn || depth > MAX_DEPTH) return false;
  const [, name, args] = fn as unknown as [string, string, string];
  if (name === 'color-mix') {
    const parts = splitTopLevel(args);
    if (!parts || parts.length !== 3 || !MIX_HEAD.test(parts[0]!.trim())) return false;
    return parts.slice(1).every((part) => safeColor(MIX_PERCENT.exec(part.trim())![1]!, depth + 1));
  }
  // No nested function and no stray parenthesis: a plain list of channels.
  if (/[()]/.test(args)) return false;
  const tokens = args.split(/[\s,/]+/).filter(Boolean);
  if (name === 'color') {
    // `color(<space> c1 c2 c3 [/ alpha])`: the space is an identifier, e.g. `display-p3`.
    const [space, ...channels] = tokens;
    return (
      !!space &&
      /^[a-z][a-z0-9-]{1,30}$/.test(space) &&
      channels.length > 0 &&
      channels.every((t) => CHANNEL.test(t))
    );
  }
  return tokens.length >= 3 && tokens.length <= 4 && tokens.every((token) => CHANNEL.test(token));
}

/**
 * A colour that cannot break out of an attribute or reach for a resource: hex, a name, or one of
 * the CSS colour functions (rgb, hsl, hwb, lab, lch, oklab, oklch, color, color-mix) over plain
 * numbers, percentages and angles. Nothing else is parsed, so `url()`, `var()`, `calc()`,
 * quotes, semicolons and braces never get through. Case is folded first.
 */
export const isSafeColor = (color: string) => {
  // The caller writes `color` into markup as it is, so surrounding whitespace is not slack to trim.
  if (color !== color.trim()) return false;
  const value = color.toLowerCase();
  return value.length <= MAX_LENGTH && safeColor(value, 0);
};

/** The SVG as a data URL of `size` px, `currentColor` replaced by `color`, for the canvas. */
export function externalIconDataUrl(svg: string, size: number, color: string): string {
  const ink = isSafeColor(color) ? color : '#000000';
  const sized = svg.replace(/<svg\b([^>]*?)(\/?)>/i, (_match, attrs: string, close: string) => {
    const rest = attrs.replace(/\s(?:width|height)="[^"]*"/gi, '');
    return `<svg${rest} width="${size}" height="${size}"${close}>`;
  });
  return `data:image/svg+xml;base64,${toBase64(sized.replace(/currentColor/g, () => ink))}`;
}

/** "Icon: <Set> von <Autor>, <Lizenz>" for the picker; the "von" follows the catalogue. */
export function attributionLine(source: IconSource): string {
  const by = source.author ? messages().credit.by(source.author) : '';
  return `Icon: ${source.setTitle}${by}, ${source.licence}`;
}

/** The sources of the external icons on one page, one entry per placed instance. */
export function pageIconSources(state: Record<string, unknown>): IconSource[] {
  const selected = (state['selectedIcons'] as string[] | undefined) ?? [];
  const states = (state['iconStates'] as Record<string, StoredIcon> | undefined) ?? {};
  return selected.flatMap((id) => {
    const source = states[id]?.source;
    return source ? [source] : [];
  });
}

/** Public domain asks for no credit; every other licence (MIT, Apache, CC BY …) does. */
const NEEDS_NO_CREDIT = /^(CC0(-|$)|Unlicense$)/i;

/**
 * The credit line for the icons of a design, for the share text: every set
 * once, with its licence and a link to the licence text. Empty when none needs
 * one. German, like `photoCreditLine`.
 */
export function iconCreditLine(sources: readonly IconSource[]): string {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const source of sources) {
    const key = `${source.prefix}\0${source.licence}`;
    if (NEEDS_NO_CREDIT.test(source.licence) || seen.has(key)) continue;
    seen.add(key);
    const by = source.author ? messages().credit.by(source.author) : '';
    entries.push(
      `${source.setTitle}${by} (${source.licence}, https://spdx.org/licenses/${encodeURIComponent(source.licence)}.html)`
    );
  }
  if (entries.length === 0) return '';
  return `${entries.length > 1 ? 'Icons' : 'Icon'}: ${entries.join(', ')}`;
}
