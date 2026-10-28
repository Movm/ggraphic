// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The current organisation's brand pack: name, the eight colour roles, the grounds,
 * fonts and logo, with a live preview. Owners only; the server checks that too.
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
  type BrandSettings,
} from '../api/client';
import { aliasFontFamily } from '@ggraphic/core';

import { studioBrand } from '../brand';
import { loadBrandFonts } from '../brandLoader';
import { useLoggedIn } from '../session/SessionContext';
import { PageShell, PageTitle } from '../ui/PageShell';
import { toast } from '../ui/toast';
import { BrandPreview } from './BrandPreview';

type ColorRole = keyof BrandSettings['colors'];

export const COLOR_ROLES: readonly { role: ColorRole; label: string; hint: string }[] = [
  { role: 'primary', label: 'Primary', hint: 'Main colour and default ground' },
  { role: 'secondary', label: 'Secondary', hint: 'Second colour, new shapes' },
  { role: 'accent', label: 'Accent', hint: 'Emphasis on dark ground' },
  { role: 'accentOnLight', label: 'Accent on light', hint: 'Emphasis on light ground' },
  { role: 'attention', label: 'Attention', hint: 'Badges and warnings' },
  { role: 'textOnDark', label: 'Text on dark', hint: 'Text on dark grounds' },
  { role: 'textOnLight', label: 'Text on light', hint: 'Text on light grounds' },
  { role: 'surface', label: 'Surface', hint: 'Light neutral ground' },
];

