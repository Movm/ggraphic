// SPDX-License-Identifier: MPL-2.0
import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { Slot } from 'radix-ui';

import { cx } from '../cx.js';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: 'plain' | 'outlined' | 'tinted' | 'raised';
  /** Inset content (a plain card with text); media cards stay unpadded. */
  padded?: boolean;
  /** Make the card itself the link/button: <Card asChild><a href>…</a></Card>. */
  asChild?: boolean;
}

export function Card({
  variant = 'plain',
  padded = false,
  asChild = false,
  className,
  ...rest
}: CardProps) {
  const Comp = asChild ? Slot.Root : 'div';
  return (
    <Comp
      className={cx(
        'ui-card',
        variant !== 'plain' && `ui-card--${variant}`,
        padded && 'ui-card--padded',
        className
      )}
      {...rest}
    />
  );
}

export interface CardMediaProps extends HTMLAttributes<HTMLDivElement> {
  /** CSS aspect-ratio, default "4 / 5" (the template posters). */
  ratio?: string;
}

/** Fixed-ratio frame for a poster, preview or photo. */
export function CardMedia({ ratio, className, style, ...rest }: CardMediaProps) {
  const css = { ...(ratio ? { '--ui-card-ratio': ratio } : {}), ...style } as CSSProperties;
  return <div className={cx('ui-card__media', className)} style={css} {...rest} />;
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-card__body', className)} {...rest} />;
}

export function CardTitle({
  as: Tag = 'h3',
  badge,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' | 'h4'; badge?: ReactNode }) {
  return (
    <div className="ui-card__title-row">
      <Tag className={cx('ui-card__title', className)} {...rest}>
        {children}
      </Tag>
      {badge}
    </div>
  );
}

export function CardText({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx('ui-card__text', className)} {...rest} />;
}
