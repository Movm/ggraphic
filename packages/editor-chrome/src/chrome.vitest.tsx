// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PiGear, PiTextT } from 'react-icons/pi';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import {
  CHROME_ROOT_ATTR,
  SIDEBAR_PANEL_ID,
  SidebarPanel,
  SidebarTabBar,
  type SidebarTab,
} from './index.js';

type Id = 'text' | 'settings';

const TABS: SidebarTab<Id>[] = [
  { id: 'text', icon: PiTextT, label: 'Text', ariaLabel: 'Text bearbeiten' },
  { id: 'settings', icon: PiGear, label: 'Einstellungen', ariaLabel: 'Einstellungen öffnen' },
];

/** A host outside the canvas editor: its own root, its own state, nothing else. */
function Host({ footer }: { footer?: string }) {
  const [active, setActive] = useState<Id | null>(null);
  const label = TABS.find((t) => t.id === active)?.label;
  return (
    <div {...{ [CHROME_ROOT_ATTR]: '' }} className="relative">
      <SidebarTabBar
        tabs={TABS}
        activeTab={active}
        onTabClick={(id) => setActive((cur) => (cur === id ? null : id))}
        ariaLabel="Seitenbereiche"
        footer={footer}
      />
      <SidebarPanel isOpen={active !== null} title={label} onClose={() => setActive(null)}>
        <p>Inhalt {label}</p>
      </SidebarPanel>
    </div>
  );
}

function setViewport(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile && query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('sidebar chrome without the editor', () => {
  it('opens and closes the desktop panel from its tab', async () => {
    setViewport(false);
    const user = userEvent.setup();
    const { container } = render(<Host />);

    const nav = screen.getByRole('navigation', { name: 'Seitenbereiche' });
    const tab = screen.getByRole('button', { name: 'Text bearbeiten' });
    expect(tab).toHaveAttribute('aria-controls', SIDEBAR_PANEL_ID);
    expect(nav.querySelector('.sidebar-tab-bar__separator')).toBeNull();

    await user.click(tab);
    expect(tab).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Text' })).toHaveTextContent('Inhalt Text');
    expect(document.documentElement.style.getPropertyValue('--canvas-panel-width')).toBe('348px');
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Panel einklappen' }));
    expect(screen.queryByRole('region', { name: 'Text' })).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--canvas-panel-width')).toBe('');
  });

  it('renders the footer under a separator on the desktop rail', () => {
    setViewport(false);
    render(<Host footer="Gespeichert" />);
    const nav = screen.getByRole('navigation', { name: 'Seitenbereiche' });
    expect(nav.querySelector('.sidebar-tab-bar__separator')).not.toBeNull();
    expect(nav).toHaveTextContent('Gespeichert');
  });

  it('shows a bottom bar and a sheet with a titled close button on mobile', async () => {
    setViewport(true);
    const user = userEvent.setup();
    render(<Host footer="Gespeichert" />);

    const nav = screen.getByRole('navigation', { name: 'Seitenbereiche' });
    expect(nav).not.toHaveTextContent('Gespeichert');

    await user.click(screen.getByRole('button', { name: 'Einstellungen öffnen' }));
    const sheet = document.getElementById(SIDEBAR_PANEL_ID);
    expect(sheet?.tagName).toBe('SECTION');
    expect(sheet).toHaveAttribute('aria-label', 'Einstellungen');
    expect(screen.getByRole('button', { name: 'Einstellungen schließen' })).toBeInTheDocument();
  });
});
