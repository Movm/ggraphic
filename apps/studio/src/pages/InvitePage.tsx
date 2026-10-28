// SPDX-License-Identifier: AGPL-3.0-only
/** `/invite/:token`: join an organisation, with a new account or the current one. */
import { Alert, Button } from '@ggraphic/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { api, ApiError, type Session } from '../api/client';
import { navigate } from '../router';
import { SESSION_QUERY_KEY } from '../session/SessionContext';
import { toast } from '../ui/toast';
import { type AuthMode, CredentialsForm, StudioAuthLayout } from './AuthPage';

const ROLE_TEXT = { owner: 'an owner', editor: 'an editor' } as const;

export function InvitePage({ token, session }: { token: string; session: Session }) {
  const queryClient = useQueryClient();
  const info = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.getInvitation(token),
    retry: false,
  });
  const [mode, setMode] = useState<AuthMode>('register');
  const [busy, setBusy] = useState(false);

  const joined = (next: Session) => {
    queryClient.setQueryData(SESSION_QUERY_KEY, next);
    navigate('/projects');
  };

  if (info.isPending) {
    return (
      <div className="studio-editor-loading" role="status">
        Checking the invitation…
      </div>
    );
  }
  if (info.isError) {
    return (
      <StudioAuthLayout>
        <h1 className="studio-auth__title">Invitation not valid</h1>
        <Alert tone="danger">
          {info.error instanceof ApiError
            ? info.error.message
            : 'The invitation could not be checked.'}
        </Alert>
        <Button variant="outline" onClick={() => navigate('/')}>
          Go to the start page
        </Button>
      </StudioAuthLayout>
    );
  }

  const { organisationName, role, allowsSignup } = info.data;
  const heading = (
    <>
      <h1 className="studio-auth__title">Join {organisationName}</h1>
      <p className="studio-lead">You are invited as {ROLE_TEXT[role]}.</p>
    </>
  );

  if (session.account) {
    const accept = async () => {
      setBusy(true);
      try {
        joined(await api.acceptInvitation(token, null));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Joining failed.');
        setBusy(false);
      }
    };
    return (
      <StudioAuthLayout>
        {heading}
        <p className="studio-muted">Logged in as {session.account.email}.</p>
        <Button size="lg" fullWidth disabled={busy} onClick={() => void accept()}>
          Join {organisationName}
        </Button>
      </StudioAuthLayout>
    );
  }

  const effective: AuthMode = allowsSignup ? mode : 'login';
  return (
    <StudioAuthLayout>
      {heading}
      {effective === 'login' ? (
        <p className="studio-muted">Log in with your account to join.</p>
      ) : null}
      <CredentialsForm
        key={effective}
        mode={effective}
        submitLabel={effective === 'login' ? 'Log in and join' : 'Create account and join'}
        onSubmit={async (c) => {
          if (effective === 'login') {
            await api.login({ email: c.email, password: c.password });
            joined(await api.acceptInvitation(token, null));
          } else {
            joined(
              await api.acceptInvitation(token, {
                email: c.email,
                displayName: c.displayName,
                password: c.password,
              })
            );
          }
        }}
      />
      {allowsSignup ? (
        <p className="studio-auth__switch">
          {effective === 'login' ? 'No account yet? ' : 'Already have an account? '}
          <button
            type="button"
            className="ui-link studio-link-button"
            onClick={() => setMode(effective === 'login' ? 'register' : 'login')}
          >
            {effective === 'login' ? 'Create one' : 'Log in instead'}
          </button>
        </p>
      ) : null}
    </StudioAuthLayout>
  );
}
