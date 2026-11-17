// SPDX-License-Identifier: AGPL-3.0-only
import { type InputHTMLAttributes, type ReactNode, forwardRef, useId } from 'react';

import { cx } from '../cx.js';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: ReactNode;
  /** Helper text under the input. Linked through aria-describedby. */
  hint?: ReactNode;
  /** Error message. Sets aria-invalid and is announced with the field. */
  error?: ReactNode;
  /** Link or button next to the label, e.g. "Vergessen?". */
  labelAction?: ReactNode;
  /** Control inside the input's right edge (PasswordField's toggle). */
  endAdornment?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    hint,
    error,
    labelAction,
    endAdornment,
    id,
    className,
    'aria-describedby': describedBy,
    ...rest
  },
  ref
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : null;
  const errorId = error ? `${inputId}-error` : null;
  const described = [describedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ui-field', !!error && 'ui-field--invalid', className)}>
      <div className="ui-field__label-row">
        <label htmlFor={inputId} className="ui-field__label">
          {label}
        </label>
        {labelAction ? <span className="ui-field__action">{labelAction}</span> : null}
      </div>
      <div className="ui-field__control">
        <input
          ref={ref}
          id={inputId}
          className={cx('ui-field__input', !!endAdornment && 'ui-field__input--with-end')}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          {...rest}
        />
        {endAdornment ? <span className="ui-field__end">{endAdornment}</span> : null}
      </div>
      {hint ? (
        <p id={hintId ?? undefined} className="ui-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId ?? undefined} className="ui-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
});
