// SPDX-License-Identifier: AGPL-3.0-only
/** Test seam: a logged-in owner of one organisation, without a server round trip. */
import { type ReactNode } from 'react';

import { type Role } from '../api/client';
import { LoggedInContext, type LoggedIn } from '../session/SessionContext';

export const TEST_ORG = 'org-1';
export const TEST_PROJECTS_URL = `/api/orgs/${TEST_ORG}/projects`;

export function testSession(role: Role = 'owner'): LoggedIn {
  return {
    session: {
      setupRequired: false,
      registrationOpen: false,
      account: { id: 'acc-1', email: 'me@example.org', displayName: 'Me', isInstanceAdmin: true },
      csrfToken: 'csrf-1',
      organisations: [{ id: TEST_ORG, name: 'Example org', role }],
      canCreateOrganisations: true,
    },
    organisation: { id: TEST_ORG, name: 'Example org', role },
    selectOrganisation: () => {},
    refresh: () => Promise.resolve(),
  };
}

export function WithSession({ children, role }: { children: ReactNode; role?: Role }) {
  return <LoggedInContext.Provider value={testSession(role)}>{children}</LoggedInContext.Provider>;
}
