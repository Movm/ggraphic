// SPDX-License-Identifier: MPL-2.0
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

import { sanitizeSvg } from '@ggraphic/schema';

import type { IconDef } from './canvasIcons.js';

/** Where a placed icon came from; the licence and author are shown and stored. */
export interface IconSource {
  kind: 'iconify';
  prefix: string;
  name: string;
  setTitle: string;
  licence: string;
  author: string;
}

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

/** A short non-cryptographic hash (cyrb53): enough to tell two markups apart. */
function shortHash(text: string): string {
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
  return clean === null ? null : `${id}@${shortHash(clean)}`;
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
  const key = `${id}@${shortHash(clean)}`;
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

const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(\s*[\d.%\s,/-]+\)|[a-z]{3,30})$/i;

/** A colour that cannot break out of an attribute: hex, rgb(a), hsl(a) or a name. */
const isSafeColor = (color: string) => SAFE_COLOR.test(color);

/** The SVG as a data URL of `size` px, `currentColor` replaced by `color`, for the canvas. */
export function externalIconDataUrl(svg: string, size: number, color: string): string {
  const ink = isSafeColor(color) ? color : '#000000';
  const sized = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const rest = attrs.replace(/\s(?:width|height)="[^"]*"/gi, '');
    return `<svg${rest} width="${size}" height="${size}">`;
  });
  return `data:image/svg+xml;base64,${toBase64(sized.replace(/currentColor/g, () => ink))}`;
}

/** "Icon: <Set> von <Autor>, <Lizenz>" for the picker. German, like the photo credit line. */
export function attributionLine(source: IconSource): string {
  const by = source.author ? ` von ${source.author}` : '';
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
    const by = source.author ? ` von ${source.author}` : '';
    entries.push(
      `${source.setTitle}${by} (${source.licence}, https://spdx.org/licenses/${encodeURIComponent(source.licence)}.html)`
    );
  }
  if (entries.length === 0) return '';
  return `${entries.length > 1 ? 'Icons' : 'Icon'}: ${entries.join(', ')}`;
}
