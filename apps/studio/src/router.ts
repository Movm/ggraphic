// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Routes on the History API: `/` (the start page: the prompt and the projects), `/projects`
 * (kept for old links; redirects to `/`), `/trash`, `/p/:id` (the editor) and `/brand` (the
 * current organisation's brand). The server answers every other path with index.html.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'start' }
  | { name: 'projects' }
  | { name: 'trash' }
  | { name: 'brand' }
  | { name: 'editor'; projectId: string };

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

export function parseRoute(pathname: string): Route {
  const editor = /^\/p\/([^/]+)\/?$/.exec(pathname);
  if (editor) return { name: 'editor', projectId: decode(editor[1]) };
  if (/^\/projects\/?$/.test(pathname)) return { name: 'projects' };
  if (/^\/trash\/?$/.test(pathname)) return { name: 'trash' };
  if (/^\/brand\/?$/.test(pathname)) return { name: 'brand' };
  return { name: 'start' };
}

export const TRASH_PATH = '/trash';
export const BRAND_PATH = '/brand';

export const editorPath = (projectId: string) => `/p/${encodeURIComponent(projectId)}`;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Like `navigate`, but the current entry is replaced, so Back does not return to the old path. */
export function redirect(path: string): void {
  if (path === window.location.pathname) return;
  window.history.replaceState(null, '', path);
  notify();
}

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
