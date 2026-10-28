// SPDX-License-Identifier: AGPL-3.0-only
// Icon search through an Iconify API (api.iconify.design or the operator's own).
// The host is operator config, fixed; users only send a search term and icon names.
import { sanitizeSvg } from '@ggraphic/schema';
import type { IconifyConfig } from './config.ts';
import { HttpError } from './http.ts';

const PREFIX_OR_NAME = /^[a-z0-9-]+$/;

/** Upstream body caps: the licence table is ~100 KB today, a search a few KB, an icon ~1 KB. */
const MAX_COLLECTIONS_BYTES = 1024 * 1024;
const MAX_SEARCH_BYTES = 256 * 1024;
const MAX_SVG_BYTES = 64 * 1024;
/**
 * A batch answer is capped per request (names per chunk x the single-icon cap, so heavy sets such
 * as emoji still fit) and in total per search, so a hostile or broken upstream stays bounded.
 */
const BATCH_CHUNK = 16;
const MAX_BATCH_TOTAL_BYTES = 4 * 1024 * 1024;
const BATCH_CONCURRENCY = 4;
/** Background warms of cached searches running at once, across all searches. */
const MAX_BACKGROUND_WARMS = 4;

/** How long we stay off a rate-limiting upstream when it names no Retry-After. */
const DEFAULT_RETRY_AFTER_S = 10;
const MAX_RETRY_AFTER_S = 60;

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

const rateLimitedError = (retryAfter: number) =>
  new HttpError(
    429,
    {
      error: 'iconify_rate_limited',
      message: 'The icon service is busy. Try again in a moment.',
    },
    retryAfter
  );

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

interface BatchIcon {
  body?: unknown;
  width?: unknown;
  height?: unknown;
  left?: unknown;
  top?: unknown;
  hFlip?: unknown;
  vFlip?: unknown;
  rotate?: unknown;
}

