// SPDX-License-Identifier: MPL-2.0
import { type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XCircleIcon } from '../icons.js';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  danger: XCircleIcon,
} as const;

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: ReactNode;
}

/** Inline notice. Danger is announced assertively (role=alert), the rest politely (role=status). */
export function Alert({ tone = 'info', title, className, children, ...rest }: AlertProps) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('ui-alert', `ui-alert--${tone}`, className)}
      {...rest}
    >
      <Icon className="ui-alert__icon" />
      <div>
        {title ? <p className="ui-alert__title">{title}</p> : null}
        {children ? <div className="ui-alert__body">{children}</div> : null}
      </div>
    </div>
  );
}
