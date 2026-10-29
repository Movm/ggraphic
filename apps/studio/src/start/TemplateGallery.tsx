// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The template gallery: every template of the format as a tile with a live preview in the brand,
 * filtered by family, occasion and photo, with a colour world to pick per tile. Used by the start
 * page and by the page picker; what a pick does is the caller's.
 */
import { offeredSchemes, type BrandPack, type SchemeId } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { ChipGroup, Select, Tile, TileList } from '@ggraphic/ui';
import { useMemo, useState } from 'react';
import { PiFile } from 'react-icons/pi';

import { formatSize } from '../editor/document';
import { FAMILY_LABELS, templatesFor, type CatalogEntry } from '../editor/templates/catalog';
import { useTemplatePreview } from '../editor/templates/previews';

const ALL = 'all';
const PHOTO_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'with', label: 'With photo' },
  { value: 'without', label: 'Without photo' },
];

const capitalised = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);
const familyLabel = (slug: string) => FAMILY_LABELS[slug] ?? capitalised(slug);

export interface TemplateGalleryProps {
  formatId: string;
  /** A template was chosen, in the colour world its tile shows. */
  onPick: (entry: CatalogEntry, schemeId: SchemeId) => void;
  disabled?: boolean;
  /** Templates the organisation hid: left out, unless `canHide` (the owner sees them to show them again). */
  hiddenIds?: ReadonlySet<string>;
  canHide?: boolean;
  onToggleHidden?: (id: string, hidden: boolean) => void;
  showBlank?: boolean;
  onPickBlank?: () => void;
  /** The brand whose worlds decide what can be placed; default: the active one. */
  brand?: BrandPack;
  /** The world a tile starts in when its template offers it; otherwise the template's first. */
  defaultSchemeId?: SchemeId | null;
  /** The template the target page already holds: marked with `aria-current`. */
  currentTemplateId?: string | null;
}

interface TemplateTileProps {
  entry: CatalogEntry;
  formatId: string;
  ratio: string;
  worlds: readonly SchemeId[];
  defaultSchemeId: SchemeId | null;
  current: boolean;
  hidden: boolean;
  disabled: boolean;
  canHide: boolean;
  onPick: (entry: CatalogEntry, schemeId: SchemeId) => void;
  onToggleHidden?: (id: string, hidden: boolean) => void;
}

function TemplateTile({
  entry,
  formatId,
  ratio,
  worlds,
  defaultSchemeId,
  current,
  hidden,
  disabled,
  canHide,
  onPick,
  onToggleHidden,
}: TemplateTileProps) {
  const [chosen, setChosen] = useState<SchemeId | null>(null);
  const fallback = worlds.find((w) => w === defaultSchemeId) ?? worlds[0] ?? entry.schemes[0]!;
  const schemeId = chosen && worlds.includes(chosen) ? chosen : fallback;
  const { ref, src } = useTemplatePreview(entry, schemeId, formatId);
  return (
    <li className="studio-gallery__item" data-hidden={hidden ? 'true' : undefined}>
      <Tile
        disabled={disabled}
        ratio={ratio}
        aria-current={current ? 'true' : undefined}
        media={
          <span ref={ref} className="studio-gallery__media">
            {src ? (
              <img src={src} alt="" />
            ) : (
              <span className="studio-gallery__skeleton" aria-hidden="true" />
            )}
          </span>
        }
        title={entry.title}
        meta={entry.description}
        onClick={() => onPick(entry, schemeId)}
      />
      {worlds.length > 1 ? (
        <ChipGroup
          legend={`${entry.title} colour world`}
          size="sm"
          options={worlds.map((w) => ({ value: w, label: capitalised(w) }))}
          value={schemeId}
          onChange={setChosen}
          disabled={disabled}
        />
      ) : null}
      {canHide ? (
        <button
          type="button"
          className="studio-gallery__hide"
          aria-label={
            hidden ? `Show ${entry.title} in the gallery` : `Hide ${entry.title} from the gallery`
          }
          onClick={() => onToggleHidden?.(entry.id, !hidden)}
        >
          {hidden ? 'Show' : 'Hide'}
        </button>
      ) : null}
    </li>
  );
}

export function TemplateGallery({
  formatId,
  onPick,
  disabled = false,
  hiddenIds,
  canHide = false,
  onToggleHidden,
  showBlank = false,
  onPickBlank,
  brand,
  defaultSchemeId = null,
  currentTemplateId = null,
}: TemplateGalleryProps) {
  const [family, setFamily] = useState(ALL);
  const [occasion, setOccasion] = useState(ALL);
  const [photo, setPhoto] = useState('any');
  // Read at render: the brand is applied before a screen with a gallery renders, and a gallery
  // that can outlive a brand change is re-rendered by its owner (previews re-key on the brand).
  const worldsBrand = brand ?? activeBrand();
  const all = useMemo(() => templatesFor(formatId, worldsBrand), [formatId, worldsBrand]);
  const listed = useMemo(
    () => (canHide ? all : all.filter((e) => !hiddenIds?.has(e.id))),
    [all, canHide, hiddenIds]
  );
  const families = [...new Set(listed.map((e) => e.family))];
  const occasions = [...new Set(listed.flatMap((e) => e.occasions))];
  const shown = listed.filter(
    (e) =>
      (family === ALL || e.family === family) &&
      (occasion === ALL || e.occasions.includes(occasion)) &&
      (photo === 'any' || e.needsPhoto === (photo === 'with'))
  );
  const { width, height } = formatSize(formatId);
  const ratio = `${width} / ${height}`;

  return (
    <div className="studio-gallery">
      <div className="studio-gallery__filters">
        <ChipGroup
          legend="Family"
          size="sm"
          options={[
            { value: ALL, label: 'All' },
            ...families.map((f) => ({ value: f, label: familyLabel(f) })),
          ]}
          value={family}
          onChange={setFamily}
        />
        {occasions.length > 0 ? (
          <ChipGroup
            legend="Occasion"
            size="sm"
            options={[
              { value: ALL, label: 'Any occasion' },
              ...occasions.map((o) => ({ value: o, label: capitalised(o) })),
            ]}
            value={occasion}
            onChange={setOccasion}
          />
        ) : null}
        <Select
          label="Photo"
          className="studio-gallery__photo"
          options={PHOTO_OPTIONS}
          value={photo}
          onValueChange={setPhoto}
        />
      </div>
      <TileList aria-label="Templates">
        {showBlank ? (
          <li className="studio-gallery__item">
            <Tile
              disabled={disabled}
              ratio={ratio}
              media={
                <span className="studio-template-icon">
                  <PiFile aria-hidden />
                </span>
              }
              title="Blank"
              meta="An empty page on a solid ground"
              onClick={() => onPickBlank?.()}
            />
          </li>
        ) : null}
        {shown.map((entry) => (
          <TemplateTile
            key={entry.id}
            entry={entry}
            formatId={formatId}
            ratio={ratio}
            worlds={offeredSchemes(entry.template, worldsBrand)}
            defaultSchemeId={defaultSchemeId}
            current={entry.id === currentTemplateId}
            hidden={hiddenIds?.has(entry.id) ?? false}
            disabled={disabled}
            canHide={canHide}
            onPick={onPick}
            onToggleHidden={onToggleHidden}
          />
        ))}
      </TileList>
    </div>
  );
}
