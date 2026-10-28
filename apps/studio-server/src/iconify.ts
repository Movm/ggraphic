// SPDX-License-Identifier: AGPL-3.0-only
// Icon search through an Iconify API (api.iconify.design or the operator's own).
// The host is operator config, fixed; users only send a search term and icon names.
import type { IconifyConfig } from './config.ts';
import { HttpError } from './http.ts';

const PREFIX_OR_NAME = /^[a-z0-9-]+$/;

/** Upstream body caps: the licence table is ~100 KB today, a search a few KB, an icon ~1 KB. */
const MAX_COLLECTIONS_BYTES = 1024 * 1024;
const MAX_SEARCH_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 64 * 1024;

const COLLECTIONS_TTL_MS = 60 * 60 * 1000;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const SVG_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_ENTRIES = 500;

/** Iconify's search takes at least 32 results per request. */
const MIN_UPSTREAM_LIMIT = 32;

/**
 * Remix Icon is Apache-2.0 up to 4.8.0 and carries a non-open licence from 4.9.0 on. A set
 * that is Remix by prefix or name is offered only when its version is known and at most this.
 */
const REMIX_PINNED_VERSION = [4, 8, 0] as const;

/**
 * Font Awesome is out on purpose (the core removed it): `fa`, `fa-solid`, `fa6-brands`, `fa7-…`.
 * Matching the prefix keeps it out even if an upstream relabels its licence.
 */
const FONT_AWESOME_PREFIX = /^fa\d*(-|$)/;

export interface IconHit {
  prefix: string;
  name: string;
  setTitle: string;
  licence: string;
  author: string;
}

export interface IconSearchResult {
  icons: IconHit[];
  total: number;
}

interface SetInfo {
  setTitle: string;
  licence: string;
  author: string;
}

const upstreamError = () =>
  new HttpError(502, {
    error: 'iconify_upstream_error',
    message: 'The icon service failed.',
  });

const timeoutError = () =>
  new HttpError(504, {
    error: 'iconify_timeout',
    message: 'The icon service did not answer in time.',
  });

const notFound = () => new HttpError(404, { error: 'not_found' });

function versionAtMost(version: unknown, max: readonly number[]): boolean {
  if (typeof version !== 'string') return false;
  const parts = version.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return false;
  for (let i = 0; i < max.length; i++) {
    const have = parts[i] ?? 0;
    if (have !== max[i]) return have < max[i]!;
  }
  return true;
}

/** Small LRU with a time to live; Map keeps insertion order, so the first key is the oldest. */
class TtlCache<T> {
  readonly #entries = new Map<string, { value: T; expires: number }>();
  readonly #max: number;
  readonly #now: () => number;

  constructor(max: number, now: () => number) {
    this.#max = max;
    this.#now = now;
  }

  get(key: string): T | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.#entries.delete(key);
    this.#entries.set(key, { value, expires: this.#now() + ttlMs });
    if (this.#entries.size > this.#max) {
      const oldest = this.#entries.keys().next().value;
      if (oldest !== undefined) this.#entries.delete(oldest);
    }
  }
}

export interface IconifyClient {
  search(query: string, limit: number, prefix: string | null): Promise<IconSearchResult>;
  svg(prefix: string, name: string): Promise<string>;
}

export function isIconToken(value: string): boolean {
  return PREFIX_OR_NAME.test(value);
}

