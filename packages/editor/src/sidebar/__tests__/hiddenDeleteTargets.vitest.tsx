// SPDX-License-Identifier: AGPL-3.0-only
import { PageToolbar } from '../../components/PageToolbar.js';
import { UploadsSection } from '../sections/UploadsSection.js';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../UserUploadsProvider.js', () => ({
  useUserUploads: () => ({
    items: [{ id: 'm1', title: 'Foto', thumbnailUrl: '/t.jpg', originalFilename: 'foto.jpg' }],
    isLoading: false,
    error: null,
    search: '',
    setSearch: () => {},
    upload: async () => null,
    deleteFromLibrary: async () => true,
    isUploading: false,
    uploadProgress: 0,
    uploadError: null,
    hasMore: false,
    loadMore: async () => {},
  }),
}));

function setMobileViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('delete without a hidden target', () => {
  beforeEach(setMobileViewport);

  it('upload delete is visible on the phone and 44pt large', () => {
    render(<UploadsSection />);
    const del = screen.getByRole('button', { name: 'Bild aus Bibliothek entfernen' });
    expect(del).toHaveClass('max-canvas-mobile:opacity-100');
    expect(del).toHaveClass('max-canvas-mobile:size-11');
  });

  it('upload delete in the wide masonry view carries the same mobile classes', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<UploadsSection />);
    const del = screen.getByRole('button', { name: 'Bild aus Bibliothek entfernen' });
    expect(del).toHaveClass('max-canvas-mobile:opacity-100');
    expect(del).toHaveClass('max-canvas-mobile:size-11');
  });

  function toolbar(isActive: boolean) {
    const { container } = render(
      <PageToolbar
        pageIndex={0}
        pageCount={2}
        isActive={isActive}
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />
    );
    return container.firstElementChild as HTMLElement;
  }

  it('PageToolbar: an inactive page is invisible and not tappable on the phone', () => {
    const el = toolbar(false);
    expect(el).toHaveClass('opacity-0');
    expect(el).toHaveClass('max-canvas-mobile:invisible');
  });

  it('PageToolbar: the active page keeps its bar', () => {
    const el = toolbar(true);
    expect(el).not.toHaveClass('max-canvas-mobile:invisible');
  });
});
