// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The logged-in account and the organisation it works in. The organisation choice
 * is remembered per browser (a convenience: the server checks membership anyway).
 */
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { type Organisation, type Session } from '../api/client';

export const SESSION_QUERY_KEY = ['session'] as const;
const STORAGE_KEY = 'studio.organisation';

export interface LoggedIn {
  session: Session & { account: NonNullable<Session['account']> };
  organisation: Organisation;
  selectOrganisation: (id: string) => void;
  /** Reloads the session, e.g. after joining or creating an organisation. */
  refresh: () => Promise<void>;
}

const Context = createContext<LoggedIn | null>(null);

function stored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page only.
  }
}

export function SessionProvider({
  session,
  children,
}: {
  session: LoggedIn['session'];
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(stored);
  const organisation =
    session.organisations.find((o) => o.id === chosen) ?? session.organisations[0];

  const selectOrganisation = useCallback((id: string) => {
    remember(id);
    setChosen(id);
  }, []);
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
    [queryClient]
  );

  const value = useMemo(
    () => (organisation ? { session, organisation, selectOrganisation, refresh } : null),
    [session, organisation, selectOrganisation, refresh]
  );
  if (!value) return <NoOrganisation />;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function NoOrganisation() {
  return (
    <main className="studio-page">
      <div role="alert" className="studio-error">
        <p>
          Your account is not a member of any organisation. Ask an owner for an invitation link.
        </p>
      </div>
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
