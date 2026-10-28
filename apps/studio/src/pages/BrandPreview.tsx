// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The "Headline + text" template (`seeds.ts`, headlineSeed) drawn in HTML from the
 * brand being edited, so every change shows at once without mounting the editor.
 * Positions and sizes are the seed's, on a 1080 px square.
 */
import { type CSSProperties } from 'react';

import { type BrandSettings } from '../api/client';

const px = (value: number) => `calc(${value} / 1080 * 100cqw)`;
const family = (name: string, fallback: string) => `"${name}", ${fallback}`;

export function BrandPreview({
  settings,
  ground,
  logoUrl,
}: {
  settings: BrandSettings;
  /** The page colour; the seed starts on `primary`. */
  ground: { color: string; ink: string };
  logoUrl: string | null;
}) {
  const { colors, fonts } = settings;
  const margin = px(97);
  const text = (top: number, size: number, style: CSSProperties): CSSProperties => ({
    position: 'absolute',
    left: margin,
    right: margin,
    top: `${top}%`,
    fontSize: px(size),
    lineHeight: 1.1,
    margin: 0,
    ...style,
  });
  const accent = ground.color === colors.primary ? colors.accent : colors.accentOnLight;
  return (
    <figure className="studio-brand-preview" aria-label="Preview of the Headline + text template">
      <div className="studio-brand-preview__page" style={{ background: ground.color }}>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: `calc(${margin} + ${px(60)})`,
            top: '24%',
            width: px(120),
            height: px(14),
            background: colors.accent,
          }}
        />
        <p
          style={text(28, 104, {
            fontFamily: family(fonts.headline, 'Arial, sans-serif'),
            fontWeight: 700,
            color: ground.ink,
          })}
        >
          A clear headline
        </p>
        <p
          style={text(50, 48, {
            fontFamily: family(fonts.headline, 'Arial, sans-serif'),
            color: accent,
          })}
        >
          One line that says why it matters
        </p>
        <p
          style={text(62, 34, {
            fontFamily: family(fonts.body, 'Arial, sans-serif'),
            color: ground.ink,
            lineHeight: 1.35,
          })}
        >
          Add the details here: what, when and where.
        </p>
        <p
          style={text(84, 34, {
            fontFamily: family(fonts.body, 'Arial, sans-serif'),
            fontWeight: 700,
            color: accent,
          })}
        >
          Find out more
        </p>
        {logoUrl ? (
          <img
            className="studio-brand-preview__logo"
            src={logoUrl}
            alt={`${settings.name} logo`}
            style={{ right: margin, bottom: margin }}
          />
        ) : null}
      </div>
      <figcaption className="studio-muted">Template “Headline + text”</figcaption>
    </figure>
  );
}
