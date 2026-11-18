// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider } from '../../CanvasEditorProvider.js';
import { browserFileDelivery } from '../../hostServices.js';
import { registerMessages } from '../../i18n/messages.js';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider.js';
import { ShareDropdown, type ShareDropdownProps } from './ShareDropdown.js';

let mobile = false;
beforeEach(() => {
  mobile = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => registerMessages('de'));

function renderShare(props: Partial<ShareDropdownProps> = {}, canvasText = 'Hallo Welt') {
  return render(
    <CanvasEditorProvider
      services={{ fileDelivery: { ...browserFileDelivery, pickShareRoute: () => 'web-share' } }}
    >
      <AutoSaveStoreProvider>
        <ShareDropdown
          onCaptureCanvas={async () => null}
          onDownload={() => {}}
          onNavigateToGallery={() => {}}
          canvasText={canvasText}
          canvasType="freeform"
          canvasWidth={1080}
          canvasHeight={1080}
          shareToken={null}
          hostControl={{ open: true, onOpenChange: () => {} }}
          {...props}
        />
      </AutoSaveStoreProvider>
    </CanvasEditorProvider>
  );
}

const labels = () =>
  screen
    .getAllByRole('button')
    .map((b) => b.textContent?.trim())
    .filter(Boolean);

describe('ShareDropdown panel', () => {
  it('orders the tiles and leaves native share to mobile', () => {
    renderShare({
      onSaveAsTemplate: () => {},
      shareActions: [{ id: 'x', label: 'Extra', icon: <i /> }],
    });
    expect(labels()).toEqual(['Download', 'Extra', 'Vorlage', 'Beschreibung']);
  });

  it('puts the tiles above the access section on mobile and below it on desktop', () => {
    const accessSection = () => <p>Zugriff</p>;
    const { unmount } = renderShare({ accessSection });
    const access = screen.getByText('Zugriff');
    const tile = screen.getByText('Download');
    expect(access.compareDocumentPosition(tile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    mobile = true;
    renderShare({ accessSection });
    const accessM = screen.getByText('Zugriff');
    const tileM = screen.getByText('Download');
    expect(accessM.compareDocumentPosition(tileM) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('keeps all tiles in one row on desktop and wraps them on mobile', () => {
    const { unmount } = renderShare({
      onSaveAsTemplate: () => {},
      shareActions: [
        { id: 'a', label: 'A', icon: <i /> },
        { id: 'b', label: 'B', icon: <i /> },
      ],
    });
    const grid = document.querySelector('[data-slot="share-tiles"]');
    expect(grid?.className).toContain('grid-flow-col');
    unmount();
    mobile = true;
    renderShare();
    expect(document.querySelector('[data-slot="share-tiles"]')?.className).not.toContain(
      'grid-flow-col'
    );
  });

  it('shows no separate alt-text copy button on the description page', () => {
    renderShare();
    fireEvent.click(screen.getByText('Beschreibung'));
    expect(screen.queryByText('Alt-Text kopieren')).toBeNull();
    expect(screen.getByText('Beitragstext kopieren')).toBeTruthy();
  });

  it('puts native share first on mobile, inside a bottom sheet', () => {
    mobile = true;
    renderShare({ onSaveAsTemplate: () => {} });
    expect(labels()).toEqual(['Senden …', 'Download', 'Vorlage', 'Beschreibung']);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('speaks English', () => {
    registerMessages('en');
    renderShare();
    expect(labels()).toEqual(['Download', 'Description']);
  });

  it('shows the attention dot while the alt text is empty', () => {
    const { container, unmount } = renderShare({}, '');
    expect(
      container.ownerDocument.querySelector('[data-slot="share-tile-attention"]')
    ).toBeTruthy();
    unmount();
    renderShare({}, 'Hallo Welt');
    expect(document.querySelector('[data-slot="share-tile-attention"]')).toBeNull();
  });

  it('opens the description page and copies the post text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderShare({ getPhotoCredit: () => 'Foto: Ada auf Unsplash' });
    fireEvent.click(screen.getByText('Beschreibung'));
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.getByText('Foto: Ada auf Unsplash')).toBeTruthy();
    fireEvent.click(screen.getByText('Beitragstext kopieren'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toContain('Foto: Ada auf Unsplash');
    expect(await screen.findByText('Kopiert')).toBeTruthy();
    fireEvent.click(screen.getByText('Beschreibung', { selector: 'button' }));
    expect(screen.getByText('Download')).toBeTruthy();
  });

  it('opens a custom action page and goes back', () => {
    renderShare({
      shareActions: [
        {
          id: 'a',
          label: 'Meine Aktion',
          icon: <i />,
          page: { title: 'Seite A', render: () => <p>Inhalt A</p> },
        },
      ],
    });
    fireEvent.click(screen.getByText('Meine Aktion'));
    expect(screen.getByText('Inhalt A')).toBeTruthy();
    fireEvent.click(screen.getByText('Seite A'));
    expect(screen.getByText('Meine Aktion')).toBeTruthy();
  });

  it('runs onSelect with a nav', () => {
    const onSelect = vi.fn();
    renderShare({ shareActions: [{ id: 'a', label: 'Tu was', icon: <i />, onSelect }] });
    fireEvent.click(screen.getByText('Tu was'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ openPage: expect.any(Function) })
    );
  });

  it('lets the access section open a sub-page', () => {
    renderShare({
      accessSection: (nav) => (
        <button
          type="button"
          onClick={() =>
            nav.openPage({ title: 'Zugriff', render: () => <p>Personen mit Zugriff</p> })
          }
        >
          Zugriff öffnen
        </button>
      ),
    });
    fireEvent.click(screen.getByText('Zugriff öffnen'));
    expect(screen.getByText('Personen mit Zugriff')).toBeTruthy();
  });

  it('shows the Personen tile only without accessSection', () => {
    const { unmount } = renderShare({ onInvitePeople: () => {} });
    expect(screen.getByText('Personen')).toBeTruthy();
    unmount();
    renderShare({ onInvitePeople: () => {}, accessSection: () => <p>Zugriff</p> });
    expect(screen.queryByText('Personen')).toBeNull();
  });

  it('lets a custom page capture the image through nav', async () => {
    const onCaptureCanvas = vi.fn().mockResolvedValue('data:image/png;base64,AAA');
    const seen: Array<string | null> = [];
    renderShare({
      onCaptureCanvas,
      shareActions: [
        {
          id: 'a',
          label: 'Posten',
          icon: <i />,
          page: {
            title: 'Seite P',
            render: (nav) => (
              <button
                type="button"
                onClick={() => void nav.captureImage().then((u) => seen.push(u))}
              >
                Bild holen
              </button>
            ),
          },
        },
      ],
    });
    fireEvent.click(screen.getByText('Posten'));
    fireEvent.click(screen.getByText('Bild holen'));
    await vi.waitFor(() => expect(seen).toEqual(['data:image/png;base64,AAA']));
  });
});
