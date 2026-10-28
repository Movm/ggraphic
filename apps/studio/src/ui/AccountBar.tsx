// SPDX-License-Identifier: AGPL-3.0-only
/** The organisation switcher, the organisation's pages and logout, in every page header. */
import { useQueryClient } from '@tanstack/react-query';
import { useId, type MouseEvent } from 'react';

import { api } from '../api/client';
import { BRAND_PATH, MEMBERS_PATH, navigate, PROJECTS_PATH } from '../router';
import { SESSION_QUERY_KEY, useLoggedIn } from '../session/SessionContext';
import { toast } from './toast';

function NavLink({ href, children }: { href: string; children: string }) {
  const current = typeof window !== 'undefined' && window.location.pathname === href;
  return (
    <a
      className="studio-link"
      href={href}
      aria-current={current ? 'page' : undefined}
      onClick={(e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

export function AccountBar() {
  const { session, organisation, selectOrganisation } = useLoggedIn();
  const queryClient = useQueryClient();
  const selectId = useId();

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
    <nav className="studio-account" aria-label="Organisation and account">
      {session.organisations.length > 1 ? (
        <span className="studio-account__org">
          <label htmlFor={selectId} className="studio-visually-hidden">
            Organisation
          </label>
          <select
            id={selectId}
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
        <span className="studio-account__org">{organisation.name}</span>
      )}
      <NavLink href={PROJECTS_PATH}>Projects</NavLink>
      <NavLink href={MEMBERS_PATH}>Members</NavLink>
      {organisation.role === 'owner' ? <NavLink href={BRAND_PATH}>Brand</NavLink> : null}
      <button
        type="button"
        className="studio-link-button"
        onClick={() => void logout()}
        title={session.account.email}
      >
        Log out
      </button>
    </nav>
  );
}
