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
/** Plain vector markup only: nothing that runs, loads or links elsewhere. */
const UNSAFE_SVG =
  /<script|<foreignObject|<image|<iframe|<object|<embed|<!ENTITY|<!DOCTYPE|\son[a-z]+\s*=|javascript:|@import|url\(\s*["']?(?!#)|(?:xlink:)?href\s*=\s*["']?(?!#)/i;
const MAX_SVG_CHARS = 64 * 1024;

interface Entry {
  def: IconDef;
  svg: string;
}

const registry = new Map<string, Entry>();
let version = 0;

export const externalIconId = (prefix: string, name: string): string =>
  `${NAMESPACE}${prefix}:${name}`;

export const isExternalIconId = (id: string): boolean => id.startsWith(NAMESPACE);

/** Bumps whenever the registry changes; lets a cache of derived views know. */
export const externalIconsVersion = (): number => version;

export function isPlainSvg(svg: unknown): svg is string {
  return (
    typeof svg === 'string' &&
    svg.length <= MAX_SVG_CHARS &&
    /^\s*<svg[\s>]/.test(svg) &&
    !UNSAFE_SVG.test(svg)
  );
}

const formatName = (name: string) =>
  name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export function registerExternalIcon(id: string, svg: string, source: IconSource | null): void {
  if (!isExternalIconId(id) || !isPlainSvg(svg)) return;
  if (registry.get(id)?.svg === svg) return;
  const name = source?.name ?? id.slice(id.lastIndexOf(':') + 1);
  registry.set(id, {
    svg,
    def: { id, name: formatName(name), library: source?.setTitle ?? 'Iconify' },
  });
  version++;
}

export function getExternalIcon(id: string): Entry | null {
  return registry.get(id) ?? null;
}

/** The registered icons by catalog id, for the renderer's lookup map. */
export function externalIconDefs(): Record<string, IconDef> {
  return Object.fromEntries([...registry].map(([id, entry]) => [id, entry.def]));
}

/** Test seam: forget every registered icon. */
export function resetExternalIcons(): void {
  registry.clear();
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

/** The SVG as a data URL of `size` px, `currentColor` replaced by `color`, for the canvas. */
export function externalIconDataUrl(svg: string, size: number, color: string): string {
  const sized = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const rest = attrs.replace(/\s(?:width|height)="[^"]*"/gi, '');
    return `<svg${rest} width="${size}" height="${size}">`;
  });
  return `data:image/svg+xml;base64,${toBase64(sized.replace(/currentColor/g, color))}`;
}

/** "Icon: <set> by <author>, <licence>" for the picker and for credits. */
export function attributionLine(source: IconSource): string {
  const by = source.author ? ` by ${source.author}` : '';
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

/**
 * The credit line for the icons of a design: only licences that ask for
 * attribution (CC BY), each set once. Empty when none does.
 */
export function iconCreditLine(sources: readonly IconSource[]): string {
  const seen = new Set<string>();
  const sets: IconSource[] = [];
  for (const source of sources) {
    const key = `${source.prefix}\0${source.licence}`;
    if (!/^CC-BY(-|$)/i.test(source.licence) || seen.has(key)) continue;
    seen.add(key);
    sets.push(source);
  }
  const [only] = sets;
  if (!only) return '';
  if (sets.length === 1) return attributionLine(only);
  const names = sets.map(
    (s) => `${s.setTitle}${s.author ? ` by ${s.author}` : ''} (${s.licence})`
  );
  return `Icons: ${names.join(', ')}`;
}
