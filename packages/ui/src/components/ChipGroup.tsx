// SPDX-License-Identifier: AGPL-3.0-only
import { type FieldsetHTMLAttributes, useId } from 'react';

import { cx } from '../cx.js';

export interface ChipOption<T extends string = string> {
  value: T;
  label: string;
  /** Secondary text in the chip, e.g. a size. */
  detail?: string;
}

export interface ChipGroupProps<T extends string = string> extends Omit<
  FieldsetHTMLAttributes<HTMLFieldSetElement>,
  'onChange' | 'value' | 'defaultValue'
> {
  /** Visually hidden group name; every radio group needs one. */
  legend: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Radio group name; generated when omitted. */
  name?: string;
  size?: 'sm' | 'md';
}

/** Pill-shaped single choice (a format, a category). Native radios, so arrow keys and forms just work. */
export function ChipGroup<T extends string = string>({
  legend,
  options,
  value,
  onChange,
  name,
  size = 'md',
  className,
  ...rest
}: ChipGroupProps<T>) {
  const auto = useId();
  return (
    <fieldset className={cx('ui-chips', size === 'sm' && 'ui-chips--sm', className)} {...rest}>
      <legend className="ui-visually-hidden">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="ui-chip">
          <input
            type="radio"
            name={name ?? auto}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>
            {option.label}
            {option.detail ? <small>{option.detail}</small> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
