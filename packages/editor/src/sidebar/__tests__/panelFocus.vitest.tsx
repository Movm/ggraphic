// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Focus when the area opens and closes: a tab that opens the area by keyboard
 * sends focus inside; after a click it stays on the tab. When closed, focus
 * returns to the tab. The desktop panel and the mobile sheet follow the same
 * rule.
 */
import {
  SidebarPanel,
  SidebarTabBar,
  type SidebarTab,
  type SidebarTabId,
} from '../../entries/sidebar.js';
import { fireEvent, render, screen } from '@testing-library/react';
import { PiImage, PiTextAa } from 'react-icons/pi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const TABS: SidebarTab[] = [
  { id: 'uploads', icon: PiImage, label: 'Uploads', ariaLabel: 'Uploads' },
  { id: 'text', icon: PiTextAa, label: 'Text', ariaLabel: 'Text' },
];

function Editor({
  activeTab,
  onTabClick = () => {},
  onClose = () => {},
  content = <button type="button">Text hinzufügen</button>,
}: {
  activeTab: SidebarTabId | null;
  onTabClick?: (id: SidebarTabId) => void;
  onClose?: () => void;
  content?: React.ReactNode;
}) {
  const title = TABS.find((t) => t.id === activeTab)?.label;
  return (
    <div className="canvas-editor-layout">
      <SidebarTabBar tabs={TABS} activeTab={activeTab} onTabClick={onTabClick} />
      <SidebarPanel isOpen={activeTab !== null} title={title} onClose={onClose}>
        {activeTab !== null && content}
      </SidebarPanel>
    </div>
  );
}

/** jsdom has no TransitionEvent; the sheet only reads `propertyName`. */
function endTransition(el: Element) {
  const event = new Event('transitionend', { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: 'transform' });
  fireEvent(el, event);
}

/** What the app's `focusModality.ts` writes to `<html>`. */
function setModality(modality: 'keyboard' | 'pointer') {
  document.documentElement.dataset.focusModality = modality;
}

beforeEach(() => setModality('keyboard'));
afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.focusModality;
});

describe('desktop panel', () => {
  beforeEach(() => setViewport(false));

  it('sends focus from the opening tab to the first control', () => {
    const { rerender } = render(<Editor activeTab={null} />);
    screen.getByRole('button', { name: 'Text' }).focus();
    rerender(<Editor activeTab="text" />);
    expect(screen.getByRole('button', { name: 'Text hinzufügen' })).toHaveFocus();
  });

  it('focuses the area itself when it has no control yet', async () => {
    const { rerender, container } = render(<Editor activeTab={null} content={<p>Lädt …</p>} />);
    screen.getByRole('button', { name: 'Text' }).focus();
    rerender(<Editor activeTab="text" content={<p>Lädt …</p>} />);
    expect(screen.getByRole('region', { name: 'Text' })).toHaveFocus();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('leaves focus on the tab after a click', () => {
    setModality('pointer');
    const { rerender } = render(<Editor activeTab={null} />);
    const tab = screen.getByRole('button', { name: 'Text' });
    tab.focus();
    rerender(<Editor activeTab="text" />);
    expect(tab).toHaveFocus();
  });

  it('follows a tab change while the panel is open', () => {
    const { rerender } = render(<Editor activeTab="text" />);
    screen.getByRole('button', { name: 'Uploads' }).focus();
    rerender(<Editor activeTab="uploads" content={<button type="button">Hochladen</button>} />);
    expect(screen.getByRole('button', { name: 'Hochladen' })).toHaveFocus();
  });

  it('leaves focus where it is when the selection opens the area', () => {
    const { rerender } = render(<Editor activeTab={null} />);
    const elsewhere = document.body;
    rerender(<Editor activeTab="text" />);
    expect(document.activeElement).toBe(elsewhere);
  });

  it('returns focus to the tab after "Panel einklappen"', () => {
    const { rerender } = render(<Editor activeTab="text" />);
    const collapse = screen.getByRole('button', { name: 'Panel einklappen' });
    collapse.focus();
    rerender(<Editor activeTab={null} />);
    expect(screen.getByRole('button', { name: 'Text' })).toHaveFocus();
  });
});

describe('mobile sheet', () => {
  beforeEach(() => setViewport(true));

  it('sends focus from the opening tab to the heading', () => {
    const { rerender } = render(<Editor activeTab={null} />);
    screen.getByRole('button', { name: 'Text' }).focus();
    rerender(<Editor activeTab="text" />);
    expect(screen.getByRole('heading', { name: 'Text' })).toHaveFocus();
  });

  it('leaves focus on the tab after a tap', () => {
    setModality('pointer');
    const { rerender } = render(<Editor activeTab={null} />);
    const tab = screen.getByRole('button', { name: 'Text' });
    tab.focus();
    rerender(<Editor activeTab="text" />);
    expect(tab).toHaveFocus();
  });

  it('returns focus to the tab after closing', () => {
    const { rerender } = render(<Editor activeTab={null} />);
    const tab = screen.getByRole('button', { name: 'Text' });
    tab.focus();
    rerender(<Editor activeTab="text" />);
    const sheet = screen.getByRole('region', { name: 'Text' });
    endTransition(sheet);
    screen.getByRole('button', { name: 'Text schließen' }).focus();
    rerender(<Editor activeTab={null} />);
    // `inert` blurs the close button in a browser; jsdom does not.
    (document.activeElement as HTMLElement).blur();
    endTransition(sheet);
    expect(tab).toHaveFocus();
  });
});