/** Only plain vector paths: nothing that runs, loads or links elsewhere. */
const UNSAFE_SVG =
  /<script|<foreignObject|<image|<iframe|<object|<embed|<!ENTITY|<!DOCTYPE|\son[a-z]+\s*=|javascript:|@import|url\(\s*["']?(?!#)|(?:xlink:)?href\s*=\s*["']?(?!#)/i;

export function createIconifyClient(
  config: IconifyConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): IconifyClient {
  const allowedLicences = new Set(config.licences.map((l) => l.toLowerCase()));
  const cache = new TtlCache<unknown>(CACHE_ENTRIES, now);
  let sets: { allowed: Map<string, SetInfo>; expires: number } | null = null;
  let pendingSets: Promise<Map<string, SetInfo>> | null = null;

  const failed = (error: unknown) => {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    // The cause class only: URLs, hosts and bodies stay out of the log.
    console.warn(`iconify request failed: ${timedOut ? 'timeout' : (error as Error).name}`);
    return timedOut ? timeoutError() : upstreamError();
  };

  /** One bounded GET against the configured host; null for a 404. */
  async function get(path: string, maxBytes: number): Promise<Buffer | null> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.url}${path}`, {
        // A redirect would send the request somewhere the operator did not configure.
        redirect: 'error',
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      throw failed(error);
    }
    if (response.status === 404) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (!response.ok) {
      console.warn(`iconify answered HTTP ${response.status}`);
      await response.body?.cancel().catch(() => undefined);
      throw upstreamError();
    }
    // Read in chunks and give up at the limit, whatever Content-Length says.
    const reader = response.body?.getReader();
    if (!reader || Number(response.headers.get('content-length') ?? 0) > maxBytes) {
      await reader?.cancel().catch(() => undefined);
      throw upstreamError();
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel().catch(() => undefined);
          console.warn('iconify answered more than the allowed size');
          throw upstreamError();
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw failed(error);
    }
    return Buffer.concat(chunks);
  }

  const json = (body: Buffer): unknown => {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      throw upstreamError();
    }
  };

  function offered(prefix: string, info: Record<string, unknown>): SetInfo | null {
    const license = info['license'] as { spdx?: unknown } | undefined;
    const spdx = typeof license?.spdx === 'string' ? license.spdx : null;
    // A set without a stated licence is never offered.
    if (!spdx || !allowedLicences.has(spdx.toLowerCase())) return null;
    const title = typeof info['name'] === 'string' ? info['name'] : prefix;
    if (FONT_AWESOME_PREFIX.test(prefix) || /font awesome/i.test(title)) return null;
    if (
      (prefix === 'ri' || /remix icon/i.test(title)) &&
      !versionAtMost(info['version'], REMIX_PINNED_VERSION)
    ) {
      return null;
    }
    const author = info['author'] as { name?: unknown } | undefined;
    return {
      setTitle: title,
      licence: spdx,
      author: typeof author?.name === 'string' ? author.name : '',
    };
  }

  /** Prefix → set info for every set whose licence Studio offers. Refreshed hourly. */
  function allowedSets(): Promise<Map<string, SetInfo>> {
    if (sets && sets.expires > now()) return Promise.resolve(sets.allowed);
    pendingSets ??= (async () => {
      const body = await get('/collections', MAX_COLLECTIONS_BYTES);
      const table = body ? json(body) : null;
      if (!table || typeof table !== 'object' || Array.isArray(table)) throw upstreamError();
      const allowed = new Map<string, SetInfo>();
      for (const [prefix, info] of Object.entries(table)) {
        if (!isIconToken(prefix) || !info || typeof info !== 'object') continue;
        const set = offered(prefix, info as Record<string, unknown>);
        if (set) allowed.set(prefix, set);
      }
      sets = { allowed, expires: now() + COLLECTIONS_TTL_MS };
      return allowed;
    })().finally(() => {
      pendingSets = null;
    });
    return pendingSets;
  }

  return {
    async search(query, limit, prefix) {
      const key = `search\0${query}\0${limit}\0${prefix ?? ''}`;
      const hit = cache.get(key) as IconSearchResult | undefined;
      if (hit) return hit;
      const allowed = await allowedSets();
      let prefixes = [...allowed.keys()];
      if (prefix) prefixes = prefixes.filter((p) => p === prefix);
      if (prefixes.length === 0) return { icons: [], total: 0 };
      const params = new URLSearchParams({
        query,
        limit: String(Math.max(MIN_UPSTREAM_LIMIT, limit)),
        prefixes: prefixes.join(','),
      });
      const body = await get(`/search?${params.toString()}`, MAX_SEARCH_BYTES);
      const answer = body ? (json(body) as { icons?: unknown; total?: unknown }) : null;
      if (!answer || !Array.isArray(answer.icons)) throw upstreamError();
      const icons: IconHit[] = [];
      for (const id of answer.icons) {
        if (typeof id !== 'string') continue;
        const [p, n, ...rest] = id.split(':');
        if (!p || !n || rest.length > 0 || !isIconToken(p) || !isIconToken(n)) continue;
        // The table decides, not the upstream's filter.
        const set = allowed.get(p);
        if (!set || (prefix && p !== prefix)) continue;
        icons.push({ prefix: p, name: n, ...set });
        if (icons.length === limit) break;
      }
      const result = {
        icons,
        total: typeof answer.total === 'number' ? answer.total : icons.length,
      };
      cache.set(key, result, SEARCH_TTL_MS);
      return result;
    },

    async svg(prefix, name) {
      if (!(await allowedSets()).has(prefix)) throw notFound();
      const key = `svg\0${prefix}\0${name}`;
      const hit = cache.get(key) as string | undefined;
      if (hit) return hit;
      const body = await get(`/${prefix}/${name}.svg`, MAX_SVG_BYTES);
      if (!body) throw notFound();
      const svg = body.toString('utf8').trim();
      if (!/^<svg[\s>]/.test(svg) || UNSAFE_SVG.test(svg)) {
        console.warn('iconify answered no plain svg');
        throw upstreamError();
      }
      cache.set(key, svg, SVG_TTL_MS);
      return svg;
    },
  };
}
