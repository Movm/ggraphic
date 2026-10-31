// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Saves the open project: the editor's pages are read every second
 * (`CanvasEditorExportApi.getPages`), and once they have changed and then
 * held still for a moment, `PATCH /api/projects/:id` stores them with the
 * version last read. A 409 stops saving until the user decides (reload, or
 * overwrite with the version on screen). A 404 (the project was trashed meanwhile) stops it too. A PNG thumbnail follows a save, at
 * most every half minute; a save inside that window gets its thumbnail when the window ends, or on
 * leaving, whichever comes first.
 */
import { type CanvasEditorExportApi } from '@ggraphic/editor/components/CanvasEditor/types';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { api, ApiError } from '../api/client';

import { serializeDocument, type StudioDocument } from './document';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict' | 'refused' | 'gone';

const POLL_MS = 1000;
const SETTLE_MS = 1500;
const THUMBNAIL_EVERY_MS = 30_000;
const THUMBNAIL_WIDTH = 480;

interface Options {
  projectId: string;
  /** The document as opened: its format and any keys the Studio does not own. */
  base: StudioDocument;
  /**
   * The document as parsed, before the brand was applied to it. Given when the brand changed
   * the document on opening: that change is stored once, silently (no "Unsaved changes", no
   * leave warning, as the user edited nothing). Without it the baseline is what the editor
   * opens with.
   */
  baseline?: StudioDocument;
  initialVersion: number;
  exportApi: RefObject<CanvasEditorExportApi | null>;
  /** Longest thumbnail the server takes, in bytes. */
  thumbnailMaxBytes: number;
  /** False for a project without a thumbnail yet: one is made once the editor shows the design. */
  hasThumbnail: boolean;
}

