// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The logged-in account and the organisation it works in. There is one person
 * per instance, so the Studio never asks which organisation: an account that
 * belongs to several (an older instance) works in an organisation it owns first, else in
 * its first membership (the server lists them oldest first).
 */
import { Alert } from '@ggraphic/ui';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { type Organisation, type Session } from '../api/client';

export const SESSION_QUERY_KEY = ['session'] as const;

export interface LoggedIn {
  session: Session & { account: NonNullable<Session['account']> };
  organisation: Organisation;
  /** Reloads the session. */
  refresh: () => Promise<void>;
}

const Context = createContext<LoggedIn | null>(null);

export function SessionProvider({
  session,
  children,
}: {
  session: LoggedIn['session'];
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const organisation =
    session.organisations.find((o) => o.role === 'owner') ?? session.organisations[0];

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
    [queryClient]
  );

  const value = useMemo(
    () => (organisation ? { session, organisation, refresh } : null),
    [session, organisation, refresh]
  );
  if (!value) return <NoOrganisation />;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function NoOrganisation() {
  return (
    <main className="ui-root studio-standalone">
      <Alert tone="danger">
        Your account does not belong to an organisation yet. Reload the page; if this stays, the
        instance needs an update.
      </Alert>
    </main>
  );
}

export function useLoggedIn(): LoggedIn {
  const value = useContext(Context);
  if (!value) throw new Error('useLoggedIn outside SessionProvider');
  return value;
}

/** For tests and pages that render either way. */
export const LoggedInContext = Context;
