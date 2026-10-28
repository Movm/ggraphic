// SPDX-License-Identifier: MPL-2.0
import { type HTMLAttributes } from 'react';

import { cx } from '../cx.js';

export interface ProgressStepsProps extends HTMLAttributes<HTMLOListElement> {
  /** Number of steps. */
  total: number;
  /** Zero-based index of the current step; `total` marks everything done. */
  current: number;
  /** Accessible name, e.g. "Schritt 2 von 3". */
  label: string;
}

/** Segmented progress bars, as in the brand-kit setup. */
export function ProgressSteps({ total, current, label, className, ...rest }: ProgressStepsProps) {
  return (
    <ol className={cx('ui-steps', className)} aria-label={label} {...rest}>
      {Array.from({ length: total }, (_, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li
            key={i}
            className="ui-steps__bar"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          />
        );
      })}
    </ol>
  );
}
