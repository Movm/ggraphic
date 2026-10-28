// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Three routes, on the History API: `/` (the start page with the prompt),
 * `/projects` (all projects) and `/p/:id` (the editor). The server answers every other path with index.html.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  { name: 'start' } | { name: 'projects' } | { name: 'editor'; projectId: string };

export function parseRoute(pathname: string): Route {
  const match = /^\/p\/([^/]+)\/?$/.exec(pathname);
  if (match) return { name: 'editor', projectId: decodeURIComponent(match[1]) };
  return /^\/projects\/?$/.test(pathname) ? { name: 'projects' } : { name: 'start' };
}

export const PROJECTS_PATH = '/projects';

export const editorPath = (projectId: string) => `/p/${encodeURIComponent(projectId)}`;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function navigate(path: string): void {
  if (path === window.location.pathname) return;
  window.history.pushState(null, '', path);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}
