// SPDX-License-Identifier: AGPL-3.0-only
import { type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  tone?: 'default' | 'subtle' | 'inverse';
  /** Big statement. Pass `accent` for the highlighted second half. */
  title?: ReactNode;
  accent?: ReactNode;
  /** Heading level of the statement; keep the page outline in order. */
  headingLevel?: 'h2' | 'h3';
  tight?: boolean;
}

/** Full-width landing section with the page gutter and an optional two-tone statement. */
export function Section({
  tone = 'default',
  title,
  accent,
  headingLevel: Heading = 'h2',
  tight,
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      className={cx(
        'ui-section',
        tone === 'subtle' && 'ui-section--subtle',
        tight && 'ui-section--tight',
        className
      )}
      {...(tone === 'inverse' ? { 'data-ui-surface': 'inverse' } : {})}
      {...rest}
    >
      <div className="ui-section__inner">
        {title || accent ? (
          <Heading className="ui-statement">
            {title}
            {title && accent ? ' ' : null}
            {accent ? <span className="ui-statement__accent">{accent}</span> : null}
          </Heading>
        ) : null}
        {children}
      </div>
    </section>
  );
}
