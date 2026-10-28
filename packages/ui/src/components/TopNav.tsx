// SPDX-License-Identifier: MPL-2.0
import { type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface TopNavLink {
  label: string;
  href: string;
  current?: boolean;
}

export interface TopNavProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Usually a <Wordmark />. */
  brand: ReactNode;
  links?: TopNavLink[];
  /** Right side: sign-in link, CTA button, avatar. */
  actions?: ReactNode;
  /** "solid": sticky white bar (app, landing v1). "overlay": transparent on a photo (landing v2). */
  variant?: 'solid' | 'overlay';
  /** Accessible name of the nav landmark. */
  label?: string;
}

export function TopNav({
  brand,
  links = [],
  actions,
  variant = 'solid',
  label = 'Hauptnavigation',
  className,
  ...rest
}: TopNavProps) {
  return (
    <nav aria-label={label} className={cx('ui-nav', `ui-nav--${variant}`, className)} {...rest}>
      <div className="ui-nav__brand">{brand}</div>
      <div className="ui-nav__actions">
        {links.length > 0 ? (
          <ul className="ui-nav__links">
            {links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="ui-nav__link"
                  aria-current={l.current ? 'page' : undefined}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {actions}
      </div>
    </nav>
  );
}
