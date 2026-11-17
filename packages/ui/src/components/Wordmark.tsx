// SPDX-License-Identifier: AGPL-3.0-only
import { type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface WordmarkProps extends HTMLAttributes<HTMLElement> {
  /** Brand name or a logo element; defaults to the ggraphic wordmark. */
  children?: ReactNode;
  /** Accent dot after the name (Landing v1 variant). */
  dot?: boolean;
  size?: 'md' | 'sm';
  /** Set to render a link. */
  href?: string;
}

export function Wordmark({
  children = 'ggraphic',
  dot = false,
  size = 'md',
  href,
  className,
  ...rest
}: WordmarkProps) {
  const cls = cx('ui-wordmark', size === 'sm' && 'ui-wordmark--sm', className);
  const content = (
    <>
      {children}
      {dot ? <span className="ui-wordmark__dot" aria-hidden="true" /> : null}
    </>
  );
  return href ? (
    <a href={href} className={cls} {...(rest as HTMLAttributes<HTMLAnchorElement>)}>
      {content}
    </a>
  ) : (
    <span className={cls} {...rest}>
      {content}
    </span>
  );
}
