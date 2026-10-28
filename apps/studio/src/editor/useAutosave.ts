// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Saves the open project: the editor's pages are read every second
 * (`CanvasEditorExportApi.getPages`), and once they have changed and then
 * held still for a moment, `PATCH /api/projects/:id` stores them with the
 * version last read. A 409 stops saving until the user decides (reload, or
 * overwrite with the version on screen). A 404 (the project was trashed meanwhile) stops it too. A PNG thumbnail follows a save, at
 * most every half minute.
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
   * the document on opening: that change is then an unsaved edit and is saved once. Without it
   * the baseline is what the editor opens with.
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
  const [status, setStatus] = useState<SaveStatus>('saved');
  const versionRef = useRef(initialVersion);
  const savedJsonRef = useRef<string | null>(
    baseline ? JSON.stringify(serializeDocument(baseline)) : null
  );
  const firstReadRef = useRef(true);
  const changedAtRef = useRef(0);
  const busyRef = useRef(false);
  const blockedRef = useRef(false);
  const thumbnailAtRef = useRef(0);

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
    async (force = false) => {
      const doc = currentDocument();
      if (!doc || busyRef.current) return;
      const json = JSON.stringify(doc);
      if (!force && json === savedJsonRef.current) return;
      busyRef.current = true;
      setStatus('saving');
      try {
        const saved = await api.updateProject(projectId, {
          version: versionRef.current,
          document: doc as unknown as Record<string, unknown>,
          schemaVersion: doc.schemaVersion,
        });
        versionRef.current = saved.version;
        savedJsonRef.current = json;
        blockedRef.current = false;
        setStatus(JSON.stringify(currentDocument()) === json ? 'saved' : 'pending');
        if (Date.now() - thumbnailAtRef.current > THUMBNAIL_EVERY_MS) {
          thumbnailAtRef.current = Date.now();
          // Best effort: a missing thumbnail must not show as a failed save.
          void uploadThumbnail().catch(() => undefined);
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
      } finally {
        busyRef.current = false;
      }
    },
    [currentDocument, projectId, uploadThumbnail]
  );

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
        savedJsonRef.current ??= json;
        if (!hasThumbnail) {
          thumbnailAtRef.current = Date.now();
          // A moment for images and fonts to land on the stage.
          setTimeout(() => void uploadThumbnail().catch(() => undefined), SETTLE_MS);
        }
      }
      if (json === savedJsonRef.current) return;
      const now = Date.now();
      if (changedAtRef.current === 0) changedAtRef.current = now;
      setStatus((s) => (s === 'saving' ? s : 'pending'));
      if (now - changedAtRef.current < SETTLE_MS) return;
      changedAtRef.current = 0;
      void save();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [currentDocument, save, hasThumbnail, uploadThumbnail]);

  // Leaving the page with unsaved changes: the browser asks first.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const doc = currentDocument();
      if (doc && savedJsonRef.current !== null && JSON.stringify(doc) !== savedJsonRef.current) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [currentDocument]);

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

  /** Saves now, e.g. before leaving the editor. */
  const flush = useCallback(() => (blockedRef.current ? Promise.resolve() : save()), [save]);

  /** True while what is on screen differs from what was last stored. */
  const hasUnsaved = useCallback(() => {
    const doc = currentDocument();
    return (
      doc !== null && savedJsonRef.current !== null && JSON.stringify(doc) !== savedJsonRef.current
    );
  }, [currentDocument]);

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
