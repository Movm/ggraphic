// SPDX-License-Identifier: MPL-2.0
import { useCanvasEditorServices } from '../../../CanvasEditorProvider.js';
import type { CanvasIconHit } from '../../../hostServices.js';
import { useMessages } from '../../../i18n/messages.js';
import { cn } from '../../../utils/cn.js';
import {
  attributionLine,
  cleanIconSvg,
  externalIconId,
  type ExternalIconPayload,
  type IconSource,
} from '../../../utils/externalIcons.js';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const SEARCH_STALE_MS = 5 * 60 * 1000;

function sourceOf(hit: CanvasIconHit): IconSource {
  return {
    kind: 'iconify',
    prefix: hit.prefix,
    name: hit.name,
    setTitle: hit.setTitle,
    licence: hit.licence,
    author: hit.author,
  };
}

/**
 * Icons from the host's icon search under a search query: a grid of hits, and
 * for the selected one its set, author and licence with an insert button. The
 * SVG is fetched on insert and handed to `onAdd`, which stores a copy in the
 * design. Renders nothing when the host has no `iconSearch`.
 *
 * `full` is the per-page icon limit when it is reached; inserting is then off.
 */
export function IconifyCatalog({
  query,
  onAdd,
  full = null,
}: {
  query: string;
  onAdd: (id: string, payload: ExternalIconPayload) => void;
  full?: number | null;
}) {
  const t = useMessages().sidebar.elements.iconify;
  const { iconSearch } = useCanvasEditorServices();
  const term = query.trim();
  const enabled = iconSearch !== undefined && term.length > 0;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['canvas', 'iconify-search', term],
    queryFn: ({ signal }) => (iconSearch ? iconSearch.search(term, signal) : Promise.resolve([])),
    enabled,
    staleTime: SEARCH_STALE_MS,
  });
  const [selected, setSelected] = useState<CanvasIconHit | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeFailed, setPlaceFailed] = useState(false);
  // Tiles are CSS masks, which cannot report a failed load; each tile probes its own image.
  const [failedTiles, setFailedTiles] = useState<ReadonlySet<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  // The wait the host asked for before another attempt, as an end time, and a ticking clock.
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (waitUntil === null) return undefined;
    const id = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= waitUntil) setWaitUntil(null);
    }, 500);
    return () => window.clearInterval(id);
  }, [waitUntil]);

  if (!iconSearch || !enabled) return null;
  const waitSeconds = waitUntil === null ? 0 : Math.max(0, Math.ceil((waitUntil - now) / 1000));
  const retry = async () => {
    setRefreshing(true);
    let wait: number | null = null;
    try {
      wait = iconSearch.refresh ? (await iconSearch.refresh(term)).retryAfterSeconds : null;
    } catch {
      wait = null;
    }
    setRefreshing(false);
    if (wait !== null && wait > 0) {
      // One reading of the clock: two would put the end a little past the wait, shown as 8 s for 7.
      const start = Date.now();
      setNow(start);
      setWaitUntil(start + wait * 1000);
      return;
    }
    setFailedTiles(new Set());
    setAttempt((n) => n + 1);
  };
  const hits = data ?? [];
  const current = selected && hits.some((h) => same(h, selected)) ? selected : null;

  const insert = async () => {
    if (!current || placing || full !== null) return;
    setPlacing(true);
    setPlaceFailed(false);
    try {
      // The design keeps a copy; it is rebuilt from an allowlist first, whatever the host sent.
      const svg = cleanIconSvg(await iconSearch.svg(current.prefix, current.name));
      if (svg === null) throw new Error('unsafe svg');
      onAdd(externalIconId(current.prefix, current.name), { svg, source: sourceOf(current) });
    } catch {
      setPlaceFailed(true);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <section aria-label={t.heading} className="flex flex-col gap-2.5 w-full">
      <h4 className="m-0 text-sm font-bold text-[var(--editor-text)]">{t.heading}</h4>

      {isLoading && (
        <p role="status" className="m-0 text-xs text-[var(--editor-text-muted)]">
          {t.searching}
        </p>
      )}
      {isError && (
        <p role="alert" className="m-0 text-xs text-editor-danger-fg">
          {t.error}
        </p>
      )}
      {!isLoading && !isError && hits.length === 0 && (
        <p role="status" className="m-0 text-xs text-[var(--editor-text-muted)]">
          {t.none}
        </p>
      )}

      {hits.some((h) => failedTiles.has(`${h.prefix}:${h.name}`)) && (
        <div role="alert" className="flex items-center gap-2 text-xs text-editor-danger-fg">
          <span>{waitSeconds > 0 ? t.busy(waitSeconds) : t.tilesFailed}</span>
          <button
            type="button"
            disabled={waitSeconds > 0 || refreshing}
            onClick={() => void retry()}
            className="h-7 px-2 rounded-md border border-[var(--editor-border-strong)] bg-transparent text-xs text-[var(--editor-text)] cursor-pointer hover:bg-[var(--editor-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
          >
            {t.retry}
          </button>
        </div>
      )}

      {hits.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
          {hits.map((hit) => {
            const isOn = current !== null && same(hit, current);
            return (
              <button
                key={`${hit.prefix}:${hit.name}`}
                type="button"
                aria-pressed={isOn}
                title={`${hit.name} (${hit.setTitle})`}
                onClick={() => {
                  setSelected(hit);
                  setPlaceFailed(false);
                }}
                className={cn(
                  'aspect-square grid place-items-center rounded-lg border-[1.5px] cursor-pointer bg-[var(--editor-tile)] text-[var(--editor-text)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]',
                  isOn ? 'border-[var(--editor-accent)]' : 'border-transparent'
                )}
              >
                <span className="sr-only">{`${hit.name} ${hit.setTitle}`}</span>
                <IconPreview
                  key={attempt}
                  url={iconSearch.previewUrl(hit.prefix, hit.name)}
                  onFail={() =>
                    setFailedTiles((prev) => new Set(prev).add(`${hit.prefix}:${hit.name}`))
                  }
                />
              </button>
            );
          })}
        </div>
      )}

      {current && (
        // Sticks to the panel's lower edge: below up to 60 tiles it would be out of view.
        <div className="sticky bottom-0 flex flex-col gap-2 py-2 bg-[var(--editor-surface)]">
          <p className="m-0 text-[11px] text-[var(--editor-text-muted)]">
            {attributionLine(sourceOf(current))}
          </p>
          {full !== null && (
            <p className="m-0 text-[11px] text-[var(--editor-text-muted)]">{t.full(full)}</p>
          )}
          {placeFailed && (
            <p role="alert" className="m-0 text-xs text-editor-danger-fg">
              {t.insertError}
            </p>
          )}
          <button
            type="button"
            disabled={placing || full !== null}
            onClick={() => void insert()}
            className="h-9 rounded-md border border-[var(--editor-border-strong)] bg-transparent text-sm text-[var(--editor-text)] cursor-pointer hover:bg-[var(--editor-surface-hover)] disabled:opacity-60 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
          >
            {placing ? t.inserting : t.insert}
          </button>
        </div>
      )}
    </section>
  );
}

const same = (a: CanvasIconHit, b: CanvasIconHit) => a.prefix === b.prefix && a.name === b.name;

/** One tile image: loaded once to learn whether it can be served, then masked from the cache. */
function IconPreview({ url, onFail }: { url: string; onFail: () => void }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setLoaded(true);
    probe.onerror = onFail;
    probe.src = url;
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
    // `onFail` is a fresh closure per render; the probe belongs to the url alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return (
    <span
      aria-hidden
      className={cn('block size-[30px]', loaded ? 'bg-current' : 'bg-[var(--editor-border)]')}
      style={loaded ? maskStyle(url) : undefined}
    />
  );
}

/** The icon as a mask over `currentColor`, so it follows the editor's text colour. */
function maskStyle(url: string) {
  const mask = `url("${url}") center / contain no-repeat`;
  return { mask, WebkitMask: mask };
}
