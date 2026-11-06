// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Finds the font files behind a recorded text op's `FontSpec`, for the writers that draw glyph
 * outlines (SVG) or embed fonts (PDF).
 *
 * Sources, first one with a file wins: the host's `exportFonts` service, the brand pack's font
 * faces, then the page's own `@font-face` rules. A CSS family can come as several files, one per
 * `unicode-range`; `fileFor` picks the one that covers a code point. Nothing here is cached
 * between exports: the caller passes the `Map` it wants to share.
 */
import { type BrandFontFace } from '@ggraphic/core';

import { resolveFontFamily } from '../../utils/fontAliases.js';
import { loadFontkit, type FontkitFont, type FontkitFsType } from './glyphs.js';

import type { CanvasExportFontService } from '../../hostServices.js';
import type { FontSpec } from '../scene/types.js';

export interface FontFile {
  bytes: Uint8Array;
  font: FontkitFont;
  /** What the font's licence flags allow; see `embeddingOf`. */
  embeddable: 'yes' | 'outlines-only' | 'bitmap-only';
  /** The `unicode-range` the stylesheet declared for the file; null = the whole font. */
  ranges: readonly [number, number][] | null;
}

export interface FontFileSet {
  face: FontSpec;
  /** In declaration order; empty when no source has the face. */
  files: readonly FontFile[];
  /**
   * The file that draws `codePoint`, or null. A file covers a code point only if its declared
   * range includes it AND the font has a glyph for it: the glyph check alone is not enough for a
   * file that claims a range it does not fully cover, and the range alone is not enough because
   * fontkit silently answers `.notdef`. Where ranges overlap the later file wins, as in a browser.
   */
  fileFor(codePoint: number): FontFile | null;
}

/** The members of `CSSFontFaceRule` the resolver reads, so a test needs no DOM. */
export interface FontFaceRuleLike {
  style: { getPropertyValue(name: string): string };
}

export interface FontSourceDeps {
  host?: CanvasExportFontService;
  brandFaces?: readonly BrandFontFace[];
  /** `BrandFonts.boldFamilies`: regular family → the family whose regular cut is its bold. */
  boldFamilies?: Readonly<Record<string, string>>;
  /** Default: the `@font-face` rules of `document.styleSheets` (none without a document). Injected in tests. */
  cssRules?: () => Iterable<FontFaceRuleLike>;
  /** Default: `fetch`. A download that fails or answers an error status is a missing font. */
  fetchBytes?: (url: string) => Promise<Uint8Array | null>;
  /**
   * The files by `family|weight|style`, shared by the faces of one export. The caller creates it
   * and drops it with the export; there is no module-level cache.
   */
  cache?: Map<string, Promise<readonly FontFile[]>>;
}

export async function resolveFontFiles(face: FontSpec, deps: FontSourceDeps): Promise<FontFileSet> {
  const key = `${face.family}|${face.weight}|${face.style}`;
  let files = deps.cache?.get(key);
  if (!files) {
    files = loadFiles(face, deps);
    deps.cache?.set(key, files);
  }
  return fileSet(face, await files);
}

function fileSet(face: FontSpec, files: readonly FontFile[]): FontFileSet {
  return {
    face,
    files,
    fileFor(codePoint) {
      for (let i = files.length - 1; i >= 0; i--) {
        const file = files[i]!;
        if (covers(file, codePoint)) return file;
      }
      return null;
    },
  };
}

function covers(file: FontFile, codePoint: number): boolean {
  const inRange =
    file.ranges === null || file.ranges.some(([from, to]) => codePoint >= from && codePoint <= to);
  return inRange && file.font.hasGlyphForCodePoint(codePoint);
}

// ── Embedding permission ────────────────────────────────────────────────────

const FS_NO_EMBEDDING = 0x0002;
const FS_BITMAP_ONLY = 0x0200;

/**
 * What the licence flags of a font (`OS/2.fsType`) allow: 0x0002 (restricted licence) = its
 * outlines may be drawn but the font must not travel in the file; 0x0200 = only bitmaps may be
 * embedded. Preview/print, editable and no-subsetting (0x0004, 0x0008, 0x0100) allow embedding.
 * Takes the flag object fontkit decodes the field into as well as the raw number.
 */
export function embeddingOf(fsType: FontkitFsType): FontFile['embeddable'] {
  const bits =
    typeof fsType === 'number'
      ? fsType
      : (fsType.noEmbedding ? FS_NO_EMBEDDING : 0) | (fsType.bitmapOnly ? FS_BITMAP_ONLY : 0);
  if (bits & FS_BITMAP_ONLY) return 'bitmap-only';
  if (bits & FS_NO_EMBEDDING) return 'outlines-only';
  return 'yes';
}

// ── unicode-range ───────────────────────────────────────────────────────────

const MAX_CODE_POINT = 0x10ffff;

/**
 * The code point ranges of a CSS `unicode-range` value: `U+26`, `U+0-7F` and `U+4??`. Tokens
 * that are not a valid range are dropped.
 */
