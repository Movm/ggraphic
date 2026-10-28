// SPDX-License-Identifier: MPL-2.0
import { type HTMLAttributes } from 'react';

import { cx } from '../cx.js';

/** Rule with optional centred text ("oder"). */
export function Divider({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('ui-divider', className)}
      {...(children ? {} : { role: 'separator' })}
      {...rest}
    >
      {children}
    </div>
  );
}
