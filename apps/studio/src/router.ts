// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Routes on the History API: `/` (the start page with the prompt), `/projects`
 * (all projects), `/p/:id` (the editor), `/members` and `/brand` (the current
 * organisation) and `/invite/:token`. The server answers every other path with index.html.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'start' }
  | { name: 'projects' }
  | { name: 'members' }
  | { name: 'brand' }
  | { name: 'editor'; projectId: string }
  | { name: 'invite'; token: string };

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
  const invite = /^\/invite\/([^/]+)\/?$/.exec(pathname);
  if (invite) return { name: 'invite', token: decode(invite[1]) };
  if (/^\/projects\/?$/.test(pathname)) return { name: 'projects' };
  if (/^\/members\/?$/.test(pathname)) return { name: 'members' };
  if (/^\/brand\/?$/.test(pathname)) return { name: 'brand' };
  return { name: 'start' };
}

export const PROJECTS_PATH = '/projects';
export const MEMBERS_PATH = '/members';
export const BRAND_PATH = '/brand';

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
