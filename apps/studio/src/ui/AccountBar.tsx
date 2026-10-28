// SPDX-License-Identifier: AGPL-3.0-only
/** The organisation switcher, the organisation's pages and logout, in every page header. */
import { Avatar, Button, TopNav, Wordmark } from '@ggraphic/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type MouseEvent } from 'react';

import { api } from '../api/client';
import { BRAND_PATH, navigate, PROJECTS_PATH } from '../router';
import { useLoggedIn } from '../session/SessionContext';
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
  const { session, organisation } = useLoggedIn();
  const queryClient = useQueryClient();
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const link = (label: string, href: string) => ({ label, href, current: pathname === href });

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      toast.error('Logging out failed. Try again.');
      return;
    }
    // reset, not clear: clear() drops the session query from the cache, so a
    // following refetch finds nothing to reload and the page keeps the old session.
    await queryClient.resetQueries();
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
        ...(organisation.role === 'owner' ? [link('Brand', BRAND_PATH)] : []),
      ]}
      onClick={followInApp}
      actions={
        <>
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