export function parseUnicodeRange(value: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const token of value.split(',')) {
    const match = /^\s*u\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?\s*$/i.exec(token);
    if (!match) continue;
    const start = match[1]!;
    const end = match[2];
    let range: [number, number];
    if (start.includes('?')) {
      if (end !== undefined) continue;
      range = [parseInt(start.replace(/\?/g, '0'), 16), parseInt(start.replace(/\?/g, 'f'), 16)];
    } else {
      const from = parseInt(start, 16);
      range = [from, end === undefined ? from : parseInt(end, 16)];
    }
    if (range[0] <= range[1] && range[1] <= MAX_CODE_POINT) ranges.push(range);
  }
  return ranges;
}

// ── Subset tag ──────────────────────────────────────────────────────────────

/**
 * The six capital letters a PDF font name carries before the `+` for a subset (`ABCDEF+Name`),
 * derived from the face and the index of the file in its set, so the same export names its
 * subsets the same way every time. pdf-lib's own default name has no such prefix.
 */
export function subsetTag(face: FontSpec, fileIndex: number): string {
  // FNV-1a, 32 bit, over the UTF-16 units of the key.
  const key = `${face.family}|${face.weight}|${face.style}|${fileIndex}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193) >>> 0;
  }
  let tag = '';
  for (let i = 0; i < 6; i++) {
    tag += String.fromCharCode(65 + (hash % 26));
    hash = Math.floor(hash / 26);
  }
  return tag;
}

// ── Candidates: where a face's files can come from ──────────────────────────

/** One file a source offers: which weights and style it serves, which urls hold its bytes. */
interface Candidate {
  /** The weights the file serves (equal for a static font, a range for a variable one). */
  low: number;
  high: number;
  style: 'normal' | 'italic';
  urls: string[];
  ranges: readonly [number, number][] | null;
}

async function loadFiles(face: FontSpec, deps: FontSourceDeps): Promise<readonly FontFile[]> {
  const family = bareFamily(resolveFontFamily(face.family));
  const boldFamily = face.weight >= 600 ? deps.boldFamilies?.[family] : undefined;
  const attempts = boldFamily
    ? [
        { family: boldFamily, weight: 400 },
        { family, weight: face.weight },
      ]
    : [{ family, weight: face.weight }];
  for (const attempt of attempts) {
    const files = await filesFor(attempt.family, attempt.weight, face.style, deps);
    if (files.length > 0) return files;
  }
  return [];
}

async function filesFor(
  family: string,
  weight: number,
  style: 'normal' | 'italic',
  deps: FontSourceDeps
): Promise<FontFile[]> {
  // The host's service is code we do not control: a throw is a font it does not have, the same
  // as a download that fails, and the next source is asked.
  let hosted: Uint8Array | null | undefined = null;
  try {
    hosted = await deps.host?.load({ family, weight, style });
  } catch {
    hosted = null;
  }
  if (hosted) {
    const file = await toFontFile(hosted, null);
    if (file) return [file];
  }
  const fetchBytes = deps.fetchBytes ?? fetchOverHttp;
  const fromBrand = await loadCandidates(
    pickCandidates(brandCandidates(deps.brandFaces ?? [], family), weight, style),
    fetchBytes
  );
  if (fromBrand.length > 0) return fromBrand;
  return loadCandidates(
    pickCandidates(cssCandidates((deps.cssRules ?? documentFontFaces)(), family), weight, style),
    fetchBytes
  );
}

function brandCandidates(faces: readonly BrandFontFace[], family: string): Candidate[] {
  const wanted = family.toLowerCase();
  return faces
    .filter((face) => face.family.toLowerCase() === wanted)
    .map((face) => ({
      low: face.weight ?? 400,
      high: face.weight ?? 400,
      style: face.style ?? 'normal',
      urls: [face.src],
      ranges: null,
    }));
}

function cssCandidates(rules: Iterable<FontFaceRuleLike>, family: string): Candidate[] {
  const wanted = family.toLowerCase();
  const candidates: Candidate[] = [];
  for (const rule of rules) {
    const declared = rule.style.getPropertyValue.bind(rule.style);
    if (bareFamily(declared('font-family')).toLowerCase() !== wanted) continue;
    const urls = readableUrls(declared('src'));
    if (urls.length === 0) continue;
    const [low, high] = parseWeights(declared('font-weight'));
    const ranges = parseUnicodeRange(declared('unicode-range'));
    candidates.push({
      low,
      high,
      style: /^\s*(italic|oblique)/i.test(declared('font-style')) ? 'italic' : 'normal',
      urls,
      ranges: ranges.length > 0 ? ranges : null,
    });
  }
  return candidates;
}

/**
 * The candidates serving the style and the weight closest to `weight`. A style is never traded
 * for a weight: a browser would slant an upright face, a writer cannot, so an italic nobody ships
 * is reported as missing.
 */
function pickCandidates(candidates: Candidate[], weight: number, style: 'normal' | 'italic') {
  const styled = candidates.filter((c) => c.style === style);
  const served = (c: Candidate) => Math.min(Math.max(weight, c.low), c.high);
  const best = nearestWeight(styled.map(served), weight);
  return styled.filter((c) => served(c) === best);
}

/**
 * CSS Fonts 4, "font matching": the exact weight; else for 400 to 500 the heavier weights up to
 * 500 (ascending), then the lighter ones (descending), then those above 500; below 400 the
 * lighter ones first, above 500 the heavier ones first, each followed by the other side.
 */
function nearestWeight(available: number[], target: number): number {
  if (available.length === 0 || available.includes(target)) return target;
  const lighter = available.filter((w) => w < target).sort((a, b) => b - a);
  const heavier = available.filter((w) => w > target).sort((a, b) => a - b);
  if (target > 500) return heavier[0] ?? lighter[0]!;
  if (target >= 400) return heavier.find((w) => w <= 500) ?? lighter[0] ?? heavier[0]!;
  return lighter[0] ?? heavier[0]!;
}

/** `normal`, `bold`, `700` or a variable-font range `100 900`. */
function parseWeights(value: string): [number, number] {
  const weights = value
    .trim()
    .split(/\s+/)
    .map((token) => (token === 'normal' ? 400 : token === 'bold' ? 700 : Number(token)))
    .filter((weight) => Number.isFinite(weight) && weight > 0);
  if (weights.length === 0) return [400, 400];
  return [Math.min(...weights), Math.max(...weights)];
}

async function loadCandidates(
  candidates: Candidate[],
  fetchBytes: (url: string) => Promise<Uint8Array | null>
): Promise<FontFile[]> {
  const files = await Promise.all(
    candidates.map(async (candidate) => {
      for (const url of candidate.urls) {
        const bytes = await fetchBytes(url).catch(() => null);
        const file = bytes && (await toFontFile(bytes, candidate.ranges));
        if (file) return file;
      }
      return null;
    })
  );
  return files.filter((file): file is FontFile => file !== null);
}

async function toFontFile(
  bytes: Uint8Array,
  ranges: readonly [number, number][] | null
): Promise<FontFile | null> {
  const font = await parseFont(bytes);
  if (!font) return null;
  return { bytes, font, embeddable: embeddingOf(font['OS/2']?.fsType ?? 0), ranges };
}

async function parseFont(bytes: Uint8Array): Promise<FontkitFont | null> {
  const fontkit = await loadFontkit();
  try {
    // Boundary cast: fontkit's shipped declarations lack what `FontkitFont` adds (see glyphs.ts).
    const font = fontkit.create(bytes) as unknown as FontkitFont;
    // A collection (TTC) answers `create` with its list of fonts rather than a font.
    return typeof font.glyphForCodePoint === 'function' ? font : null;
  } catch {
    return null;
  }
}

// ── CSS sources and the network ─────────────────────────────────────────────

/** `url(...)` entries of a `src` descriptor in a format fontkit reads, in order; `local()` is skipped. */
function readableUrls(src: string): string[] {
  const entry =
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)(?:\s*format\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\))?/gi;
  const urls: string[] = [];
  for (const match of src.matchAll(entry)) {
    const url = match[1] ?? match[2] ?? match[3] ?? '';
    const format = (match[4] ?? match[5] ?? match[6])?.toLowerCase().replace(/-variations$/, '');
    const readable = format
      ? ['woff2', 'woff', 'truetype', 'opentype'].includes(format)
      : !/\.(eot|svg)(?:[?#]|$)/i.test(url);
    if (url && readable) urls.push(url);
  }
  return urls;
}

/** The family without the quotes CSS allows around it. */
function bareFamily(family: string): string {
  return family.trim().replace(/^(['"])(.*)\1$/, '$2');
}

async function fetchOverHttp(url: string): Promise<Uint8Array | null> {
  const response = await fetch(url);
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
}

/**
 * The `@font-face` rules of every style sheet of the document, imports and grouping rules
 * included. The default of `FontSourceDeps.cssRules`; exported for its own test.
 */
export function* documentFontFaces(): Iterable<CSSFontFaceRule> {
  if (typeof document === 'undefined') return;
  for (const sheet of Array.from(document.styleSheets)) yield* fontFacesIn(sheet);
}

function* fontFacesIn(container: CSSStyleSheet | CSSGroupingRule): Iterable<CSSFontFaceRule> {
  let rules: CSSRuleList;
  try {
    rules = container.cssRules;
  } catch {
    return; // a cross-origin sheet without CORS hides its rules
  }
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSFontFaceRule) yield rule;
    else if (rule instanceof CSSImportRule) {
      if (rule.styleSheet) yield* fontFacesIn(rule.styleSheet);
    } else if (rule instanceof CSSGroupingRule) yield* fontFacesIn(rule);
  }
}
