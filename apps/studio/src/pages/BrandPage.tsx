// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The current organisation's brand pack: name, the eight colour roles, the grounds,
 * fonts and logo, with a live preview. Owners only; the server checks that too.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';

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
import { AccountBar } from '../ui/AccountBar';
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
    content = (
      <p role="alert" className="studio-error">
        {errorText(brand.error)}
      </p>
    );
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
    <main className="studio-page">
      <header className="studio-header">
        <h1 className="studio-logo">Brand of {organisation.name}</h1>
        <AccountBar />
      </header>
      {content}
    </main>
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
  const id = useId();
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
        <div className="studio-field">
          <label htmlFor={`${id}-name`}>Brand name</label>
          <input
            id={`${id}-name`}
            required
            maxLength={100}
            value={settings.name}
            onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
          />
        </div>

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
                <label>
                  <span className="studio-visually-hidden">Name of ground {i + 1}</span>
                  <input
                    value={b.label}
                    maxLength={40}
                    required
                    onChange={(e) => setGround(i, { label: e.target.value })}
                  />
                </label>
                <ColorField
                  label="Colour"
                  value={b.color}
                  onChange={(color) => setGround(i, { color })}
                />
                <ColorField label="Text" value={b.ink} onChange={(ink) => setGround(i, { ink })} />
                <button
                  type="button"
                  className="studio-button"
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
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="studio-button"
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
          </button>
        </fieldset>

        <fieldset className="studio-brand__group">
          <legend>Fonts</legend>
          {(['headline', 'body'] as const).map((slot) => (
            <div key={slot} className="studio-field">
              <label htmlFor={`${id}-${slot}`}>
                {slot === 'headline' ? 'Headlines' : 'Body text'}
              </label>
              <select
                id={`${id}-${slot}`}
                value={settings.fonts[slot]}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, fonts: { ...s.fonts, [slot]: e.target.value } }))
                }
              >
                {families.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="studio-field">
              <label htmlFor={`${id}-logo`}>Logo in use</label>
              <select
                id={`${id}-logo`}
                value={settings.logoAssetId ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, logoAssetId: e.target.value || null }))
                }
              >
                <option value="">No logo</option>
                {logos.map((l, i) => (
                  <option key={l.id} value={l.id}>
                    Logo {i + 1} ({l.contentType === 'image/png' ? 'PNG' : 'WebP'})
                  </option>
                ))}
              </select>
            </div>
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

        {invalid ? (
          <p role="alert" className="studio-auth__error">
            Every colour must be written as #RRGGBB.
          </p>
        ) : null}
        <button
          type="submit"
          className="studio-button studio-button--primary"
          disabled={invalid || save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save brand'}
        </button>
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
  const id = useId();
  const valid = HEX.test(value);
  return (
    <div className="studio-color">
      <label htmlFor={`${id}-text`}>
        {label}
        {hint ? <small className="studio-muted"> {hint}</small> : null}
      </label>
      <span className="studio-color__inputs">
        <input
          type="color"
          aria-label={`${label}: colour picker`}
          value={valid ? value.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <input
          id={`${id}-text`}
          value={value}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      </span>
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
      setFormKey((k) => k + 1);
      onUploaded();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const ready = file && family.trim() && licence.trim();

  return (
    <div className="studio-brand__upload" key={formKey}>
      <h3 className="studio-subtitle">Add a font</h3>
      <div className="studio-field">
        <label htmlFor={`${id}-file`}>File (WOFF2, TTF or OTF)</label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".woff2,.ttf,.otf,font/woff2,font/ttf,font/otf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="studio-field">
        <label htmlFor={`${id}-family`}>Family name</label>
        <input
          id={`${id}-family`}
          maxLength={60}
          value={family}
          placeholder="e.g. Source Sans"
          onChange={(e) => setFamily(e.target.value)}
        />
      </div>
      <div className="studio-brand__row">
        <div className="studio-field">
          <label htmlFor={`${id}-weight`}>Weight</label>
          <select
            id={`${id}-weight`}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          >
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
        <div className="studio-field">
          <label htmlFor={`${id}-style`}>Style</label>
          <select
            id={`${id}-style`}
            value={style}
            onChange={(e) => setStyle(e.target.value as 'normal' | 'italic')}
          >
            <option value="normal">Normal</option>
            <option value="italic">Italic</option>
          </select>
        </div>
      </div>
      <div className="studio-field">
        <label htmlFor={`${id}-licence`}>Licence (required)</label>
        <input
          id={`${id}-licence`}
          aria-required="true"
          maxLength={100}
          value={licence}
          list={`${id}-licences`}
          placeholder="e.g. OFL-1.1"
          aria-describedby={`${id}-licence-hint`}
          onChange={(e) => setLicence(e.target.value)}
        />
        <datalist id={`${id}-licences`}>
          <option value="OFL-1.1" />
          <option value="Apache-2.0" />
          <option value="own licence" />
        </datalist>
        <small id={`${id}-licence-hint`} className="studio-muted">
          Under which licence you may use this font. It is stored with the file.
        </small>
      </div>
      <button
        type="button"
        className="studio-button"
        disabled={!ready || upload.isPending}
        onClick={() => upload.mutate()}
      >
        {upload.isPending ? 'Uploading…' : 'Upload font'}
      </button>
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
  const id = useId();
  const upload = useMutation({
    mutationFn: (file: File) => api.uploadLogo(orgId, file, file.name),
    onSuccess: onUploaded,
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <div className="studio-field">
      <label htmlFor={`${id}-logo-file`}>Upload a logo (PNG or WebP; SVG is not accepted)</label>
      <input
        id={`${id}-logo-file`}
        type="file"
        accept="image/png,image/webp"
        disabled={upload.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = '';
        }}
      />
    </div>
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
        <li key={a.id} className="studio-member">
          {preview ? <img className="studio-brand__thumb" src={a.url} alt="" /> : null}
          <span className="studio-member__who">{describe(a, i)}</span>
          <button
            type="button"
            className="studio-button studio-button--danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(a)}
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
