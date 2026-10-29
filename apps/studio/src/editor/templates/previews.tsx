// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Template previews, drawn on demand in the brand.
 *
 * A tile asks for its preview once it scrolls into view (`useTemplatePreview`).
 * Requests queue up; the one `PreviewHost` on the screen renders them one at a
 * time, offscreen, through the editor's own canvas (`PagePreview`), so a
 * preview is exactly what the page will look like and a long gallery never
 * holds more than one extra stage. The result is cached by `previewKey`, which
 * carries the brand's fingerprint: a changed brand asks again, an unchanged
 * one never does.
 */
import { type BrandPack, brandFingerprint, type SchemeId } from '@ggraphic/core';
import { PagePreview } from '@ggraphic/editor/components/PagePreview';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { type FullCanvasConfig } from '@ggraphic/editor/configs/types';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { FREE_PAGE_CONFIG_ID } from './ids';
import { type CatalogEntry } from './catalog';
import { templatePageState } from './instantiate';

/** Width of a rendered preview in px; a gallery tile shows it at most this wide. */
const PREVIEW_WIDTH = 480;
const CACHE_LIMIT = 200;
/** A job that has not reported by then is given up on, so the next one runs. */
const JOB_TIMEOUT_MS = 15_000;

export function previewKey(
  entry: CatalogEntry,
  schemeId: SchemeId,
  formatId: string,
  brand: BrandPack
): string {
  return `${entry.id}@${entry.version}|${schemeId}|${formatId}|${brandFingerprint(brand)}`;
}

export interface PreviewJob {
  key: string;
  entry: CatalogEntry;
  schemeId: SchemeId;
  formatId: string;
}

// Least recently used: a Map keeps insertion order, a read re-inserts.
const cache = new Map<string, string>();
const queue: PreviewJob[] = [];
const waiting = new Map<string, Set<(src: string | null) => void>>();
const hostListeners = new Set<() => void>();
let current: PreviewJob | null = null;

export function cachedPreview(key: string): string | null {
  const src = cache.get(key);
  if (src === undefined) return null;
  cache.delete(key);
  cache.set(key, src);
  return src;
}

function remember(key: string, src: string): void {
  cache.delete(key);
  cache.set(key, src);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

function emit(): void {
  hostListeners.forEach((listener) => listener());
}

function pump(): void {
  if (current || queue.length === 0) return;
  current = queue.shift()!;
  emit();
}

function finish(key: string, src: string | null): void {
  if (src) remember(key, src);
  const callbacks = waiting.get(key);
  waiting.delete(key);
  if (current?.key === key) current = null;
  callbacks?.forEach((callback) => callback(src));
  emit();
  pump();
}

/** Asks for a preview; `onDone` gets the image, or null when the page cannot be drawn. Returns the cancel. */
export function requestPreview(job: PreviewJob, onDone: (src: string | null) => void): () => void {
  const cached = cachedPreview(job.key);
  if (cached) {
    onDone(cached);
    return () => {};
  }
  let callbacks = waiting.get(job.key);
  if (!callbacks) {
    callbacks = new Set();
    waiting.set(job.key, callbacks);
    queue.push(job);
  }
  callbacks.add(onDone);
  pump();
  return () => {
    const rest = waiting.get(job.key);
    rest?.delete(onDone);
    // A queued job nobody waits for any more is dropped; a running one finishes into the cache.
    if (rest?.size === 0 && current?.key !== job.key) {
      waiting.delete(job.key);
      const at = queue.findIndex((queued) => queued.key === job.key);
      if (at >= 0) queue.splice(at, 1);
    }
  };
}

/** Empties the cache and the queue; for tests. */
export function resetPreviews(): void {
  cache.clear();
  queue.length = 0;
  waiting.clear();
  current = null;
  pageConfig = null;
  emit();
}

/** Gives up on the running job and every queued one; none of them is cached. */
function failAll(): void {
  while (current || queue.length > 0) finish(current ? current.key : queue.shift()!.key, null);
}

function subscribeHost(listener: () => void): () => void {
  hostListeners.add(listener);
  return () => hostListeners.delete(listener);
}
const currentJob = () => current;

let pageConfig: Promise<FullCanvasConfig> | null = null;
function loadPageConfig(): Promise<FullCanvasConfig> {
  // Boundary cast: the loader hands back the registry's config untyped.
  pageConfig ??= loadCanvasConfig(FREE_PAGE_CONFIG_ID) as Promise<FullCanvasConfig>;
  return pageConfig;
}

/** Mount once per screen: renders the queued previews one at a time, where nobody sees them. */
export function PreviewHost() {
  const job = useSyncExternalStore(subscribeHost, currentJob, currentJob);
  const [config, setConfig] = useState<FullCanvasConfig | null>(null);
  const hasJob = job !== null;
  // Loaded when the first job needs it; a failed load gives up on the waiting jobs
  // (a later request tries again) instead of leaving the queue stuck behind them.
  useEffect(() => {
    if (!hasJob || config) return;
    let live = true;
    loadPageConfig().then(
      (loaded) => live && setConfig(loaded),
      () => {
        pageConfig = null;
        if (live) failAll();
      }
    );
    return () => {
      live = false;
    };
  }, [hasJob, config]);

  const state = job ? templatePageState(job.entry, job.formatId, { schemeId: job.schemeId }) : null;
  const jobKey = job?.key ?? null;
  const unplaceable = job !== null && state === null;
  useEffect(() => {
    if (unplaceable && jobKey) finish(jobKey, null);
  }, [unplaceable, jobKey]);

  // A job that never reports must not hold the queue.
  useEffect(() => {
    if (!jobKey) return;
    const timer = setTimeout(() => finish(jobKey, null), JOB_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [jobKey]);

  if (!job || !state || !config) return null;
  return (
    // Offscreen and out of every tree a person or a screen reader walks.
    <div
      aria-hidden="true"
      inert
      style={{
        position: 'fixed',
        left: -10000,
        top: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <PagePreview
        key={job.key}
        config={config}
        state={state}
        formatId={job.formatId}
        width={PREVIEW_WIDTH}
        onRendered={(dataUrl) => finish(job.key, dataUrl)}
        onFailed={() => finish(job.key, null)}
      />
    </div>
  );
}

/** The preview of `entry` in the active brand; it is requested once the element of `ref` is on screen. */
export function useTemplatePreview(
  entry: CatalogEntry,
  schemeId: SchemeId,
  formatId: string
): { ref: React.RefCallback<HTMLElement>; src: string | null } {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState<{ key: string; src: string } | null>(null);
  const key = previewKey(entry, schemeId, formatId, activeBrand());
  const ref = useCallback((node: HTMLElement | null) => setElement(node), []);

  useEffect(() => {
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  useEffect(() => {
    if (!visible) return;
    return requestPreview({ key, entry, schemeId, formatId }, (src) => {
      if (src) setRendered({ key, src });
    });
  }, [visible, key, entry, schemeId, formatId]);

  // A preview of another brand is never shown for this one.
  return { ref, src: rendered?.key === key ? rendered.src : cachedPreview(key) };
}
