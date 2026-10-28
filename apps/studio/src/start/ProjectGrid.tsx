// SPDX-License-Identifier: AGPL-3.0-only
/** "Your projects" on the start page: every project of the organisation, newest first, with a name search. */
import { Alert, Button, Card, CardBody, CardMedia, CardTitle, TextField } from '@ggraphic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { api, ApiError, type ProjectSummary } from '../api/client';
import { PROJECTS_QUERY_KEY, projectsKey } from '../projects/projectsKey';
import { editorPath, navigate, TRASH_PATH } from '../router';
import { useLoggedIn } from '../session/SessionContext';
import { toast } from '../ui/toast';

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong.';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

const byNewest = (a: ProjectSummary, b: ProjectSummary) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

export function ProjectGrid() {
  const queryClient = useQueryClient();
  const { organisation } = useLoggedIn();
  const [search, setSearch] = useState('');
  const projects = useQuery({
    queryKey: projectsKey(organisation.id),
    queryFn: () => api.listProjects(organisation.id),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });

  const all = [...(projects.data ?? [])].sort(byNewest);
  const needle = search.trim().toLowerCase();
  const shown = needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;

  return (
    <section className="studio-start__section" aria-labelledby="projects-heading">
      <div className="studio-start__head">
        <h2 id="projects-heading" className="studio-start__heading">
          Your projects
        </h2>
        <a
          className="ui-link studio-link"
          href={TRASH_PATH}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            navigate(TRASH_PATH);
          }}
        >
          Trash
        </a>
        {all.length > 0 ? (
          <TextField
            type="search"
            label="Search projects"
            className="studio-search"
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        ) : null}
      </div>
      {projects.isPending ? <p className="studio-muted">Loading projects…</p> : null}
      {projects.isError ? (
        <Alert tone="danger">
          <p className="studio-alert-text">{errorText(projects.error)}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Try again
          </Button>
        </Alert>
      ) : null}
      {projects.data && all.length === 0 ? (
        <p className="studio-muted">No projects yet. Describe your first graphic above.</p>
      ) : null}
      {needle && all.length > 0 ? (
        <p className="studio-muted" role="status">
          {shown.length} of {all.length} projects
        </p>
      ) : null}
      {needle && all.length > 0 && shown.length === 0 ? (
        <p className="studio-muted">No project matches “{search.trim()}”.</p>
      ) : null}
      {shown.length > 0 ? (
        <ul className="studio-grid" aria-label="Projects">
          {shown.map((project) => (
            <ProjectCard key={project.id} project={project} onChanged={() => void refresh()} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ProjectCard({ project, onChanged }: { project: ProjectSummary; onChanged: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);

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

  const moveToTrash = async () => {
    setBusy(true);
    try {
      await api.deleteProject(project.id);
    } catch (err) {
      toast.error(errorText(err));
      setBusy(false);
      return;
    }
    onChanged();
    toast(`“${project.name}” is in the trash.`, {
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => {
          api.restoreProject(project.id).then(onChanged, (err: unknown) => {
            toast.error(errorText(err));
          });
        },
      },
    });
  };

  return (
    <li>
      <Card variant="outlined" className="studio-card">
        <CardMedia ratio="4 / 3" className="studio-card__media">
          <a
            className="studio-card__thumb"
            href={editorPath(project.id)}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigate(editorPath(project.id));
            }}
            // With a thumbnail the link has no text of its own; without one its visible
            // text is the name (WCAG 2.5.3: a label must contain the visible text).
            aria-label={project.thumbnailUrl ? `Open ${project.name}` : undefined}
          >
            {project.thumbnailUrl ? (
              <img src={project.thumbnailUrl} alt="" loading="lazy" />
            ) : (
              <span className="studio-card__placeholder">
                <span className="ui-visually-hidden">Open {project.name}:</span> No preview yet
              </span>
            )}
          </a>
        </CardMedia>
        <CardBody className="studio-card__body">
          {renaming ? (
            <form onSubmit={(e) => void rename(e)} className="studio-rename">
              <TextField
                label="New name"
                className="studio-rename__field"
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
              <Button type="submit" size="sm" disabled={busy}>
                Save
              </Button>
            </form>
          ) : (
            <CardTitle className="studio-card__title">{project.name}</CardTitle>
          )}
          <p className="studio-muted">Updated {dateFormat.format(new Date(project.updatedAt))}</p>
          <div className="studio-card__actions">
            {renaming ? null : (
              <Button
                variant="outline"
                size="sm"
                aria-label={`Rename ${project.name}`}
                onClick={() => setRenaming(true)}
              >
                Rename
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={`Move to trash: ${project.name}`}
              onClick={() => void moveToTrash()}
            >
              Move to trash
            </Button>
          </div>
        </CardBody>
      </Card>
    </li>
  );
}
