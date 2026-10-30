// SPDX-License-Identifier: AGPL-3.0-only
/** `/trash`: deleted projects, restorable until the server purges them after 30 days. */
import { Alert, Button, Card } from '@ggraphic/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError, type TrashItem } from '../api/client';
import { PROJECTS_QUERY_KEY } from '../projects/projectsKey';
import { navigate } from '../router';
import { useLoggedIn } from '../session/SessionContext';
import { PageShell, PageTitle } from '../ui/PageShell';
import { apiErrorText } from '../ui/errorText';
import { toast } from '../ui/toast';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

const daysLeftText = (days: number) =>
  days <= 0 ? 'Due for deletion' : `${days} ${days === 1 ? 'day' : 'days'} left`;

export function TrashPage() {
  const queryClient = useQueryClient();
  const { organisation } = useLoggedIn();
  const key = ['trash', organisation.id] as const;
  const trash = useQuery({ queryKey: key, queryFn: () => api.listTrash(organisation.id) });

  const restore = useMutation({
    mutationFn: (item: TrashItem) => api.restoreProject(item.id),
    onSuccess: (_project, item) => {
      toast(`“${item.name}” is back in your projects.`);
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
    },
    onError: (err) => toast.error(apiErrorText(err)),
  });
  const purge = useMutation({
    mutationFn: (item: TrashItem) => api.purgeProject(item.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (err) => toast.error(apiErrorText(err)),
  });
  const busy = restore.isPending || purge.isPending;

  const deleteNow = (item: TrashItem) => {
    if (window.confirm(`Delete "${item.name}" now? It is gone for good and cannot be undone.`)) {
      purge.mutate(item);
    }
  };

  return (
    <PageShell>
      <header className="studio-header">
        <PageTitle>Trash</PageTitle>
        <Button asChild variant="outline" size="sm">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            Back to projects
          </a>
        </Button>
      </header>
      <p className="studio-muted">Deleted projects stay here for 30 days, then they are removed.</p>
      {trash.isPending ? <p className="studio-muted">Loading the trash…</p> : null}
      {trash.isError ? (
        <Alert tone="danger">
          <p className="studio-alert-text">{apiErrorText(trash.error)}</p>
          <Button variant="outline" size="sm" onClick={() => void trash.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : null}
      {trash.data?.length === 0 ? <p className="studio-muted">The trash is empty.</p> : null}
      {trash.data && trash.data.length > 0 ? (
        <ul className="studio-assets" aria-label="Trash">
          {trash.data.map((item) => (
            <li key={item.id}>
              <Card variant="outlined" className="studio-asset">
                <span className="studio-asset__who">
                  <strong>{item.name}</strong>
                  <span className="studio-muted">
                    Deleted {dateFormat.format(new Date(item.deletedAt))}
                  </span>
                </span>
                <span className="studio-muted">{daysLeftText(item.daysLeft)}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={`Restore ${item.name}`}
                  onClick={() => restore.mutate(item)}
                >
                  Restore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="studio-danger"
                  disabled={busy}
                  aria-label={`Delete now: ${item.name}`}
                  onClick={() => deleteNow(item)}
                >
                  Delete now
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </PageShell>
  );
}