export function useAutosave({
  projectId,
  base,
  baseline,
  initialVersion,
  exportApi,
  thumbnailMaxBytes,
  hasThumbnail,
}: Options) {
  const hasBaseline = baseline !== undefined;
  const [status, setStatus] = useState<SaveStatus>('saved');
  const versionRef = useRef(initialVersion);
  const savedJsonRef = useRef<string | null>(
    baseline ? JSON.stringify(serializeDocument(baseline)) : null
  );
  const firstReadRef = useRef(true);
  /** What the editor opened with: a difference from the stored document that is not an edit. */
  const openedJsonRef = useRef<string | null>(null);
  const changedAtRef = useRef(0);
  const openedSavedRef = useRef(false);
  const busyRef = useRef(false);
  const blockedRef = useRef(false);
  const thumbnailAtRef = useRef(0);
  /** A save got no thumbnail yet: the card still shows an older state. */
  const thumbnailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentDocument = useCallback(() => {
    const pages = exportApi.current?.getPages();
    if (!pages || pages.length === 0) return null;
    return serializeDocument({ ...base, pages });
  }, [exportApi, base]);

  const uploadThumbnail = useCallback(async () => {
    const dataUrl = await exportApi.current?.captureActivePage({ pixelRatio: 0.5 });
    if (!dataUrl) return;
    const png = await shrinkPng(dataUrl, THUMBNAIL_WIDTH);
    if (!png || png.size > thumbnailMaxBytes) return;
    await api.putThumbnail(projectId, png);
  }, [exportApi, projectId, thumbnailMaxBytes]);

  const save = useCallback(
    async (force = false, silent = false) => {
      const doc = currentDocument();
      if (!doc || busyRef.current) return;
      const json = JSON.stringify(doc);
      if (!force && json === savedJsonRef.current) return;
      busyRef.current = true;
      if (!silent) setStatus('saving');
      try {
        const saved = await api.updateProject(projectId, {
          version: versionRef.current,
          document: doc as unknown as Record<string, unknown>,
          schemaVersion: doc.schemaVersion,
        });
        versionRef.current = saved.version;
        savedJsonRef.current = json;
        // What was stored is the baseline now; an undo back to the opened state is an edit.
        openedJsonRef.current = null;
        blockedRef.current = false;
        setStatus(JSON.stringify(currentDocument()) === json ? 'saved' : 'pending');
        const sinceThumbnail = Date.now() - thumbnailAtRef.current;
        if (sinceThumbnail > THUMBNAIL_EVERY_MS) {
          thumbnailAtRef.current = Date.now();
          // Best effort: a missing thumbnail must not show as a failed save.
          void uploadThumbnail().catch(() => undefined);
        } else if (thumbnailTimerRef.current === null) {
          thumbnailTimerRef.current = setTimeout(() => {
            thumbnailTimerRef.current = null;
            thumbnailAtRef.current = Date.now();
            void uploadThumbnail().catch(() => undefined);
          }, THUMBNAIL_EVERY_MS - sinceThumbnail);
        }
      } catch (err) {
        if (err instanceof ApiError && err.isVersionConflict) {
          blockedRef.current = true;
          setStatus('conflict');
        } else if (err instanceof ApiError && err.isSchemaRefusal) {
          // The server holds a newer format: this build must not write over it.
          blockedRef.current = true;
          setStatus('refused');
        } else if (err instanceof ApiError && err.status === 404) {
          // Trashed or deleted in another tab: retrying would only 404 again. Restoring keeps
          // the version, so a later "Try again" succeeds.
          blockedRef.current = true;
          setStatus('gone');
        } else {
          setStatus('error');
        }
        // The opening change did not get stored: from here it is an ordinary unsaved change,
        // shown and retried like one.
        openedJsonRef.current = null;
      } finally {
        busyRef.current = false;
      }
    },
    [currentDocument, projectId, uploadThumbnail]
  );

  // Without a rebind baseline, what the editor opens with is its first read of the pages. Taken
  // as soon as the export API answers, not at the first poll: an edit made in between would
  // otherwise be adopted as "saved" and never stored.
  useEffect(() => {
    if (hasBaseline) return;
    const tryRead = () => {
      if (savedJsonRef.current !== null) return true;
      const doc = currentDocument();
      if (!doc) return false;
      savedJsonRef.current = JSON.stringify(doc);
      return true;
    };
    if (tryRead()) return;
    const timer = setInterval(() => {
      if (tryRead()) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [hasBaseline, currentDocument]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (blockedRef.current || busyRef.current) return;
      const doc = currentDocument();
      if (!doc) return;
      const json = JSON.stringify(doc);
      // The first read is what the editor opened with: nothing to save yet, unless the
      // baseline says the document was changed on opening.
      if (firstReadRef.current) {
        firstReadRef.current = false;
        // Only a rebind leaves the opened state different from the stored one.
        if (hasBaseline && savedJsonRef.current !== json) {
          openedJsonRef.current = json;
        }
        savedJsonRef.current ??= json;
        if (!hasThumbnail) {
          thumbnailAtRef.current = Date.now();
          // A moment for images and fonts to land on the stage.
          setTimeout(() => void uploadThumbnail().catch(() => undefined), SETTLE_MS);
        }
      }
      // The user moved away from the opened state: it is an edit target like any other.
      if (json !== openedJsonRef.current) openedJsonRef.current = null;
      if (json === savedJsonRef.current) return;
      if (json === openedJsonRef.current) {
        // The brand changed the document on opening: store it, and say nothing about it.
        if (!openedSavedRef.current) {
          openedSavedRef.current = true;
          void save(false, true);
        }
        return;
      }
      const now = Date.now();
      if (changedAtRef.current === 0) changedAtRef.current = now;
      setStatus((s) => (s === 'saving' ? s : 'pending'));
      if (now - changedAtRef.current < SETTLE_MS) return;
      changedAtRef.current = 0;
      void save();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [currentDocument, save, hasThumbnail, uploadThumbnail, hasBaseline]);

  /**
   * True while the user's edits are not stored: what is on screen differs from what was last
   * stored, and from what the editor opened with (the brand's rebind of the document is no edit).
   */
  const hasUnsaved = useCallback(() => {
    const doc = currentDocument();
    // Before the first read nothing was on screen to edit.
    if (doc === null || savedJsonRef.current === null) return false;
    if (hasBaseline && firstReadRef.current) return false;
    const json = JSON.stringify(doc);
    return json !== savedJsonRef.current && json !== openedJsonRef.current;
  }, [currentDocument, hasBaseline]);

  // Leaving the page with unsaved changes: the browser asks first.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsaved()) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved]);

  /** After a 409: store what is on screen over the newer version. */
  const overwrite = useCallback(async () => {
    try {
      const latest = await api.getProject(projectId);
      versionRef.current = latest.version;
      blockedRef.current = false;
      await save(true);
    } catch {
      setStatus('error');
    }
  }, [projectId, save]);

  useEffect(
    () => () => {
      if (thumbnailTimerRef.current !== null) clearTimeout(thumbnailTimerRef.current);
    },
    []
  );

  /** Saves now, e.g. before leaving the editor, with the thumbnail a save is still owed. */
  const flush = useCallback(async () => {
    if (blockedRef.current) return;
    await save();
    if (thumbnailTimerRef.current === null) return;
    clearTimeout(thumbnailTimerRef.current);
    thumbnailTimerRef.current = null;
    thumbnailAtRef.current = Date.now();
    await uploadThumbnail().catch(() => undefined);
  }, [save, uploadThumbnail]);

  return { status, overwrite, flush, hasUnsaved, retry: () => void save(true) };
}

async function shrinkPng(dataUrl: string, maxWidth: number): Promise<Blob | null> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