const MAX_GROUNDS = 12;
// Radix Select items cannot carry an empty value.
const NO_LOGO = 'none';
let keyCounter = 0;
const newKey = () => `ground-${keyCounter++}`;
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** What the form starts with before an organisation has saved a brand. */
export function defaultSettings(name: string): BrandSettings {
  return {
    name,
    colors: { ...studioBrand.colors },
    backgrounds: studioBrand.backgrounds.map(({ label, color, ink }) => ({ label, color, ink })),
    fonts: { headline: studioBrand.fonts.headline, body: studioBrand.fonts.body },
    logoAssetId: null,
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
  const [settings, setSettings] = useState<BrandSettings>(() =>
    data.settings
      ? {
          ...data.settings,
          // A pack saved before the font swap may still name the old families.
          fonts: {
            headline: aliasFontFamily(data.settings.fonts.headline),
            body: aliasFontFamily(data.settings.fonts.body),
          },
        }
      : defaultSettings(orgName)
  );
  const [groundIndex, setGroundIndex] = useState<number | 'primary'>('primary');
  // Stable list keys for the grounds, which have no id of their own until the server builds one.
  const [groundKeys, setGroundKeys] = useState(() => settings.backgrounds.map(newKey));
  const fonts = useMemo(() => data.assets.filter((a) => a.kind === 'font'), [data.assets]);
  const logos = data.assets.filter((a) => a.kind === 'logo');
  const families = [...new Set([...data.bundledFonts, ...fonts.map((f) => f.family ?? '')])].filter(
    Boolean
  );
  const invalid = [
    ...Object.values(settings.colors),
    ...settings.backgrounds.flatMap((b) => [b.color, b.ink]),
  ].some((c) => !HEX.test(c));

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
    mutationFn: () => api.saveBrandPack(orgId, settings),
    onSuccess: (next) => {
      setData(next);
      toast('Brand saved. Projects opened from now on use it.');
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const setColor = (role: ColorRole, color: string) =>
    setSettings((s) => ({ ...s, colors: { ...s.colors, [role]: color } }));
  const setGround = (index: number, patch: Partial<BrandSettings['backgrounds'][number]>) =>
    setSettings((s) => ({
      ...s,
      backgrounds: s.backgrounds.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }));

  const ground =
    groundIndex === 'primary'
      ? { color: settings.colors.primary, ink: settings.colors.textOnDark }
      : (settings.backgrounds[groundIndex] ?? settings.backgrounds[0]!);
  const logoUrl = logos.find((l) => l.id === settings.logoAssetId)?.url ?? null;

  return (
    <div className="studio-brand">
      <form
        className="studio-brand__form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!invalid && !save.isPending) save.mutate();
        }}
      >
        <TextField
          label="Brand name"
          required
          maxLength={100}
          value={settings.name}
          onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
        />

        <fieldset className="studio-brand__group">
          <legend>Colours</legend>
          <div className="studio-brand__colors">
            {COLOR_ROLES.map(({ role, label, hint }) => (
              <ColorField
                key={role}
                label={label}
                hint={hint}
                value={settings.colors[role]}
                onChange={(color) => setColor(role, color)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="studio-brand__group">
          <legend>Grounds</legend>
          <p className="studio-muted">Colours a page can sit on, each with its text colour.</p>
          <ul className="studio-brand__grounds">
            {settings.backgrounds.map((b, i) => (
              <li key={groundKeys[i]} className="studio-brand__ground">
                <TextField
                  label={`Name of ground ${i + 1}`}
                  value={b.label}
                  maxLength={40}
                  required
                  onChange={(e) => setGround(i, { label: e.target.value })}
                />
                <ColorField
                  label="Colour"
                  value={b.color}
                  onChange={(color) => setGround(i, { color })}
                />
                <ColorField label="Text" value={b.ink} onChange={(ink) => setGround(i, { ink })} />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={settings.backgrounds.length <= 1}
                  onClick={() => {
                    setGroundIndex('primary');
                    setGroundKeys((keys) => keys.filter((_, j) => j !== i));
                    setSettings((s) => ({
                      ...s,
                      backgrounds: s.backgrounds.filter((_, j) => j !== i),
                    }));
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="studio-brand__add"
            disabled={settings.backgrounds.length >= MAX_GROUNDS}
            onClick={() => {
              setGroundKeys((keys) => [...keys, newKey()]);
              setSettings((s) => ({
                ...s,
                backgrounds: [
                  ...s.backgrounds,
                  { label: 'New ground', color: '#FFFFFF', ink: s.colors.textOnLight },
                ],
              }));
            }}
          >
            Add a ground
          </Button>
        </fieldset>

        <fieldset className="studio-brand__group">
          <legend>Fonts</legend>
          {(['headline', 'body'] as const).map((slot) => (
            <Select
              key={slot}
              label={slot === 'headline' ? 'Headlines' : 'Body text'}
              value={settings.fonts[slot]}
              onValueChange={(family) =>
                setSettings((s) => ({ ...s, fonts: { ...s.fonts, [slot]: family } }))
              }
              options={families.map((f) => ({ value: f, label: f }))}
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
              setSettings((s) => ({ ...s, logoAssetId: asset.id }));
              void reload();
            }}
          />
          {logos.length > 0 ? (
            <Select
              label="Logo in use"
              value={settings.logoAssetId ?? NO_LOGO}
              onValueChange={(value) =>
                setSettings((s) => ({ ...s, logoAssetId: value === NO_LOGO ? null : value }))
              }
              options={[
                { value: NO_LOGO, label: 'No logo' },
                ...logos.map((l, i) => ({
                  value: l.id,
                  label: `Logo ${i + 1} (${l.contentType === 'image/png' ? 'PNG' : 'WebP'})`,
                })),
              ]}
            />
          ) : null}
          <AssetList
            orgId={orgId}
            assets={logos}
            onDeleted={(asset) => {
              if (settings.logoAssetId === asset.id) {
                setSettings((s) => ({ ...s, logoAssetId: null }));
              }
              void reload();
            }}
            describe={(a, i) => `Logo ${i + 1}`}
            preview
          />
        </fieldset>

        {invalid ? <Alert tone="danger">Every colour must be written as #RRGGBB.</Alert> : null}
        <Button type="submit" className="studio-brand__save" disabled={invalid || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save brand'}
        </Button>
      </form>

      <aside className="studio-brand__preview" aria-label="Live preview">
        <BrandPreview settings={settings} ground={ground} logoUrl={logoUrl} />
        <fieldset className="studio-chips">
          <legend className="studio-muted">Preview on</legend>
          <label className="studio-chip">
            <input
              type="radio"
              name="preview-ground"
              checked={groundIndex === 'primary'}
              onChange={() => setGroundIndex('primary')}
            />
            <span>Primary</span>
          </label>
          {settings.backgrounds.map((b, i) => (
            <label key={groundKeys[i]} className="studio-chip">
              <input
                type="radio"
                name="preview-ground"
                checked={groundIndex === i}
                onChange={() => setGroundIndex(i)}
              />
              <span>{b.label || `Ground ${i + 1}`}</span>
            </label>
          ))}
        </fieldset>
      </aside>
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
      aria-invalid={!valid}
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
    <ul className="studio-members">
      {assets.map((a, i) => (
        <Card asChild variant="outlined" key={a.id}>
          <li className="studio-member">
            {preview ? <img className="studio-brand__thumb" src={a.url} alt="" /> : null}
            <span className="studio-member__who">{describe(a, i)}</span>
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
