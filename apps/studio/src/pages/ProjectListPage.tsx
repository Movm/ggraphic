// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';

import { api, ApiError, type ProjectSummary } from '../api/client';
import {
  DEFAULT_FORMAT,
  newDocument,
  STUDIO_FORMATS,
  type StudioFormatId,
} from '../editor/document';
import { TEMPLATE_CATALOG } from '../editor/templates/catalog';
import { BLANK_TEMPLATE_ID, type StudioTemplateId } from '../editor/templates/ids';
import { editorPath, navigate } from '../router';
import { useLoggedIn } from '../session/SessionContext';
import { AccountBar } from '../ui/AccountBar';
import { toast } from '../ui/toast';

export const PROJECTS_QUERY_KEY = ['projects'] as const;
export const projectsKey = (orgId: string) => [...PROJECTS_QUERY_KEY, orgId] as const;

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong.';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function ProjectListPage() {
  const queryClient = useQueryClient();
  const { organisation } = useLoggedIn();
  const projects = useQuery({
    queryKey: projectsKey(organisation.id),
    queryFn: () => api.listProjects(organisation.id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });

  return (
    <main className="studio-page">
      <header className="studio-header">
        <h1 className="studio-logo">All projects</h1>
        <AccountBar />
        <a
          className="studio-link"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          Create from a prompt
        </a>
      </header>
      <NewProjectForm />
      <section aria-labelledby="projects-heading" className="studio-section">
        <h2 id="projects-heading" className="studio-section__title">
          Your projects
        </h2>
        {projects.isPending ? <p className="studio-muted">Loading projects…</p> : null}
        {projects.isError ? (
          <div role="alert" className="studio-error">
            <p>{errorText(projects.error)}</p>
            <button type="button" className="studio-button" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : null}
        {projects.data?.length === 0 ? (
          <p className="studio-muted">No projects yet. Create your first one above.</p>
        ) : null}
        {projects.data && projects.data.length > 0 ? (
          <ul className="studio-grid">
            {projects.data.map((project) => (
              <ProjectCard key={project.id} project={project} onChanged={() => void refresh()} />
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}

function NewProjectForm() {
  const queryClient = useQueryClient();
  const { organisation } = useLoggedIn();
  const [name, setName] = useState('');
  const [formatId, setFormatId] = useState<StudioFormatId>(DEFAULT_FORMAT);
  const [templateId, setTemplateId] = useState<StudioTemplateId>(BLANK_TEMPLATE_ID);
  const nameId = useId();

  const create = useMutation({
    mutationFn: () =>
      api.createProject(organisation.id, {
        name: name.trim() || 'Untitled',
        document: newDocument(formatId, templateId) as unknown as Record<string, unknown>,
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      navigate(editorPath(project.id));
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!create.isPending) create.mutate();
  };

  return (
    <form className="studio-section studio-new" onSubmit={submit} aria-labelledby="new-heading">
      <h2 id="new-heading" className="studio-section__title">
        New project
      </h2>
      <div className="studio-field">
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          value={name}
          maxLength={200}
          placeholder="Untitled"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <fieldset className="studio-choices">
        <legend>Format</legend>
        {STUDIO_FORMATS.map((format) => (
          <label key={format.id} className="studio-choice">
            <input
              type="radio"
              name="format"
              value={format.id}
              checked={formatId === format.id}
              onChange={() => setFormatId(format.id)}
            />
            <span>
              <strong>{format.label}</strong> {format.size}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="studio-choices">
        <legend>Start with</legend>
        {TEMPLATE_CATALOG.map((template) => (
          <label key={template.id} className="studio-choice">
            <input
              type="radio"
              name="template"
              value={template.id}
              checked={templateId === template.id}
              onChange={() => setTemplateId(template.id)}
            />
            <span>
              <strong>{template.label}</strong> {template.description}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        className="studio-button studio-button--primary"
        disabled={create.isPending}
      >
        {create.isPending ? 'Creating…' : 'Create project'}
      </button>
    </form>
  );
}

function ProjectCard({ project, onChanged }: { project: ProjectSummary; onChanged: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (!next || next === project.name) {
      setRenaming(false);
      setName(project.name);
      return;
    }
    setBusy(true);
    try {
      await api.updateProject(project.id, { version: project.version, name: next });
      setRenaming(false);
      onChanged();
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.isVersionConflict
          ? 'The project changed in the meantime. The list was refreshed; try again.'
          : errorText(err)
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      onChanged();
    } catch (err) {
      toast.error(errorText(err));
      setBusy(false);
    }
  };

  return (
    <li className="studio-card">
      <a
        className="studio-card__thumb"
        href={editorPath(project.id)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          navigate(editorPath(project.id));
        }}
        aria-label={`Open ${project.name}`}
      >
        {project.thumbnailUrl ? (
          <img src={project.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <span className="studio-card__placeholder" aria-hidden="true">
            No preview yet
          </span>
        )}
      </a>
      <div className="studio-card__body">
        {renaming ? (
          <form onSubmit={(e) => void rename(e)} className="studio-rename">
            <label htmlFor={inputId} className="studio-visually-hidden">
              New name
            </label>
            <input
              id={inputId}
              value={name}
              maxLength={200}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setRenaming(false);
                  setName(project.name);
                }
              }}
            />
            <button type="submit" className="studio-button" disabled={busy}>
              Save
            </button>
          </form>
        ) : (
          <h3 className="studio-card__title">{project.name}</h3>
        )}
        <p className="studio-muted">Updated {dateFormat.format(new Date(project.updatedAt))}</p>
        <div className="studio-card__actions">
          {renaming ? null : (
            <button
              type="button"
              className="studio-button"
              aria-label={`Rename ${project.name}`}
              onClick={() => setRenaming(true)}
            >
              Rename
            </button>
          )}
          <button
            type="button"
            className="studio-button studio-button--danger"
            disabled={busy}
            aria-label={`Delete ${project.name}`}
            onClick={() => void remove()}
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