interface BatchAnswer extends BatchIcon {
  icons: Record<string, BatchIcon | undefined>;
}

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** The SVG for one icon of a `/{prefix}.json` answer, or null when it needs more than that. */
function batchIconSvg(set: BatchAnswer, icon: BatchIcon | undefined): string | null {
  if (!icon || typeof icon.body !== 'string') return null;
  // Flips and rotations are what the single route's own rendering handles.
  if (icon.hFlip || icon.vFlip || icon.rotate) return null;
  const left = num(icon.left, num(set.left, 0));
  const top = num(icon.top, num(set.top, 0));
  const width = num(icon.width, num(set.width, 16));
  const height = num(icon.height, num(set.height, 16));
  return sanitizeSvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="${left} ${top} ${width} ${height}">${icon.body}</svg>`
  );
}

export interface IconifyClient {
  /**
   * `refresh` waits for the batch retry on a cached search (the Retry-After the route reports
   * needs its outcome); otherwise a cached answer returns at once and warms in the background.
   */
  search(
    query: string,
    limit: number,
    prefix: string | null,
    options?: { refresh?: boolean }
  ): Promise<IconSearchResult>;
  svg(prefix: string, name: string): Promise<string>;
  /** Seconds the upstream asked us to stay away for; 0 when we may call it. */
  cooldownSeconds(): number;
}

export function isIconToken(value: string): boolean {
  return PREFIX_OR_NAME.test(value);
}

export function createIconifyClient(
  config: IconifyConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
  /** Test seam: called with the bytes reserved from the batch budgets after every change. */
  onBudget?: (held: number) => void
): IconifyClient {
  let heldBytes = 0;
  const hold = (delta: number) => {
    heldBytes += delta;
    onBudget?.(heldBytes);
  };
  const allowedLicences = new Set(config.licences.map((l) => l.toLowerCase()));
  const cache = new TtlCache<unknown>(CACHE_ENTRIES, now);
  let sets: { allowed: Map<string, SetInfo>; expires: number } | null = null;
  let pendingSets: Promise<Map<string, SetInfo>> | null = null;

  // While the upstream rate-limits us, nothing goes out: every extra call only extends it.
  let blockedUntil = 0;
  const cooldownLeft = () => Math.ceil((blockedUntil - now()) / 1000);

  const failed = (error: unknown) => {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    // The cause class only: URLs, hosts and bodies stay out of the log.
    console.warn(`iconify request failed: ${timedOut ? 'timeout' : (error as Error).name}`);
    return timedOut ? timeoutError() : upstreamError();
  };

  /** One bounded GET against the configured host; null for a 404. */
  async function get(
    path: string,
    maxBytes: number
  ): Promise<{ body: Buffer; type: string } | null> {
    if (cooldownLeft() > 0) throw rateLimitedError(cooldownLeft());
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
    if (response.status === 429) {
      console.warn('iconify answered HTTP 429');
      const asked = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      const wait = Math.min(
        MAX_RETRY_AFTER_S,
        Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_RETRY_AFTER_S
      );
      blockedUntil = now() + wait * 1000;
      await response.body?.cancel().catch(() => undefined);
      throw rateLimitedError(wait);
    }
    if (!response.ok) {
      console.warn(`iconify answered HTTP ${response.status}`);
      await response.body?.cancel().catch(() => undefined);
      throw upstreamError();
    }
    // Read in chunks and give up at the limit, whatever Content-Length says.
    const reader = response.body?.getReader();
    const declared = Number(response.headers.get('content-length') ?? 0) > maxBytes;
    if (!reader || declared) {
      await reader?.cancel().catch(() => undefined);
      throw declared ? Object.assign(upstreamError(), { oversized: true }) : upstreamError();
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
          throw Object.assign(upstreamError(), { oversized: true });
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw failed(error);
    }
    return { body: Buffer.concat(chunks), type: response.headers.get('content-type') ?? '' };
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
      const table = body ? json(body.body) : null;
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

  /**
   * The icons of a search in one request per set (`/{prefix}.json?icons=a,b`) instead of one per
   * tile, into the same cache the single route reads. Best effort: whatever this misses is
   * fetched singly when the tile asks. Everything passes `sanitizeSvg` like a single icon.
   *
   * Memory: a chunk reserves its byte cap from the total budget before it starts and gives back
   * what it did not read, and only `BATCH_CONCURRENCY` chunks run at once, so the bytes held
   * never exceed `MAX_BATCH_TOTAL_BYTES`. `unbatchable` collects names an upstream answer
   * covered but could not render (missing, flipped, rejected), so a repeat does not ask again;
   * names from a failed request are not added, those are worth another try.
   */
  async function warm(hits: IconHit[], unbatchable: Set<string>): Promise<void> {
    const byPrefix = new Map<string, string[]>();
    for (const { prefix, name } of hits) {
      const id = `${prefix}:${name}`;
      if (unbatchable.has(id) || cache.get(`svg\0${prefix}\0${name}`) !== undefined) continue;
      byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), name]);
    }
    const queue = [...byPrefix].flatMap(([prefix, names]) => {
      const chunks: [string, string[]][] = [];
      for (let i = 0; i < names.length; i += BATCH_CHUNK) {
        chunks.push([prefix, names.slice(i, i + BATCH_CHUNK)]);
      }
      return chunks;
    });
    let budget = MAX_BATCH_TOTAL_BYTES;
    const runChunk = async (prefix: string, names: string[]): Promise<void> => {
      const reserved = Math.min(names.length * MAX_SVG_BYTES, budget);
      if (reserved < MAX_SVG_BYTES) return;
      budget -= reserved;
      hold(reserved);
      let used = 0;
      try {
        const params = new URLSearchParams({ icons: names.join(',') });
        const body = await get(`/${prefix}.json?${params.toString()}`, reserved);
        if (body) used = body.body.length;
        // A set the upstream does not know, or an answer over the cap, will not get better.
        if (!body) {
          for (const name of names) unbatchable.add(`${prefix}:${name}`);
          return;
        }
        const set = json(body.body) as BatchAnswer;
        if (!set || typeof set.icons !== 'object' || set.icons === null) return;
        for (const name of names) {
          const svg = batchIconSvg(set, set.icons[name]);
          if (svg !== null) cache.set(`svg\0${prefix}\0${name}`, svg, SVG_TTL_MS);
          else unbatchable.add(`${prefix}:${name}`);
        }
      } catch (error) {
        if ((error as { oversized?: boolean }).oversized) {
          for (const name of names) unbatchable.add(`${prefix}:${name}`);
        }
        // The tiles fall back to single requests.
      } finally {
        budget += reserved - used;
        hold(-reserved);
      }
    };
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next; next = queue.shift()) await runChunk(...next);
    };
    await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, queue.length) }, worker));
  }

  /** Repeats of a cached search that are still warming, so they do not stack up. */
  const warming = new Set<string>();
  /** Runs a warm once per search key, and at most `MAX_BACKGROUND_WARMS` in the background. */
  function warmOnce(key: string, run: () => Promise<void>, background: boolean): Promise<void> {
    if (warming.has(key) || (background && warming.size >= MAX_BACKGROUND_WARMS)) {
      return Promise.resolve();
    }
    warming.add(key);
    return run().finally(() => warming.delete(key));
  }

  return {
    async search(rawQuery, limit, prefix, options) {
      // "Tree", " tree " and "tree" are one search.
      const query = rawQuery.trim().toLowerCase().replace(/\s+/g, ' ');
      const key = `search\0${query}\0${limit}\0${prefix ?? ''}`;
      const hit = cache.get(key) as
        { result: IconSearchResult; unbatchable: Set<string> } | undefined;
      if (hit) {
        // Icons a first attempt could not batch (rate limit) are fetched again, still in batches.
        const run = warmOnce(key, () => warm(hit.result.icons, hit.unbatchable), true);
        // A refresh waits for the retry; both share the per-search dedupe and the cap.
        if (options?.refresh) await run;
        return hit.result;
      }
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
      const answer = body ? (json(body.body) as { icons?: unknown; total?: unknown }) : null;
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
      const unbatchable = new Set<string>();
      cache.set(key, { result, unbatchable }, SEARCH_TTL_MS);
      await warmOnce(key, () => warm(icons, unbatchable), false);
      return result;
    },

    cooldownSeconds: () => Math.max(0, cooldownLeft()),

    async svg(prefix, name) {
      if (!(await allowedSets()).has(prefix)) throw notFound();
      const key = `svg\0${prefix}\0${name}`;
      const hit = cache.get(key) as string | undefined;
      if (hit) return hit;
      const body = await get(`/${prefix}/${name}.svg`, MAX_SVG_BYTES);
      if (!body) throw notFound();
      // Upstream must say it sends an SVG, and what it sends is rebuilt from an allowlist.
      const svg = /^image\/svg\+xml\b/i.test(body.type)
        ? sanitizeSvg(body.body.toString('utf8'))
        : null;
      if (svg === null) {
        console.warn('iconify answered no usable svg');
        throw upstreamError();
      }
      cache.set(key, svg, SVG_TTL_MS);
      return svg;
    },
  };
}
