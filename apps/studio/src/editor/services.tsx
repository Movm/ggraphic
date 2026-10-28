// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The host services the Studio hands the editor (`CanvasEditorProvider`):
 * uploads go to `POST /api/orgs/:orgId/uploads`, the organisation's logo is
 * offered in the Uploads tab, downloads are named `ggraphic-…`, and the
 * AI draft tab appears only when the server has AI turned on. The Tools tab
 * needs no service: it offers QR code, blob, gradient text and text path.
 *
 * Not supplied, so the editor runs on its fallbacks: stock photos, Unsplash
 * (no key in this version), AI images, background removal, gallery autosave
 * (`imageShares`: the Studio saves the document itself), print, carousel.
 */
import { type CanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import {
  browserFileDelivery,
  plainImageUrls,
  type CanvasImageUrlService,
  type CanvasMediaItem,
  type CanvasMediaLibraryService,
  type CanvasMediaUploadResult,
  type CanvasMediaUploadState,
} from '@ggraphic/editor/hostServices';
import { useState, useSyncExternalStore } from 'react';

import { api, ApiError, type Draft } from '../api/client';

/** The AI draft behind the "AI draft" tab (`aiDraftTab.tsx`). */
export interface StudioAiDraftService {
  draft: (briefing: string, size: { width: number; height: number }) => Promise<Draft>;
}

declare module '@ggraphic/editor/CanvasEditorProvider' {
  interface CanvasEditorHostServices {
    /** When omitted, the AI draft tab is hidden. */
    aiDraft?: StudioAiDraftService;
  }
}

// ── Uploads ────────────────────────────────────────────────────────────────

/** Uploads one image and returns its durable URL. */
export async function uploadImage(
  organisationId: string,
  file: Blob,
  filename = 'image'
): Promise<string> {
  const { url } = await api.upload(organisationId, file, filename);
  return url;
}

/**
 * The server keeps uploads but does not list them, so the Uploads tab shows
 * the images uploaded since the app was opened.
 */
let sessionUploads: CanvasMediaItem[] = [];
const uploadListeners = new Set<() => void>();
const setSessionUploads = (next: CanvasMediaItem[]) => {
  sessionUploads = next;
  uploadListeners.forEach((listener) => listener());
};
const subscribeUploads = (listener: () => void) => {
  uploadListeners.add(listener);
  return () => uploadListeners.delete(listener);
};

const useSessionUploads: CanvasMediaLibraryService['useMediaLibrary'] = () => {
  const items = useSyncExternalStore(subscribeUploads, () => sessionUploads);
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  return {
    items: query
      ? items.filter((item) => (item.originalFilename ?? '').toLowerCase().includes(query))
      : items,
    isLoading: false,
    error: null,
    pagination: { hasMore: false },
    setFilters: ({ search: next }) => setSearch(next),
    deleteItem: (id) => {
      setSessionUploads(sessionUploads.filter((item) => item.id !== id));
      return Promise.resolve();
    },
    loadMore: () => Promise.resolve(),
  };
};

const makeUseStudioUpload = (organisationId: string) => (): CanvasMediaUploadState => {
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  return {
    upload: async (file) => {
      setActive((n) => n + 1);
      setError(null);
      try {
        const url = await uploadImage(organisationId, file, file.name);
        const item: CanvasMediaItem = {
          id: url,
          shareToken: url,
          title: file.name,
          thumbnailUrl: url,
          mediaUrl: url,
          altText: null,
          originalFilename: file.name,
        };
        setSessionUploads([item, ...sessionUploads]);
        const result: CanvasMediaUploadResult = { id: url, shareToken: url };
        return result;
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The upload failed.');
        return null;
      } finally {
        setActive((n) => n - 1);
      }
    },
    isUploading: active > 0,
    progress: 0,
    error,
  };
};

/**
 * Where an upload is placed from. The editor's uploads provider passes on only
 * `id` and `shareToken` of an upload result, so the Studio keeps the image URL
 * in `shareToken` as well.
 */
const studioImageUrls: CanvasImageUrlService = {
  ...plainImageUrls,
  placementUrl: (item) =>
    item.mediaUrl ||
    item.thumbnailUrl ||
    (item.shareToken.startsWith('/api/uploads/') ? item.shareToken : null),
};

const UploadThumb: CanvasMediaLibraryService['MediaThumb'] = ({ item, alt }) => (
  <img src={item.thumbnailUrl ?? item.mediaUrl ?? ''} alt={alt} loading="lazy" />
);

/** Test seam: forget this session's uploads. */
export function resetSessionUploads(): void {
  setSessionUploads([]);
}

// ── The services object ────────────────────────────────────────────────────

let uploadsOrganisation: string | null = null;

export function createStudioServices({
  ai,
  organisationId,
  logo = null,
}: {
  ai: boolean;
  organisationId: string;
  /** The organisation's logo, offered first in the Uploads tab. */
  logo?: { src: string; label: string } | null;
}): CanvasEditorServices {
  // The list is per organisation: another organisation's images are not offered.
  if (uploadsOrganisation !== organisationId) {
    uploadsOrganisation = organisationId;
    setSessionUploads([]);
  }
  if (logo && !sessionUploads.some((item) => item.id === logo.src)) {
    setSessionUploads([
      {
        id: logo.src,
        shareToken: logo.src,
        title: logo.label,
        thumbnailUrl: logo.src,
        mediaUrl: logo.src,
        altText: logo.label,
        originalFilename: logo.label,
      },
      ...sessionUploads,
    ]);
  }
  return {
    uploadImage: (file, opts) => uploadImage(organisationId, file, opts?.filename),
    mediaLibrary: {
      useMediaLibrary: useSessionUploads,
      useMediaUpload: makeUseStudioUpload(organisationId),
      MediaThumb: UploadThumb,
    },
    imageUrls: studioImageUrls,
    fileDelivery: { ...browserFileDelivery, filenamePrefix: 'ggraphic', shareTitle: 'ggraphic' },
    unsplashUtmSource: 'ggraphic',
    qrPreviewUrl: 'https://example.org',
    ...(ai
      ? {
          aiDraft: {
            draft: (briefing, { width, height }) => api.draft({ briefing, width, height }),
          },
        }
      : {}),
  };
}
