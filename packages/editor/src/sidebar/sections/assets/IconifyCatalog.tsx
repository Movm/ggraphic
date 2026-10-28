// SPDX-License-Identifier: MPL-2.0
import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import type { CanvasIconHit } from '@ggraphic/editor/hostServices';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { cn } from '@ggraphic/editor/utils/cn';
import {
  attributionLine,
  cleanIconSvg,
  externalIconId,
  type ExternalIconPayload,
  type IconSource,
} from '@ggraphic/editor/utils/externalIcons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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

  if (!iconSearch || !enabled) return null;
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
                <span
                  aria-hidden
                  className="block size-[30px] bg-current"
                  style={maskStyle(iconSearch.previewUrl(hit.prefix, hit.name))}
                />
              </button>
            );
          })}
        </div>
      )}

      {current && (
        <div className="flex flex-col gap-2">
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

/** The icon as a mask over `currentColor`, so it follows the editor's text colour. */
function maskStyle(url: string) {
  const mask = `url("${url}") center / contain no-repeat`;
  return { mask, WebkitMask: mask };
}
