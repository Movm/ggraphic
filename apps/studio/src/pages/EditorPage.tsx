// SPDX-License-Identifier: AGPL-3.0-only
import { type BrandPack } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { messages } from '@ggraphic/editor/i18n/messages';
import { CanvasEditorShell } from '@ggraphic/editor/components/CanvasEditor/CanvasEditorShell';
import { type CanvasEditorExportApi } from '@ggraphic/editor/components/CanvasEditor/types';
import { Alert, Button } from '@ggraphic/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { PiArrowLeft } from 'react-icons/pi';

import { api, ApiError, type Project, type StudioConfig } from '../api/client';
import { applyBrandPack } from '../brandLoader';
import { parseDocument, type StudioDocument } from '../editor/document';
import { rebindStudioDocument } from '../editor/rebind';
import { createStudioServices } from '../editor/services';
import { useAutosave, type SaveStatus } from '../editor/useAutosave';
import { logoSizeOf } from '../logoSize';
import { navigate, TRASH_PATH } from '../router';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
  conflict: 'Changed elsewhere',
  refused: 'Not saved',
  gone: 'Not saved',
};

const NOOP = () => {};

export function EditorPage({ projectId, config }: { projectId: string; config: StudioConfig }) {
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId),
    // The editor owns the document once it is open: no refetch under it.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const restore = useMutation({
    mutationFn: () => api.restoreProject(projectId),
    onSuccess: () => void project.refetch(),
  });
  // The project's own organisation, not the session's: legacy multi-organisation accounts.
  const organisationId = project.data?.organisationId ?? null;
  // The project's organisation brand, registered before the editor mounts.
  const brand = useQuery({
    queryKey: ['editor-brand', organisationId],
    queryFn: async (): Promise<{ pack: BrandPack | null; reachable: boolean }> => {
      let pack: BrandPack | null = null;
      let reachable = true;
      try {
        pack = (await api.getBrandPack(organisationId!)).pack;
      } catch {
        // Not "no pack saved": the brand is unknown. The editor shows the Studio's own pack,
        // but the document is opened as stored, never rebound against it.
        reachable = false;
      }
      await applyBrandPack(pack);
      return { pack, reachable };
    },
    enabled: organisationId !== null,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (project.isPending || (project.isSuccess && brand.isPending)) {
    return (
      <div className="studio-editor-loading" role="status">
        Opening the project…
      </div>
    );
  }
  if (project.isError) {
    const failure = project.error instanceof ApiError ? project.error : null;
    if (failure?.code === 'trashed') {
      return (
        <main className="ui-root studio-standalone">
          <Alert tone="warning" role="alert">
            <p className="studio-alert-text">This project is in the Trash.</p>
            <Button
              variant="outline"
              size="sm"
              disabled={restore.isPending}
              onClick={() => restore.mutate()}
            >
              Restore
            </Button>{' '}
            <a
              href={TRASH_PATH}
              onClick={(e) => {
                e.preventDefault();
                navigate(TRASH_PATH);
              }}
            >
              Open the Trash
            </a>
          </Alert>
        </main>
      );
    }
    return (
      <main className="ui-root studio-standalone">
        <Alert tone="danger">
          <p className="studio-alert-text">
            {failure?.status === 404
              ? 'This project does not exist.'
              : 'The project could not be opened.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            Back to projects
          </Button>
        </Alert>
      </main>
    );
  }
  // A new key after a reload remounts the editor with the fresh document.
  return (
    <ProjectEditor
      key={`${project.data.id}:${project.dataUpdatedAt}`}
      project={project.data}
      config={config}
      logo={brand.data?.pack?.logo ?? null}
      rebind={brand.data?.reachable ?? true}
      onReload={() => void project.refetch()}
    />
  );
}

function ProjectEditor(props: {
  project: Project;
  config: StudioConfig;
  logo: BrandPack['logo'];
  /** False when the brand could not be loaded: the document stays as stored. */
  rebind: boolean;
  onReload: () => void;
}) {
  const parsed = useMemo(() => parseDocument(props.project.document), [props.project.document]);
  if (parsed.kind === 'refused') {
    // No editor, no autosave: saving would store the old shape over a newer document.
    return (
      <main className="ui-root studio-standalone">
        <Alert tone="danger" role="alert">
          <p className="studio-alert-text">{messages().shell.schemaRefusal[parsed.reason]}</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            Back to projects
          </Button>
        </Alert>
      </main>
    );
  }
  return <OpenProject {...props} parsed={parsed.doc} />;
}

function OpenProject({
  project,
  config,
  logo,
  rebind,
  onReload,
  parsed,
}: {
  project: Project;
  config: StudioConfig;
  logo: BrandPack['logo'];
  rebind: boolean;
  onReload: () => void;
  parsed: StudioDocument;
}) {
  // The brand query has settled, so the organisation's pack is the active one: bound page
  // fields follow it before the editor opens. What is saved is judged against `parsed`.
  const { doc, changed } = useMemo(() => {
    if (!rebind) return { doc: parsed, changed: false };
    // The brand loader measured the logo before the query settled; a failed measurement is null.
    const brand = activeBrand();
    return rebindStudioDocument(parsed, {
      brand,
      logoSize: brand.logo ? logoSizeOf(brand.logo.src) : null,
    });
  }, [parsed, rebind]);
  const exportApi = useRef<CanvasEditorExportApi>(null);
  const services = useMemo(
    () =>
      createStudioServices({
        ai: config.features.ai,
        removeBackground: config.features.removeBackground,
        organisationId: project.organisationId,
        logo,
      }),
    [config, project.organisationId, logo]
  );
  const autosave = useAutosave({
    projectId: project.id,
    base: doc,
    baseline: changed ? parsed : undefined,
    initialVersion: project.version,
    exportApi,
    thumbnailMaxBytes: config.limits.thumbnailBytes,
    hasThumbnail: project.thumbnailUrl !== null,
  });

  const leave = async () => {
    await autosave.flush();
    // Whatever blocked the save (trashed, newer format, conflict, network): the edits would be lost.
    if (
      autosave.hasUnsaved() &&
      !window.confirm('Your latest changes are not saved. Leave without saving them?')
    ) {
      return;
    }
    navigate('/');
  };

  return (
    <CanvasEditorProvider services={services}>
      <div className="studio-editor">
        {autosave.status === 'conflict' ? (
          <Alert tone="warning" role="alert" className="studio-banner">
            <span>
              This project was changed in another window. Reload to see that version, or keep yours
              and overwrite it.
            </span>
            <span className="studio-banner__actions">
              <Button variant="outline" size="sm" onClick={onReload}>
                Reload
              </Button>
              <Button variant="outline" size="sm" onClick={() => void autosave.overwrite()}>
                Overwrite with mine
              </Button>
            </span>
          </Alert>
        ) : null}
        {autosave.status === 'refused' ? (
          <Alert tone="danger" role="alert" className="studio-banner">
            <span>
              This project was saved by a newer version of ggraphic. It can no longer be edited
              here: reload to continue.
            </span>
            <span className="studio-banner__actions">
              <Button variant="outline" size="sm" onClick={onReload}>
                Reload
              </Button>
            </span>
          </Alert>
        ) : null}
        {autosave.status === 'gone' ? (
          <Alert tone="danger" role="alert" className="studio-banner">
            <span>
              This project was moved to the trash or deleted. Restore it from the{' '}
              {/* A new tab: leaving this one would drop the unsaved edits. */}
              <a href={TRASH_PATH} target="_blank" rel="noreferrer">
                Trash
              </a>{' '}
              to keep your changes.
            </span>
            <span className="studio-banner__actions">
              <Button variant="outline" size="sm" onClick={autosave.retry}>
                Try again
              </Button>
            </span>
          </Alert>
        ) : null}
        {autosave.status === 'error' ? (
          <Alert tone="danger" className="studio-banner">
            <span>Your changes could not be saved.</span>
            <span className="studio-banner__actions">
              <Button variant="outline" size="sm" onClick={autosave.retry}>
                Try again
              </Button>
            </span>
          </Alert>
        ) : null}
        <CanvasEditorShell
          initialConfigId={doc.pages[0]!.configId}
          initialPages={doc.pages}
          initialProps={{}}
          formatId={doc.formatId}
          documentTitle={project.name}
          onExport={NOOP}
          onCancel={() => void leave()}
          galleryAutoSave={false}
          readOnly={autosave.status === 'refused'}
          exportApiRef={exportApi}
          chromeLeft={
            <button
              type="button"
              className="studio-chrome-button"
              onClick={() => void leave()}
              aria-label="Back to projects"
              title="Back to projects"
            >
              <PiArrowLeft size={20} aria-hidden />
            </button>
          }
          chromeCenter={
            <span className="studio-chrome-title">
              <span className="studio-chrome-title__name">{project.name}</span>
              <span className="studio-chrome-title__status" aria-live="polite">
                {STATUS_TEXT[autosave.status]}
              </span>
            </span>
          }
        />
      </div>
    </CanvasEditorProvider>
  );
}
