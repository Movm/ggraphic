// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The current organisation's brand pack: name, three colours (the other roles and the
 * grounds are derived), fonts and logo, with a live preview. Owners only; the server checks that too.
 */
import { Alert, Button, Card, Select, TextField } from '@ggraphic/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react';

import {
  api,
  ApiError,
  type BrandAsset,
  type BrandPackResponse,
  type BrandInput,
  type BrandSettings,
} from '../api/client';
import {
  aliasFontFamily,
  BRAND_LAYOUT_BOUNDS,
  clampBrandLayout,
  DEFAULT_BRAND_LAYOUT,
  deriveBrandColors,
  deriveGrounds,
  LOGO_CORNERS,
  type BrandLayout,
  type LogoCorner,
} from '@ggraphic/core';

import { studioBrand } from '../brand';
import { loadBrandFonts } from '../brandLoader';
import { useLoggedIn } from '../session/SessionContext';
import { PageShell, PageTitle } from '../ui/PageShell';
import { toast } from '../ui/toast';
import { BrandPreview } from './BrandPreview';

type InputRole = keyof BrandInput['colors'];

export const COLOR_INPUTS: readonly { role: InputRole; label: string; hint: string }[] = [
  { role: 'primary', label: 'Primary', hint: 'Main colour and default ground' },
  { role: 'secondary', label: 'Secondary', hint: 'Second colour, new shapes' },
  { role: 'accent', label: 'Accent', hint: 'Emphasis on dark ground' },
];

/** The roles the Studio works out from the three above; shown, never edited. */
const DERIVED_ROLES = [
  { role: 'accentOnLight', label: 'Accent on light' },
  { role: 'attention', label: 'Attention' },
  { role: 'textOnDark', label: 'Text on dark' },
  { role: 'textOnLight', label: 'Text on light' },
  { role: 'surface', label: 'Surface' },
] as const;

// Radix Select items cannot carry an empty value.
const NO_LOGO = 'none';
const SAME_FONT = 'same';

const CORNER_LABELS: Record<LogoCorner, string> = {
  'top-left': 'Top left',
  'top-right': 'Top right',
  'bottom-left': 'Bottom left',
  'bottom-right': 'Bottom right',
};
const GROUND_LABELS = { dark: 'For dark grounds', light: 'For light grounds' } as const;

const percent = (fraction: number) => `${Math.round(fraction * 100)} %`;
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** What the form starts with before an organisation has saved a brand. */
export function defaultSettings(name: string): BrandSettings {
  return {
    name,
    colors: { ...studioBrand.colors },
    backgrounds: studioBrand.backgrounds.map(({ label, color, ink }) => ({ label, color, ink })),
    fonts: {
      headline: studioBrand.fonts.headline,
      body: studioBrand.fonts.body,
      serif: null,
      condensed: null,
    },
    logoAssetId: null,
    logoAlt: null,
    layout: null,
  };
}

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong.';

export function BrandPage() {
  const { organisation } = useLoggedIn();
  const brand = useQuery({
    queryKey: ['brand-pack', organisation.id],
    queryFn: () => api.getBrandPack(organisation.id),
  });

  let content;
  if (organisation.role !== 'owner') {
    content = (
      <p className="studio-muted">Only owners of {organisation.name} can edit its brand.</p>
    );
  } else if (brand.isPending) {
    content = <p className="studio-muted">Loading the brand…</p>;
  } else if (brand.isError) {
    content = <Alert tone="danger">{errorText(brand.error)}</Alert>;
  } else {
    content = (
      <BrandEditor
        key={organisation.id}
        orgId={organisation.id}
        orgName={organisation.name}
        data={brand.data}
      />
    );
  }

  return (
    <PageShell>
      <header className="studio-header">
        <PageTitle>Brand of {organisation.name}</PageTitle>
      </header>
      {content}
    </PageShell>
  );
}

