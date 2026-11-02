// SPDX-License-Identifier: AGPL-3.0-only
import { type ElementType, type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  /** Top bar, usually <TopNav variant="solid" />. */
  top?: ReactNode;
  /** Left icon rail, usually <SideRail />. Omit for a full-width layout. */
  rail?: ReactNode;
  children: ReactNode;
  /** Use "div" when the page already has a <main> elsewhere (e.g. the gallery). */
  mainElement?: 'main' | 'div';
}

/** App frame: optional rail on the left, top bar, scrolling main area on the dotted canvas colour. */
export function AppShell({
  top,
  rail,
  children,
  mainElement: Main = 'main',
  className,
  ...rest
}: AppShellProps) {
  return (
    <div className={cx('ui-shell', !rail && 'ui-shell--no-rail', className)} {...rest}>
      {top ? <div className="ui-shell__top">{top}</div> : null}
      {rail ? <div className="ui-shell__rail">{rail}</div> : null}
      <Main className="ui-shell__main">{children}</Main>
    </div>
  );
}

export interface SideRailProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  label?: string;
  children: ReactNode;
}

export function SideRail({ label = 'Bereiche', className, children, ...rest }: SideRailProps) {
  return (
    <nav aria-label={label} className={cx('ui-rail', className)} {...rest}>
      {children}
    </nav>
  );
}

export interface SideRailItemProps extends HTMLAttributes<HTMLElement> {
  icon: ReactNode;
  label: string;
  href?: string;
  current?: boolean;
}

/** Icon with a short label below, as in the Studio start page. A link when `href` is set, else a button. */
export function SideRailItem({
  icon,
  label,
  href,
  current,
  className,
  ...rest
}: SideRailItemProps) {
  const Tag: ElementType = href ? 'a' : 'button';
  return (
    <Tag
      className={cx('ui-rail__item', className)}
      aria-current={current ? 'page' : undefined}
      {...(href ? { href } : { type: 'button' })}
      {...rest}
    >
      <span className="ui-rail__icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </Tag>
  );
}
