// SPDX-License-Identifier: MPL-2.0
import { type HTMLAttributes } from 'react';

import { cx } from '../cx.js';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Name the initial is taken from, and the accessible name ("Konto: Anna"). */
  name: string;
  /** Prefix of the accessible name, e.g. "Account". */
  label?: string;
  size?: 'md' | 'lg';
}

const initialOf = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? '?';

/** Round account marker with the first letter of the name. */
export function Avatar({ name, label = 'Konto', size = 'md', className, ...rest }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${name}`}
      className={cx('ui-avatar', size === 'lg' && 'ui-avatar--lg', className)}
      {...rest}
    >
      {initialOf(name)}
    </span>
  );
}
