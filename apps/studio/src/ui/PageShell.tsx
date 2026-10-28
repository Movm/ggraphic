// SPDX-License-Identifier: AGPL-3.0-only
/** The frame of every logged-in page outside the editor: top bar, then the page on the kit's canvas. */
import { AppShell } from '@ggraphic/ui';
import { type ReactNode } from 'react';

import { AccountBar } from './AccountBar';

/** `flush` drops the page gutter and canvas so a page can run full-width bands (the start page). */
export function PageShell({ children, flush }: { children: ReactNode; flush?: boolean }) {
  return (
    <AppShell
      className={flush ? 'ui-root studio-shell studio-shell--flush' : 'ui-root studio-shell'}
      top={<AccountBar />}
    >
      {flush ? children : <div className="studio-page">{children}</div>}
    </AppShell>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="studio-title">{children}</h1>;
}
