// SPDX-License-Identifier: AGPL-3.0-only
/** The organisation switcher, the organisation's pages and logout, in every page header. */
import { Avatar, Button, TopNav, Wordmark } from '@ggraphic/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, type MouseEvent } from 'react';

import { api } from '../api/client';
import { BRAND_PATH, MEMBERS_PATH, navigate, PROJECTS_PATH } from '../router';
import { SESSION_QUERY_KEY, useLoggedIn } from '../session/SessionContext';
import { toast } from './toast';

/** Plain clicks on the bar's links route in-app; modified clicks keep the browser's behaviour. */
function followInApp(e: MouseEvent<HTMLElement>) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const link = (e.target as HTMLElement).closest('a[href]');
  if (!link) return;
  e.preventDefault();
  navigate(link.getAttribute('href')!);
}

export function AccountBar() {
  const { session, organisation, selectOrganisation } = useLoggedIn();
  const queryClient = useQueryClient();
  const selectId = useId();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const link = (label: string, href: string) => ({ label, href, current: pathname === href });

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      toast.error('Logging out failed. Try again.');
      return;
    }
    queryClient.clear();
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    navigate('/');
  };

  return (
    <TopNav
      className="studio-topnav"
      label="Organisation and account"
      brand={
        <Wordmark href="/" size="sm">
          ggraphic Studio
        </Wordmark>
      }
      links={[
        link('Projects', PROJECTS_PATH),
        link('Members', MEMBERS_PATH),
        ...(organisation.role === 'owner' ? [link('Brand', BRAND_PATH)] : []),
      ]}
      onClick={followInApp}
      actions={
        <>
          {session.organisations.length > 1 ? (
            <span className="studio-topnav__org">
              <label htmlFor={selectId} className="ui-visually-hidden">
                Organisation
              </label>
              <select
                id={selectId}
                className="ui-field__input studio-select"
                value={organisation.id}
                onChange={(e) => {
                  selectOrganisation(e.target.value);
                  navigate(PROJECTS_PATH);
                }}
              >
                {session.organisations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </span>
          ) : (
            <span className="studio-topnav__org">{organisation.name}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void logout()}
            title={session.account.email}
          >
            Log out
          </Button>
          <Avatar name={session.account.displayName || session.account.email} label="Account" />
        </>
      }
    />
  );
}
