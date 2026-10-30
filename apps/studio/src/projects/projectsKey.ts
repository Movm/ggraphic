// SPDX-License-Identifier: AGPL-3.0-only
export const PROJECTS_QUERY_KEY = ['projects'] as const;
export const projectsKey = (orgId: string) => [...PROJECTS_QUERY_KEY, orgId] as const;
