// SPDX-License-Identifier: AGPL-3.0-only
/** The current organisation's members and invitation links; owners manage, editors read. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';

import { api, ApiError, type Invitation, type Role } from '../api/client';
import { navigate } from '../router';
import { useLoggedIn } from '../session/SessionContext';
import { AccountBar } from '../ui/AccountBar';
import { toast } from '../ui/toast';

const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Editor' };

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong.';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

export function MembersPage() {
  const { session, organisation, refresh } = useLoggedIn();
  const queryClient = useQueryClient();
  const isOwner = organisation.role === 'owner';
  const membersKey = ['members', organisation.id];
  const invitationsKey = ['invitations', organisation.id];
  const members = useQuery({
    queryKey: membersKey,
    queryFn: () => api.listMembers(organisation.id),
  });
  const invitations = useQuery({
    queryKey: invitationsKey,
    queryFn: () => api.listInvitations(organisation.id),
    enabled: isOwner,
  });
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const roleId = useId();

  const reloadMembers = () => queryClient.invalidateQueries({ queryKey: membersKey });
  const reloadInvitations = () => queryClient.invalidateQueries({ queryKey: invitationsKey });

  const changeRole = useMutation({
    mutationFn: ({ accountId, role }: { accountId: string; role: Role }) =>
      api.updateMember(organisation.id, accountId, role),
    onSuccess: async (_v, { accountId }) => {
      await reloadMembers();
      if (accountId === session.account.id) await refresh();
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const remove = useMutation({
    mutationFn: (accountId: string) => api.removeMember(organisation.id, accountId),
    onSuccess: async (_v, accountId) => {
      if (accountId === session.account.id) {
        await refresh();
        navigate('/projects');
        return;
      }
      await reloadMembers();
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const invite = useMutation({
    mutationFn: () => api.createInvitation(organisation.id, inviteRole),
    onSuccess: async (created: Invitation) => {
      setLastLink(created.url ? `${window.location.origin}${created.url}` : null);
      await reloadInvitations();
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeInvitation(organisation.id, id),
    onSuccess: () => reloadInvitations(),
    onError: (err) => toast.error(errorText(err)),
  });

  const copy = async () => {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      toast('Link copied.');
    } catch {
      toast.error('Copying failed. Select the link and copy it yourself.');
    }
  };

  return (
    <main className="studio-page">
      <header className="studio-header">
        <h1 className="studio-logo">Members of {organisation.name}</h1>
        <AccountBar />
      </header>

      <section className="studio-section" aria-labelledby="members-heading">
        <h2 id="members-heading" className="studio-section__title">
          Members
        </h2>
        {members.isPending ? <p className="studio-muted">Loading members…</p> : null}
        {members.isError ? (
          <p role="alert" className="studio-error">
            {errorText(members.error)}
          </p>
        ) : null}
        {members.data ? (
          <ul className="studio-members">
            {members.data.map((m) => {
              const self = m.accountId === session.account.id;
              return (
                <li key={m.accountId} className="studio-member">
                  <span className="studio-member__who">
                    <strong>
                      {m.displayName}
                      {self ? ' (you)' : ''}
                    </strong>
                    <span className="studio-muted">{m.email}</span>
                  </span>
                  {isOwner ? (
                    <label className="studio-member__role">
                      <span className="studio-visually-hidden">Role of {m.displayName}</span>
                      <select
                        value={m.role}
                        disabled={changeRole.isPending}
                        onChange={(e) =>
                          changeRole.mutate({
                            accountId: m.accountId,
                            role: e.target.value as Role,
                          })
                        }
                      >
                        <option value="editor">{ROLE_LABEL.editor}</option>
                        <option value="owner">{ROLE_LABEL.owner}</option>
                      </select>
                    </label>
                  ) : (
                    <span className="studio-member__role">{ROLE_LABEL[m.role]}</span>
                  )}
                  {isOwner || self ? (
                    <button
                      type="button"
                      className="studio-button studio-button--danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        const question = self
                          ? `Leave ${organisation.name}?`
                          : `Remove ${m.displayName} from ${organisation.name}?`;
                        if (window.confirm(question)) remove.mutate(m.accountId);
                      }}
                    >
                      {self ? 'Leave' : 'Remove'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {isOwner ? (
        <section className="studio-section" aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="studio-section__title">
            Invite someone
          </h2>
          <p className="studio-muted">
            Studio sends no email. Create a link and pass it on yourself; it works once and for
            seven days.
            {session.account.isInstanceAdmin || session.registrationOpen
              ? ''
              : ' The person needs an account on this instance already.'}
          </p>
          <form
            className="studio-invite"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!invite.isPending) invite.mutate();
            }}
          >
            <label htmlFor={roleId}>Role</label>
            <select
              id={roleId}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
            >
              <option value="editor">{ROLE_LABEL.editor}: edits projects</option>
              <option value="owner">{ROLE_LABEL.owner}: also members and brand</option>
            </select>
            <button
              type="submit"
              className="studio-button studio-button--primary"
              disabled={invite.isPending}
            >
              Create invitation link
            </button>
          </form>
          {lastLink ? (
            <div className="studio-invite__link" role="status">
              <label>
                <span>Invitation link (shown once)</span>
                <input readOnly value={lastLink} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <p className="studio-invite__warning">
                Anyone who has this link can join {organisation.name} until it is used or expires.
                Send it only to the person you mean, through a private channel; revoke it below if
                it went to the wrong place.
              </p>
              <button type="button" className="studio-button" onClick={() => void copy()}>
                Copy
              </button>
            </div>
          ) : null}
          {invitations.data && invitations.data.length > 0 ? (
            <>
              <h3 className="studio-subtitle">Open invitations</h3>
              <ul className="studio-members">
                {invitations.data.map((inv) => (
                  <li key={inv.id} className="studio-member">
                    <span className="studio-member__who">
                      <strong>{ROLE_LABEL[inv.role]}</strong>
                      <span className="studio-muted">
                        valid until {dateFormat.format(new Date(inv.expiresAt))}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="studio-button"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(inv.id)}
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {session.canCreateOrganisations ? <NewOrganisation /> : null}
    </main>
  );
}

function NewOrganisation() {
  const { refresh, selectOrganisation } = useLoggedIn();
  const [name, setName] = useState('');
  const nameId = useId();
  const create = useMutation({
    mutationFn: () => api.createOrganisation(name.trim()),
    onSuccess: async (org) => {
      setName('');
      await refresh();
      selectOrganisation(org.id);
      toast(`${org.name} created.`);
    },
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <section className="studio-section" aria-labelledby="new-org-heading">
      <h2 id="new-org-heading" className="studio-section__title">
        New organisation
      </h2>
      <form
        className="studio-invite"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (name.trim() && !create.isPending) create.mutate();
        }}
      >
        <label htmlFor={nameId}>Name</label>
        <input id={nameId} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="studio-button" disabled={!name.trim() || create.isPending}>
          Create organisation
        </button>
      </form>
    </section>
  );
}
