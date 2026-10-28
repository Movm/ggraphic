// SPDX-License-Identifier: MPL-2.0
import { type CSSProperties, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface AuthLayoutProps {
  /** Brand mark in the media panel, usually <Wordmark href="/" />. */
  brand: ReactNode;
  /** Big statement over the photo ("Schön, dass du da bist."). */
  heading?: ReactNode;
  /** Replaces the heading, e.g. a live poster preview during setup. */
  mediaContent?: ReactNode;
  /** Photo URL. Rendered greyscale, multiplied with the brand's deep colour. */
  imageSrc?: string;
  /** Minimum media height on narrow screens (CSS length). Default 38vh. */
  mediaMinHeight?: string;
  /** The form column. */
  children: ReactNode;
  /** Use "div" when the page already has a <main> elsewhere. */
  mainElement?: 'main' | 'div';
  className?: string;
}

/**
 * Split login/registration layout: brand photo panel left (stacked on top on
 * small screens), centred form column right. Wrap the form content in
 * <AuthForm> for the 420px measure and spacing.
 */
export function AuthLayout({
  brand,
  heading,
  mediaContent,
  imageSrc,
  mediaMinHeight,
  children,
  mainElement: Main = 'main',
  className,
}: AuthLayoutProps) {
  const style = mediaMinHeight
    ? ({ '--ui-auth-media-min-height': mediaMinHeight } as CSSProperties)
    : undefined;
  return (
    <div className={cx('ui-auth', className)}>
      <div className="ui-auth__media" data-ui-surface="inverse" style={style}>
        {imageSrc ? (
          <div
            className="ui-auth__photo"
            style={{ backgroundImage: `url("${imageSrc}")` }}
            aria-hidden="true"
          />
        ) : null}
        <div className="ui-auth__tint" aria-hidden="true" />
        <div className="ui-auth__fade" aria-hidden="true" />
        <div className="ui-auth__brand">{brand}</div>
        {mediaContent ? <div className="ui-auth__extra">{mediaContent}</div> : null}
        {!mediaContent && heading ? <p className="ui-auth__heading">{heading}</p> : null}
      </div>
      <Main className="ui-auth__panel">{children}</Main>
    </div>
  );
}

export function AuthForm({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-auth__form', className)} {...rest} />;
}
