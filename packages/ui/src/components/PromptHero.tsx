// SPDX-License-Identifier: AGPL-3.0-only
import { type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface PromptHeroProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** The question over the prompt, rendered as the page's <h1>. */
  title: ReactNode;
  /** Usually a <PromptComposer />. */
  children: ReactNode;
  /** Text under the composer (a hint, a status). */
  footer?: ReactNode;
}

/** Full-width dark band: oversized pink question, the prompt card under it. */
export function PromptHero({ title, children, footer, className, ...rest }: PromptHeroProps) {
  return (
    <section className={cx('ui-prompt-hero', className)} data-ui-surface="inverse" {...rest}>
      <h1 className="ui-prompt-hero__title">{title}</h1>
      <div className="ui-prompt-hero__body">{children}</div>
      {footer ? <div className="ui-prompt-hero__footer">{footer}</div> : null}
    </section>
  );
}
