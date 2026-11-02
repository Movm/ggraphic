// SPDX-License-Identifier: AGPL-3.0-only
import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface TileProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The thumbnail or preview; decorative unless it carries its own alt text. */
  media: ReactNode;
  title: ReactNode;
  /** Second line, e.g. "Poster · 2 hours ago". */
  meta?: ReactNode;
  /** CSS aspect ratio of the media frame, default "1 / 1". */
  ratio?: string;
  /** Makes the tile a link. Without it the tile is a button (an action, not a destination). */
  href?: string;
  disabled?: boolean;
}

/** A link or button with a framed preview above its name: recent projects, templates. */
export function Tile({
  media,
  title,
  meta,
  ratio,
  href,
  disabled,
  className,
  style,
  ...rest
}: TileProps) {
  const css = ratio ? ({ '--ui-tile-ratio': ratio, ...style } as CSSProperties) : style;
  const content = (
    <>
      <span className="ui-tile__media">{media}</span>
      <span className="ui-tile__title">{title}</span>
      {meta ? ' ' : null}
      {meta ? <span className="ui-tile__meta">{meta}</span> : null}
    </>
  );
  return href ? (
    <a href={href} className={cx('ui-tile', className)} style={css} {...rest}>
      {content}
    </a>
  ) : (
    <button
      type="button"
      disabled={disabled}
      className={cx('ui-tile', className)}
      style={css}
      {...rest}
    >
      {content}
    </button>
  );
}

export interface TileListProps extends HTMLAttributes<HTMLUListElement> {
  /** "row" scrolls sideways (recent items); "grid" wraps (a gallery). */
  layout?: 'row' | 'grid';
}

/** List of <li><Tile/></li>; give it an aria-label or place it under a heading. */
export function TileList({ layout = 'grid', className, ...rest }: TileListProps) {
  return <ul className={cx('ui-tiles', `ui-tiles--${layout}`, className)} {...rest} />;
}
