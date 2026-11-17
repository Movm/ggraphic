// SPDX-License-Identifier: AGPL-3.0-only
import { type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  brand: ReactNode;
  links?: FooterLink[];
  note?: ReactNode;
  /** "inverse" sits on the deep brand colour (end of the landing page). */
  tone?: 'default' | 'inverse';
}

export function Footer({
  brand,
  links = [],
  note,
  tone = 'default',
  className,
  ...rest
}: FooterProps) {
  return (
    <footer
      className={cx('ui-footer', className)}
      {...(tone === 'inverse' ? { 'data-ui-surface': 'inverse' } : {})}
      {...rest}
    >
      <div>{brand}</div>
      {note ? <p className="ui-footer__note">{note}</p> : null}
      {links.length > 0 ? (
        <ul className="ui-footer__links">
          {links.map((l) => (
            <li key={l.href + l.label}>
              <a href={l.href} className="ui-footer__link">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </footer>
  );
}
