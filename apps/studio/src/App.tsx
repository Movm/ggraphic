// SPDX-License-Identifier: AGPL-3.0-only
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';

import { api } from './api/client';
import { ProjectListPage } from './pages/ProjectListPage';
import { StartPage } from './start/StartPage';
import { parseRoute, usePathname } from './router';
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

export function App() {
  const route = parseRoute(usePathname());
  const config = useQuery({ queryKey: ['config'], queryFn: api.getConfig, staleTime: Infinity });

  let content: ReactNode;
  if (route.name === 'start') {
    content = <StartPage config={config.data} />;
  } else if (route.name === 'projects') {
    content = <ProjectListPage />;
  } else if (config.data) {
    content = (
      <Suspense fallback={loading('Opening the editor…')}>
        <EditorPage projectId={route.projectId} config={config.data} />
      </Suspense>
    );
  } else if (config.isError) {
    content = (
      <main className="studio-page">
        <div role="alert" className="studio-error">
          <p>The Studio server is not reachable.</p>
          <button type="button" className="studio-button" onClick={() => void config.refetch()}>
            Try again
          </button>
        </div>
      </main>
    );
  } else {
    content = loading('Connecting…');
  }

  return (
    <>
      {content}
      <Toaster />
    </>
  );
}
