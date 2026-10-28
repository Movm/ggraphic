// SPDX-License-Identifier: AGPL-3.0-only
import { type BrandPack } from '@ggraphic/core';
import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import { CanvasEditorShell } from '@ggraphic/editor/components/CanvasEditor/CanvasEditorShell';
import { type CanvasEditorExportApi } from '@ggraphic/editor/components/CanvasEditor/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { PiArrowLeft } from 'react-icons/pi';

import { api, ApiError, type Project, type StudioConfig } from '../api/client';
import { applyBrandPack } from '../brandLoader';
import { parseDocument } from '../editor/document';
import { createStudioServices } from '../editor/services';
import { useAutosave, type SaveStatus } from '../editor/useAutosave';
import { navigate } from '../router';

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  error: 'Not saved',
  conflict: 'Changed elsewhere',
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
  const organisationId = project.data?.organisationId ?? null;
  // The project's organisation brand, registered before the editor mounts.
  const brand = useQuery({
    queryKey: ['editor-brand', organisationId],
    queryFn: async (): Promise<BrandPack | null> => {
      let pack: BrandPack | null = null;
      try {
        pack = (await api.getBrandPack(organisationId!)).pack;
      } catch {
        // No brand reachable: the editor opens with the Studio's own pack.
      }
      await applyBrandPack(pack);
      return pack;
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
    const missing = project.error instanceof ApiError && project.error.status === 404;
    return (
      <main className="studio-page">
        <div role="alert" className="studio-error">
          <p>{missing ? 'This project does not exist.' : 'The project could not be opened.'}</p>
          <button type="button" className="studio-button" onClick={() => navigate('/')}>
            Back to projects
          </button>
        </div>
      </main>
    );
  }
  // A new key after a reload remounts the editor with the fresh document.
  return (
    <ProjectEditor
      key={`${project.data.id}:${project.dataUpdatedAt}`}
      project={project.data}
      config={config}
      logo={brand.data?.logo ?? null}
      onReload={() => void project.refetch()}
    />
  );
}

function ProjectEditor({
  project,
  config,
  logo,
  onReload,
}: {
  project: Project;
  config: StudioConfig;
  logo: BrandPack['logo'];
  onReload: () => void;
}) {
  const exportApi = useRef<CanvasEditorExportApi>(null);
  // The editor takes its pages on mount and owns them afterwards.
  const doc = useMemo(() => parseDocument(project.document), [project.document]);
  const services = useMemo(
    () =>
      createStudioServices({
        ai: config.features.ai,
        organisationId: project.organisationId,
        logo,
      }),
    [config, project.organisationId, logo]
  );
  const autosave = useAutosave({
    projectId: project.id,
    formatId: doc.formatId,
    initialVersion: project.version,
    exportApi,
    thumbnailMaxBytes: config.limits.thumbnailBytes,
    hasThumbnail: project.thumbnailUrl !== null,
  });

  const leave = async () => {
    await autosave.flush();
    navigate('/');
  };

  return (
    <CanvasEditorProvider services={services}>
      <div className="studio-editor">
        {autosave.status === 'conflict' ? (
          <div role="alert" className="studio-banner">
            <span>
              This project was changed in another window. Reload to see that version, or keep yours
              and overwrite it.
            </span>
            <button type="button" className="studio-button" onClick={onReload}>
              Reload
            </button>
            <button
              type="button"
              className="studio-button"
              onClick={() => void autosave.overwrite()}
            >
              Overwrite with mine
            </button>
          </div>
        ) : null}
        {autosave.status === 'error' ? (
          <div role="alert" className="studio-banner">
            <span>Your changes could not be saved.</span>
            <button type="button" className="studio-button" onClick={autosave.retry}>
              Try again
            </button>
          </div>
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
