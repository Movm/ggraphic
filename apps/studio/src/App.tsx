// SPDX-License-Identifier: AGPL-3.0-only
import { Alert, Button } from '@ggraphic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';

import { api, onUnauthenticated, type StudioConfig } from './api/client';
import { AuthPage } from './pages/AuthPage';
import { BrandPage } from './pages/BrandPage';
import { TrashPage } from './pages/TrashPage';
import { StartPage } from './start/StartPage';
import { parseRoute, redirect, usePathname, type Route } from './router';
import { SESSION_QUERY_KEY, SessionProvider, type LoggedIn } from './session/SessionContext';
import { Toaster } from './ui/toast';

// The editor is most of the bundle; the project list does not wait for it.
const EditorPage = lazy(() =>
  import('./pages/EditorPage').then((m) => ({ default: m.EditorPage }))
);

const loading = (label: string) => (
  <div className="studio-editor-loading" role="status">
    {label}
  </div>
);

function unreachable(retry: () => void) {
  return (
    <main className="ui-root studio-standalone">
      <Alert tone="danger">
        <p className="studio-alert-text">The Studio server is not reachable.</p>
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </Alert>
    </main>
  );
}

/** `/projects` was the project list; the projects now live on the start page. */
function RedirectToStart() {
  useEffect(() => redirect('/'), []);
  return null;
}

function LoggedInRoutes({ route, config }: { route: Route; config: StudioConfig | undefined }) {
  if (route.name === 'start') return <StartPage config={config} />;
  if (route.name === 'projects') return <RedirectToStart />;
  if (route.name === 'trash') return <TrashPage />;
  if (route.name === 'brand') return <BrandPage />;
  if (route.name !== 'editor') return null;
  if (!config) return loading('Connecting…');
  return (
    <Suspense fallback={loading('Opening the editor…')}>
      <EditorPage projectId={route.projectId} config={config} />
    </Suspense>
  );
}

export function App() {
  const route = parseRoute(usePathname());
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['config'], queryFn: api.getConfig, staleTime: Infinity });
  const session = useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: api.getSession });

  // A 401 anywhere means the session ended: reload it, which shows the login.
  useEffect(
    () =>
      onUnauthenticated(() => void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })),
    [queryClient]
  );

  let content: ReactNode;
  if (session.isPending) {
    content = loading('Connecting…');
  } else if (session.isError) {
    content = unreachable(() => void session.refetch());
  } else if (!session.data.account) {
    content = <AuthPage session={session.data} />;
  } else {
    content = (
      <SessionProvider session={session.data as LoggedIn['session']}>
        {config.isError && route.name === 'editor' ? (
          unreachable(() => void config.refetch())
        ) : (
          <LoggedInRoutes route={route} config={config.data} />
        )}
      </SessionProvider>
    );
  }

  return (
    <>
      {content}
      <Toaster />
    </>
  );
}
