// SPDX-License-Identifier: MPL-2.0
import { type ReactNode, useId } from 'react';
import { Select as RadixSelect } from 'radix-ui';

import { cx } from '../cx.js';
import { CheckIcon, ChevronDownIcon } from '../icons.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label: ReactNode;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
}

export function Select({
  label,
  options,
  placeholder,
  id,
  hint,
  error,
  className,
  ...rest
}: SelectProps) {
  const auto = useId();
  const triggerId = id ?? auto;
  const hintId = hint ? `${triggerId}-hint` : null;
  const errorId = error ? `${triggerId}-error` : null;
  const described = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ui-field', !!error && 'ui-field--invalid', className)}>
      <label htmlFor={triggerId} className="ui-field__label">
        {label}
      </label>
      <RadixSelect.Root {...rest}>
        <RadixSelect.Trigger
          id={triggerId}
          className="ui-select__trigger"
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon>
            <ChevronDownIcon width={20} height={20} />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className="ui-select__content" position="popper" sideOffset={6}>
            <RadixSelect.Viewport className="ui-select__viewport">
              {options.map((o) => (
                <RadixSelect.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  className="ui-select__item"
                >
                  <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator style={{ marginLeft: 'auto', display: 'flex' }}>
                    <CheckIcon width={18} height={18} />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
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
}
