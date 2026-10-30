// SPDX-License-Identifier: AGPL-3.0-only
/** The top bar of every page: the wordmark (to the start page) and the profile menu. */
import { Button, Menu, TopNav, Wordmark, type MenuItem } from '@ggraphic/ui';
import { useQueryClient } from '@tanstack/react-query';
import { type MouseEvent } from 'react';

import { api } from '../api/client';
import { BRAND_PATH, LICENSES_PATH, navigate } from '../router';
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
  const name = session.account.displayName || session.account.email;

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

  const items: MenuItem[] = [
    ...(organisation.role === 'owner'
      ? [{ label: 'Brand', onSelect: () => navigate(BRAND_PATH) }]
      : []),
    { label: 'Licences', onSelect: () => navigate(LICENSES_PATH) },
    { label: 'Log out', onSelect: () => void logout() },
  ];

  return (
    <TopNav
      className="studio-topnav"
      label="Account"
      brand={
        <Wordmark href="/" size="sm">
          ggraphic Studio
        </Wordmark>
      }
      onClick={followInApp}
      actions={
        <Menu
          trigger={
            <Button
              variant="outline"
              size="sm"
              aria-label={`Account: ${name}`}
              title={session.account.email}
            >
              {name}
            </Button>
          }
          items={items}
        />
      }
    />
  );
}
