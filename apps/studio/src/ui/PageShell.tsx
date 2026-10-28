// SPDX-License-Identifier: AGPL-3.0-only
/** The frame of every logged-in page outside the editor: top bar, then the page on the kit's canvas. */
import { AppShell } from '@ggraphic/ui';
import { type ReactNode } from 'react';

import { AccountBar } from './AccountBar';

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <AppShell className="ui-root studio-shell" top={<AccountBar />}>
      <div className="studio-page">{children}</div>
    </AppShell>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="studio-title">{children}</h1>;
}
