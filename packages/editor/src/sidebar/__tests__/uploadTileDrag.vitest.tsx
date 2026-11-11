// SPDX-License-Identifier: AGPL-3.0-only
import { UploadsSection } from '../sections/UploadsSection.js';
import { MEDIA_DRAG_TYPE } from '../../utils/mediaDrop.js';
import { plainImageUrls, type CanvasImageUrlService } from '../../entries/services.js';
import { CanvasEditorProvider } from '../../entries/shell.js';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * An upload tile can be dragged onto a page (PageWrapper accepts it). The
 * permanent URL travels with it, never a blob: preview.
 */

vi.mock('../UserUploadsProvider.js', () => ({
  useUserUploads: () => ({
    items: [
      {
        id: 'm1',
        shareToken: 'tok',
        mediaType: 'image',
        title: 'Wiese',
        thumbnailUrl: '/api/share/tok/preview',
        mimeType: 'image/jpeg',
        originalFilename: 'wiese.jpg',
        altText: 'Wiese',
      },
    ],
    isLoading: false,
    error: null,
    search: '',
    setSearch: () => {},
    upload: async () => null,
    deleteFromLibrary: async () => {},
    uploadError: null,
    hasMore: false,
    loadMore: async () => {},
    // The host's thumbnail, handed through the uploads context.
    MediaThumb: ({ alt }: { alt: string }) => <img alt={alt} />,
  }),
}));

// Desktop grid.
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
);

/** A host that stores uploads as shares and places them from the share download link. */
const shareHost: CanvasImageUrlService = {
  ...plainImageUrls,
  placementUrl: (item) =>
    item.mediaUrl ||
    (item.shareToken ? `/api/share/${item.shareToken}/download` : item.thumbnailUrl),
};

describe('dragging an upload tile', () => {
  it('carries the permanent URL and the file name', () => {
    render(
      <CanvasEditorProvider services={{ imageUrls: shareHost }}>
        <UploadsSection onPlaceFromUrl={() => {}} />
      </CanvasEditorProvider>
    );
    const tile = screen.getByTitle('Wiese');
    expect(tile).toHaveAttribute('draggable', 'true');

    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (type: string, value: string) => {
        data[type] = value;
      },
      effectAllowed: 'none',
    };
    fireEvent.dragStart(tile, { dataTransfer });

    expect(JSON.parse(data[MEDIA_DRAG_TYPE]!)).toEqual({
      url: '/api/share/tok/download',
      name: 'wiese.jpg',
    });
    expect(dataTransfer.effectAllowed).toBe('copy');
  });
});