function BrandEditor({
  orgId,
  orgName,
  data,
}: {
  orgId: string;
  orgName: string;
  data: BrandPackResponse;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState<BrandInput>(() => {
    const stored = data.settings ?? defaultSettings(orgName);
    const { primary, secondary, accent } = stored.colors;
    return {
      name: stored.name,
      colors: { primary, secondary, accent },
      // A pack saved before the font swap may still name the old families.
      fonts: {
        headline: aliasFontFamily(stored.fonts.headline),
        body: aliasFontFamily(stored.fonts.body),
        serif: stored.fonts.serif && aliasFontFamily(stored.fonts.serif),
        condensed: stored.fonts.condensed && aliasFontFamily(stored.fonts.condensed),
      },
      logoAssetId: stored.logoAssetId,
      logoAlt: stored.logoAlt,
      layout: clampBrandLayout(stored.layout ?? DEFAULT_BRAND_LAYOUT),
    };
  });
  // The second logo is picked first and given its ground second: until then it is not valid.
  // A stored one whose asset is gone, or is now the main logo, shows as none.
  const [alt, setAlt] = useState<{ assetId: string; ground: 'dark' | 'light' | null } | null>(
    () => {
      const stored = data.settings?.logoAlt;
      const usable =
        stored &&
        stored.assetId !== data.settings?.logoAssetId &&
        data.assets.some((x) => x.kind === 'logo' && x.id === stored.assetId);
      return usable ? { assetId: stored.assetId, ground: stored.ground } : null;
    }
  );
  const layout = input.layout ?? DEFAULT_BRAND_LAYOUT;
  const altIncomplete = alt !== null && alt.ground === null;
  const [groundIndex, setGroundIndex] = useState(0);
  const fonts = useMemo(() => data.assets.filter((a) => a.kind === 'font'), [data.assets]);
  const logos = data.assets.filter((a) => a.kind === 'logo');
  const families = [...new Set([...data.bundledFonts, ...fonts.map((f) => f.family ?? '')])].filter(
    Boolean
  );
  const invalid = Object.values(input.colors).some((c) => !HEX.test(c));
  const derived = useMemo(
    () => (invalid ? null : deriveBrandColors(input.colors)),
    [input.colors, invalid]
  );
  const grounds = useMemo(
    () => (invalid ? [] : deriveGrounds(input.colors)),
    [input.colors, invalid]
  );
  // The preview keeps the last good look while a colour is half typed.
  const previewColors = derived ?? data.settings?.colors ?? studioBrand.colors;
  const settings: BrandSettings = {
    name: input.name,
    colors: previewColors,
    backgrounds: grounds,
    fonts: input.fonts,
    logoAssetId: input.logoAssetId,
    logoAlt: input.logoAlt,
    layout,
  };
  // E4: a pack saved with hand-set roles changes them on the next save.
  const rederives = useMemo(() => {
    if (!data.settings) return false;
    const { primary, secondary, accent } = data.settings.colors;
    const fresh = deriveBrandColors({ primary, secondary, accent });
    if (!fresh) return false;
    if (
      DERIVED_ROLES.some(
        ({ role }) => data.settings!.colors[role].toLowerCase() !== fresh[role].toLowerCase()
      )
    ) {
      return true;
    }
    // Saving replaces the stored grounds too.
    const freshGrounds = deriveGrounds({ primary, secondary, accent });
    const stored = data.settings.backgrounds;
    return (
      stored.length !== freshGrounds.length ||
      freshGrounds.some(
        (g, i) =>
          stored[i]!.label !== g.label ||
          stored[i]!.color.toLowerCase() !== g.color.toLowerCase() ||
          stored[i]!.ink.toLowerCase() !== g.ink.toLowerCase()
      )
    );
  }, [data.settings]);

  // Uploaded families must be loaded for the preview to show them.
  useEffect(() => {
    void loadBrandFonts(
      fonts.map((f) => ({
        family: f.family!,
        src: f.url,
        weight: f.weight ?? 400,
        style: f.style ?? 'normal',
      }))
    );
  }, [fonts]);

  const setData = (next: BrandPackResponse) =>
    queryClient.setQueryData(['brand-pack', orgId], next);
  const reload = () => queryClient.invalidateQueries({ queryKey: ['brand-pack', orgId] });

  const save = useMutation({
    mutationFn: () =>
      api.saveBrandPack(orgId, {
        ...input,
        logoAlt: alt?.ground ? { assetId: alt.assetId, ground: alt.ground } : null,
      }),
    onSuccess: (next) => {
      setData(next);
      toast('Brand saved. Projects opened from now on use it.');
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const setColor = (role: InputRole, color: string) =>
    setInput((s) => ({ ...s, colors: { ...s.colors, [role]: color } }));

  const ground = grounds[groundIndex] ??
    grounds[0] ?? {
      color: previewColors.primary,
      ink: previewColors.textOnDark,
    };
  const setLayout = (patch: Partial<BrandLayout>) =>
    setInput((s) => ({ ...s, layout: { ...(s.layout ?? DEFAULT_BRAND_LAYOUT), ...patch } }));
  const logoUrl = logos.find((l) => l.id === input.logoAssetId)?.url ?? null;
  const altUrl = alt?.ground ? (logos.find((l) => l.id === alt.assetId)?.url ?? null) : null;

  return (
    <div className="studio-brand">
      <form
        className="studio-brand__form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!invalid && !altIncomplete && !save.isPending) save.mutate();
        }}
      >
        <TextField
          label="Brand name"
          required
          maxLength={100}
          value={input.name}
          onChange={(e) => setInput((s) => ({ ...s, name: e.target.value }))}
        />

        <fieldset className="studio-brand__group">
          <legend>Colours</legend>
          <p className="studio-muted">
            Choose three colours. The Studio works out the rest so text stays readable.
          </p>
          {rederives ? (
            <Alert tone="warning">
              This brand has hand-set colours. Saving works out the other colours from these three
              again.
            </Alert>
          ) : null}
          <div className="studio-brand__colors">
            {COLOR_INPUTS.map(({ role, label, hint }) => (
              <ColorField
                key={role}
                label={label}
                hint={hint}
                value={input.colors[role]}
                onChange={(color) => setColor(role, color)}
              />
            ))}
          </div>
          <dl className="studio-brand__derived" aria-label="Derived colours">
            {DERIVED_ROLES.map(({ role, label }) => (
              <div key={role} className="studio-brand__derived-row">
                <dt>{label}</dt>
                <dd>
                  <span
                    className="studio-brand__swatch"
                    aria-hidden="true"
                    style={{ background: derived?.[role] ?? 'transparent' }}
                  />
                  {derived?.[role].toUpperCase() ?? '–'}
                </dd>
              </div>
            ))}
          </dl>
        </fieldset>

        <fieldset className="studio-brand__group">
          <legend>Layout</legend>
          <p className="studio-muted">
            Where templates keep their content and the logo. The preview outlines both.
          </p>
          <RangeField
            label="Margin"
            min={pct(BRAND_LAYOUT_BOUNDS.margin.min)}
            max={pct(BRAND_LAYOUT_BOUNDS.margin.max)}
            value={layout.margin}
            onChange={(margin) => setLayout({ margin })}
          />
          <fieldset className="studio-chips">
            <legend className="studio-muted">Logo corner</legend>
            {LOGO_CORNERS.map((corner) => (
              <label key={corner} className="studio-chip">
                <input
                  type="radio"
                  name="logo-corner"
                  checked={layout.logoCorner === corner}
                  onChange={() => setLayout({ logoCorner: corner })}
                />
                <span>{CORNER_LABELS[corner]}</span>
              </label>
            ))}
          </fieldset>
          <RangeField
            label="Logo width"
            min={pct(BRAND_LAYOUT_BOUNDS.logoMaxWidth.min)}
            max={pct(BRAND_LAYOUT_BOUNDS.logoMaxWidth.max)}
            value={layout.logoMaxWidth}
            onChange={(logoMaxWidth) => setLayout({ logoMaxWidth })}
          />
          <RangeField
            label="Logo height"
            min={pct(BRAND_LAYOUT_BOUNDS.logoMaxHeight.min)}
            max={pct(BRAND_LAYOUT_BOUNDS.logoMaxHeight.max)}
            value={layout.logoMaxHeight}
            onChange={(logoMaxHeight) => setLayout({ logoMaxHeight })}
          />
        </fieldset>

        <fieldset className="studio-brand__group">
          <legend>Fonts</legend>
          {(['headline', 'body'] as const).map((slot) => (
            <Select
              key={slot}
              label={slot === 'headline' ? 'Headlines' : 'Body text'}
              value={input.fonts[slot]}
              onValueChange={(family) =>
                setInput((s) => ({ ...s, fonts: { ...s.fonts, [slot]: family } }))
              }
              options={families.map((f) => ({ value: f, label: f }))}
            />
          ))}
          {(['serif', 'condensed'] as const).map((slot) => (
            <Select
              key={slot}
              label={slot === 'serif' ? 'Serif' : 'Condensed'}
              value={input.fonts[slot] ?? SAME_FONT}
              onValueChange={(family) =>
                setInput((s) => ({
                  ...s,
                  fonts: { ...s.fonts, [slot]: family === SAME_FONT ? null : family },
                }))
              }
              options={[
                {
                  value: SAME_FONT,
                  label: slot === 'serif' ? 'Same as quotes' : 'Same as headlines',
                },
                ...families.map((f) => ({ value: f, label: f })),
              ]}
            />
          ))}
          <FontUpload orgId={orgId} onUploaded={() => void reload()} />
          <AssetList
            orgId={orgId}
            assets={fonts}
            onDeleted={() => void reload()}
            describe={(a) =>
              `${a.family} ${a.weight}${a.style === 'italic' ? ' italic' : ''}, licence: ${a.licence}`
            }
          />
        </fieldset>

        <fieldset className="studio-brand__group">
          <legend>Logo</legend>
          <LogoUpload
            orgId={orgId}
            onUploaded={(asset) => {
              setInput((s) => ({ ...s, logoAssetId: asset.id }));
              void reload();
            }}
          />
          {logos.length > 0 ? (
            <Select
              label="Logo in use"
              value={input.logoAssetId ?? NO_LOGO}
              onValueChange={(value) => {
                setInput((s) => ({ ...s, logoAssetId: value === NO_LOGO ? null : value }));
                if (alt?.assetId === value) setAlt(null);
              }}
              options={[
                { value: NO_LOGO, label: 'No logo' },
                ...logos.map((l, i) => ({
                  value: l.id,
                  label: `Logo ${i + 1} (${l.contentType === 'image/png' ? 'PNG' : 'WebP'})`,
                })),
              ]}
            />
          ) : null}
          {logos.length > 1 ? (
            <>
              <Select
                label="Second logo"
                hint="Used on grounds of one kind, instead of the logo in use."
                value={alt?.assetId ?? NO_LOGO}
                onValueChange={(value) =>
                  setAlt(value === NO_LOGO ? null : { assetId: value, ground: null })
                }
                options={[
                  { value: NO_LOGO, label: 'No second logo' },
                  ...logos
                    .map((l, i) => ({
                      id: l.id,
                      value: l.id,
                      label: `Logo ${i + 1} (${l.contentType === 'image/png' ? 'PNG' : 'WebP'})`,
                    }))
                    .filter((o) => o.id !== input.logoAssetId),
                ]}
              />
              {alt ? (
                <fieldset className="studio-chips">
                  <legend className="studio-muted">Second logo is used</legend>
                  {(['dark', 'light'] as const).map((g) => (
                    <label key={g} className="studio-chip">
                      <input
                        type="radio"
                        name="logo-alt-ground"
                        checked={alt.ground === g}
                        onChange={() => setAlt({ assetId: alt.assetId, ground: g })}
                      />
                      <span>{GROUND_LABELS[g]}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </>
          ) : null}
          <AssetList
            orgId={orgId}
            assets={logos}
            onDeleted={(asset) => {
              if (input.logoAssetId === asset.id) {
                setInput((s) => ({ ...s, logoAssetId: null }));
              }
              if (alt?.assetId === asset.id) setAlt(null);
              void reload();
            }}
            describe={(a, i) => `Logo ${i + 1}`}
            preview
          />
        </fieldset>

        {altIncomplete ? (
          <Alert tone="warning">Choose which grounds the second logo is for.</Alert>
        ) : null}
        <Button
          type="submit"
          className="studio-brand__save"
          disabled={invalid || altIncomplete || save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save brand'}
        </Button>
      </form>

      <aside className="studio-brand__preview" aria-label="Live preview">
        <BrandPreview
          settings={settings}
          ground={ground}
          logoUrl={logoUrl}
          logoAlt={altUrl && alt?.ground ? { url: altUrl, ground: alt.ground } : null}
          layout={layout}
        />
        <fieldset className="studio-chips">
          <legend className="studio-muted">Preview on</legend>
          {grounds.map((b, i) => (
            <label key={b.label} className="studio-chip">
              <input
                type="radio"
                name="preview-ground"
                checked={groundIndex === i}
                onChange={() => setGroundIndex(i)}
              />
              <span>{b.label}</span>
            </label>
          ))}
        </fieldset>
      </aside>
    </div>
  );
}

/** A fraction as a whole percent, for a slider's bounds. */
const pct = (fraction: number): number => Math.round(fraction * 100);

/** A percentage slider over a 0–1 fraction (the layout stores fractions). */
function RangeField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (fraction: number) => void;
}) {
  const id = useId();
  return (
    <div className="ui-field">
      <label htmlFor={id} className="ui-field__label">
        {label}: {percent(value)}
      </label>
      <input
        id={id}
        type="range"
        className="studio-brand__range"
        min={min}
        max={max}
        step={1}
        aria-valuetext={percent(value)}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const valid = HEX.test(value);
  return (
    <TextField
      className="studio-color"
      label={
        <>
          {label}
          {hint ? <small className="studio-muted"> {hint}</small> : null}
        </>
      }
      value={value}
      maxLength={7}
      spellCheck={false}
      error={valid ? undefined : 'Write the colour as #RRGGBB.'}
      onChange={(e) => onChange(e.target.value.trim())}
      endAdornment={
        <input
          type="color"
          className="studio-color__picker"
          aria-label={`${label}: colour picker`}
          value={valid ? value.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
      }
    />
  );
}

/** A file input in the kit's field frame (the kit has no file field yet). */
function FileField({
  label,
  hint,
  error,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'>) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={`ui-field${error ? ' ui-field--invalid' : ''}`}>
      <label htmlFor={id} className="ui-field__label">
        {label}
      </label>
      <input
        {...input}
        id={id}
        type="file"
        className="studio-file"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {hint ? (
        <p id={`${id}-hint`} className="ui-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <Alert id={`${id}-error`} tone="danger">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

function FontUpload({ orgId, onUploaded }: { orgId: string; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState('');
  const [weight, setWeight] = useState(400);
  const [style, setStyle] = useState<'normal' | 'italic'>('normal');
  const [licence, setLicence] = useState('');
  const [formKey, setFormKey] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const id = useId();
  const upload = useMutation({
    mutationFn: () =>
      api.uploadFont(orgId, file!, file!.name, {
        family: family.trim(),
        weight,
        style,
        licence: licence.trim(),
      }),
    onSuccess: () => {
      setFile(null);
      setFamily('');
      setLicence('');
      setFileError(null);
      setFormKey((k) => k + 1);
      onUploaded();
    },
    onError: (err) => setFileError(errorText(err)),
  });
  const ready = file && family.trim() && licence.trim();

  return (
    <div className="studio-brand__upload" key={formKey}>
      <h2 className="studio-subtitle">Add a font</h2>
      <FileField
        label="File (WOFF2, TTF or OTF)"
        accept=".woff2,.ttf,.otf,font/woff2,font/ttf,font/otf"
        error={fileError}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setFileError(null);
        }}
      />
      <TextField
        label="Family name"
        maxLength={60}
        value={family}
        placeholder="e.g. Source Sans"
        onChange={(e) => setFamily(e.target.value)}
      />
      <div className="studio-brand__row">
        <Select
          label="Weight"
          value={String(weight)}
          onValueChange={(value) => setWeight(Number(value))}
          options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
            value: String(w),
            label: String(w),
          }))}
        />
        <Select
          label="Style"
          value={style}
          onValueChange={(value) => setStyle(value as 'normal' | 'italic')}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'italic', label: 'Italic' },
          ]}
        />
      </div>
      <TextField
        label="Licence (required)"
        aria-required="true"
        maxLength={100}
        value={licence}
        list={`${id}-licences`}
        placeholder="e.g. OFL-1.1"
        hint="Under which licence you may use this font. It is stored with the file."
        onChange={(e) => setLicence(e.target.value)}
      />
      <datalist id={`${id}-licences`}>
        <option value="OFL-1.1" />
        <option value="Apache-2.0" />
        <option value="own licence" />
      </datalist>
      <Button
        variant="outline"
        size="sm"
        className="studio-brand__add"
        disabled={!ready || upload.isPending}
        onClick={() => upload.mutate()}
      >
        {upload.isPending ? 'Uploading…' : 'Upload font'}
      </Button>
    </div>
  );
}

function LogoUpload({
  orgId,
  onUploaded,
}: {
  orgId: string;
  onUploaded: (asset: BrandAsset) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => api.uploadLogo(orgId, file, file.name),
    onSuccess: (asset) => {
      setError(null);
      onUploaded(asset);
    },
    // Shown next to the field and kept until the next attempt: a toast is gone in seconds, and
    // the server's reason ("SVG is not accepted") is what the person needs to read.
    onError: (err) => setError(errorText(err)),
  });
  return (
    <FileField
      label="Upload a logo (PNG or WebP; SVG is not accepted)"
      accept="image/png,image/webp"
      disabled={upload.isPending}
      error={error}
      onChange={(e) => {
        const file = e.target.files?.[0];
        setError(null);
        if (file) upload.mutate(file);
        e.target.value = '';
      }}
    />
  );
}

function AssetList({
  orgId,
  assets,
  onDeleted,
  describe,
  preview = false,
}: {
  orgId: string;
  assets: BrandAsset[];
  onDeleted: (asset: BrandAsset) => void;
  describe: (asset: BrandAsset, index: number) => string;
  preview?: boolean;
}) {
  const remove = useMutation({
    mutationFn: (asset: BrandAsset) => api.deleteBrandAsset(orgId, asset.id),
    onSuccess: (_v, asset) => onDeleted(asset),
    onError: (err) => toast.error(errorText(err)),
  });
  if (assets.length === 0) return null;
  return (
    <ul className="studio-assets">
      {assets.map((a, i) => (
        <Card asChild variant="outlined" key={a.id}>
          <li className="studio-asset">
            {preview ? <img className="studio-brand__thumb" src={a.url} alt="" /> : null}
            <span className="studio-asset__who">{describe(a, i)}</span>
            <Button
              variant="outline"
              size="sm"
              className="studio-danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(a)}
            >
              Delete
            </Button>
          </li>
        </Card>
      ))}
    </ul>
  );
}
