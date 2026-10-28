// SPDX-License-Identifier: MPL-2.0
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { Slot } from 'radix-ui';

import { cx } from '../cx.js';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'inverse' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Render the child element (e.g. an <a>) with the button's look. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    asChild = false,
    className,
    type,
    ...rest
  },
  ref
) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      ref={ref}
      // Without an explicit type a button inside a form submits it.
      {...(asChild ? {} : { type: type ?? 'button' })}
      className={cx(
        'ui-button',
        `ui-button--${variant}`,
        size !== 'md' && `ui-button--${size}`,
        fullWidth && 'ui-button--full',
        className
      )}
      {...rest}
    />
  );
});
