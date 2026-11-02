// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface HeroProps {
  /** Overlay navigation, usually <TopNav variant="overlay" />. */
  nav?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons. */
  actions?: ReactNode;
  /** Photo URL; rendered black and white under a bottom shade so the headline reads. */
  imageSrc?: string;
  className?: string;
}

/** Full-height landing hero: photo, overlay nav on top, oversized pink headline at the bottom. */
export function Hero({ nav, title, description, actions, imageSrc, className }: HeroProps) {
  return (
    <header className={cx('ui-hero', className)} data-ui-surface="inverse">
      {imageSrc ? (
        <div
          className="ui-hero__photo"
          style={{ backgroundImage: `url("${imageSrc}")` }}
          aria-hidden="true"
        />
      ) : null}
      <div className="ui-hero__shade" aria-hidden="true" />
      <div className="ui-hero__nav">{nav}</div>
      <div className="ui-hero__content">
        <h1 className="ui-hero__title">{title}</h1>
        {description ? <p className="ui-hero__lead">{description}</p> : null}
        {actions ? <div className="ui-hero__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
