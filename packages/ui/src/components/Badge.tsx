// SPDX-License-Identifier: MPL-2.0
import { type HTMLAttributes } from 'react';

import { cx } from '../cx.js';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'wine'
  | 'highlight'
  | 'outline'
  | 'dashed'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** "square" is the small ratio tag ("4:5"); "lg" the big audience chips. */
  shape?: 'pill' | 'square';
  size?: 'md' | 'lg';
}

export function Badge({
  tone = 'neutral',
  shape = 'pill',
  size = 'md',
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cx(
        'ui-badge',
        `ui-badge--${tone}`,
        shape === 'square' && 'ui-badge--square',
        size === 'lg' && 'ui-badge--lg',
        className
      )}
      {...rest}
    />
  );
}
