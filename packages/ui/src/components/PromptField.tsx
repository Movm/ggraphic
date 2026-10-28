// SPDX-License-Identifier: MPL-2.0
import { type FormEvent, type InputHTMLAttributes, forwardRef, useId } from 'react';

import { cx } from '../cx.js';
import { ArrowUpIcon } from '../icons.js';
import { IconButton } from './IconButton.js';

export interface PromptFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onSubmit' | 'size'
> {
  /** Visually hidden label; the placeholder is not a label. */
  label: string;
  /** Accessible name of the round submit button. */
  submitLabel?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  variant?: 'filled' | 'outlined';
}

export const PromptField = forwardRef<HTMLInputElement, PromptFieldProps>(function PromptField(
  { label, submitLabel = 'Absenden', onSubmit, variant = 'filled', id, className, ...rest },
  ref
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <form
      className={cx('ui-prompt', variant === 'outlined' && 'ui-prompt--outlined', className)}
      onSubmit={onSubmit}
    >
      <label htmlFor={inputId} className="ui-visually-hidden">
        {label}
      </label>
      <input ref={ref} id={inputId} className="ui-prompt__input" {...rest} />
      <IconButton
        type="submit"
        variant="solid"
        size="lg"
        label={submitLabel}
        icon={<ArrowUpIcon />}
      />
    </form>
  );
});
