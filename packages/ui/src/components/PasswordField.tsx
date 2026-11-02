// SPDX-License-Identifier: AGPL-3.0-only
import { forwardRef, useState } from 'react';

import { EyeIcon, EyeOffIcon } from '../icons.js';
import { IconButton } from './IconButton.js';
import { TextField, type TextFieldProps } from './TextField.js';

export interface PasswordFieldProps extends Omit<TextFieldProps, 'type' | 'endAdornment'> {
  /** Accessible names of the toggle; override for other languages. */
  showLabel?: string;
  hideLabel?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    { showLabel = 'Passwort anzeigen', hideLabel = 'Passwort verbergen', autoComplete, ...rest },
    ref
  ) {
    const [visible, setVisible] = useState(false);
    return (
      <TextField
        ref={ref}
        {...rest}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete ?? 'current-password'}
        endAdornment={
          <IconButton
            size="sm"
            label={visible ? hideLabel : showLabel}
            aria-pressed={visible}
            icon={visible ? <EyeOffIcon /> : <EyeIcon />}
            onClick={() => setVisible((v) => !v)}
          />
        }
      />
    );
  }
);
