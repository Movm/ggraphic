// SPDX-License-Identifier: AGPL-3.0-only
import { Children, type HTMLAttributes, type ReactNode } from 'react';

import { cx } from '../cx.js';

export interface Feature {
  /** Stable key. */
  id: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}

export interface FeatureGridProps extends HTMLAttributes<HTMLUListElement> {
  features: Feature[];
  /** "ruled": heavy top rule per item (Landing v1). "cards": bordered tiles. */
  variant?: 'ruled' | 'cards';
}

/** Auto-fitting grid of titled points; columns collapse from 3 to 1 with the width. */
export function FeatureGrid({ features, variant = 'ruled', className, ...rest }: FeatureGridProps) {
  return (
    <ul className={cx('ui-features', `ui-features--${variant}`, className)} {...rest}>
      {features.map((f) => (
        <li key={f.id} className="ui-features__item">
          {f.icon ? (
            <span className="ui-features__icon" aria-hidden="true">
              {f.icon}
            </span>
          ) : null}
          <h3 className="ui-features__title">{f.title}</h3>
          {f.description ? <p className="ui-features__text">{f.description}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** Wrapping list of big chips ("Vereine", "Initiativen", ...). Items are usually <Badge size="lg">. */
export function PillList({ className, children, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cx('ui-pills', className)} {...rest}>
      {Children.map(children, (c) => (
        <li>{c}</li>
      ))}
    </ul>
  );
}
