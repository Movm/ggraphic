// SPDX-License-Identifier: AGPL-3.0-only
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';

import { cx } from '../cx.js';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name. Required: an icon has no text of its own. */
  label: string;
  icon: ReactNode;
  variant?: 'solid' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cx(
        'ui-icon-button',
        `ui-icon-button--${variant}`,
        size !== 'md' && `ui-icon-button--${size}`,
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
