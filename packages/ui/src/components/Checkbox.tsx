// SPDX-License-Identifier: AGPL-3.0-only
import { type ReactNode, useId } from 'react';
import { Checkbox as RadixCheckbox } from 'radix-ui';

import { cx } from '../cx.js';
import { CheckIcon } from '../icons.js';

export interface CheckboxProps {
  label: ReactNode;
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  name?: string;
  value?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  error?: ReactNode;
  className?: string;
}

export function Checkbox({ label, error, id, className, ...rest }: CheckboxProps) {
  const auto = useId();
  const boxId = id ?? auto;
  const errorId = error ? `${boxId}-error` : undefined;
  return (
    <div className={cx('ui-checkbox', !!error && 'ui-field--invalid', className)}>
      <div className="ui-checkbox__row">
        <RadixCheckbox.Root
          id={boxId}
          className="ui-checkbox__box"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...rest}
        >
          <RadixCheckbox.Indicator>
            <CheckIcon />
          </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
        <label htmlFor={boxId} className="ui-checkbox__label">
          {label}
        </label>
      </div>
      {error ? (
        <p id={errorId} className="ui-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
