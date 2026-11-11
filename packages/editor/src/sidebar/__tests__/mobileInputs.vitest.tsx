// SPDX-License-Identifier: AGPL-3.0-only
import { TextField } from '../components/TextFieldPrimitives.js';
import { ElementsPanel } from '../sections/assets/ElementsPanel.js';
import { UploadsSection } from '../sections/UploadsSection.js';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as IconifyReact from '@iconify/react';

// No host services: the galleries fall back to an empty list (hostServices.ts).
// Partial: the editor registers its offline icon sets through the real `addCollection` on import.
vi.mock('@iconify/react', async (importOriginal) => ({
  ...(await importOriginal<typeof IconifyReact>()),
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { initialData?: () => unknown }) => ({
    data: options.initialData?.(),
    isLoading: false,
  }),
}));
vi.mock('../UserUploadsProvider.js', () => ({
  useUserUploads: () => ({
    items: [],
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

describe('mobile input text size', () => {
  beforeEach(setMobileViewport);

  it('text tab textarea stays at 16px on the phone', () => {
    render(
      <TextField
        config={{ id: 'headline', label: 'Titel', type: 'textarea' } as never}
        value="Hallo"
        onChange={() => {}}
        fontSize={40}
        onFontSizeChange={() => {}}
      />
    );
    expect(screen.getByRole('textbox')).toHaveClass('max-canvas-mobile:text-base');
  });

  it('elements search: 16px and a search key', () => {
    render(<ElementsPanel onAddShape={() => {}} />);
    const search = screen.getByRole('searchbox');
    expect(search).toHaveClass('max-canvas-mobile:text-base');
    expect(search).toHaveAttribute('enterkeyhint', 'search');
  });

  it('uploads search: 16px and a search key', () => {
    render(<UploadsSection />);
    const search = screen.getByRole('searchbox');
    expect(search).toHaveClass('max-canvas-mobile:text-base');
    expect(search).toHaveAttribute('enterkeyhint', 'search');
  });
});
