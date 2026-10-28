// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Before a session: first-run setup on an empty instance, otherwise login, and
 * registration when the instance allows it.
 */
import {
  Alert,
  AuthForm,
  AuthLayout,
  Button,
  PasswordField,
  TextField,
  Wordmark,
} from '@ggraphic/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';

import { api, ApiError, type Session } from '../api/client';
import { SESSION_QUERY_KEY } from '../session/SessionContext';

export type AuthMode = 'setup' | 'login' | 'register';

const TITLES: Record<AuthMode, string> = {
  setup: 'Set up ggraphic Studio',
  login: 'Log in',
  register: 'Create an account',
};

const SUBMIT: Record<AuthMode, string> = {
  setup: 'Create the admin account',
  login: 'Log in',
  register: 'Create account',
};

export const PASSWORD_MIN = 10;

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Try again.';

export interface Credentials {
  email: string;
  displayName: string;
  password: string;
  /** Only in setup mode. */
  setupToken: string;
}

/** The email/name/password form. `onSubmit` throws to show an error. */
export function CredentialsForm({
  mode,
  submitLabel,
  onSubmit,
}: {
  mode: AuthMode;
  submitLabel?: string;
  onSubmit: (credentials: Credentials) => Promise<unknown>;
}) {
  const [setupToken, setSetupToken] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signup = mode !== 'login';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ email, displayName, password, setupToken });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="studio-auth__form" onSubmit={(e) => void submit(e)} aria-busy={busy}>
      {mode === 'setup' ? (
        <TextField
          label="Setup token"
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          value={setupToken}
          hint="Printed in the server log at the first start (docker compose logs studio), or the SETUP_TOKEN you set."
          onChange={(e) => setSetupToken(e.target.value.trim())}
        />
      ) : null}
      <TextField
        label="Email"
        type="email"
        autoComplete={signup ? 'email' : 'username'}
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {signup ? (
        <TextField
          label="Name"
          autoComplete="name"
          required
          maxLength={100}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      ) : null}
      <PasswordField
        label="Password"
        showLabel="Show password"
        hideLabel="Hide password"
        autoComplete={signup ? 'new-password' : 'current-password'}
        required
        minLength={signup ? PASSWORD_MIN : 1}
        maxLength={256}
        value={password}
        hint={signup ? `At least ${PASSWORD_MIN} characters.` : undefined}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" size="lg" fullWidth disabled={busy}>
        {busy ? 'Please wait…' : (submitLabel ?? SUBMIT[mode])}
      </Button>
    </form>
  );
}

/** The split login layout: the brand panel on the left, the form column on the right. */
export function StudioAuthLayout({ children }: { children: ReactNode }) {
  return (
    <AuthLayout
      className="ui-root"
      brand={<Wordmark href="/">ggraphic Studio</Wordmark>}
      mediaMinHeight="22vh"
    >
      <AuthForm>{children}</AuthForm>
    </AuthLayout>
  );
}

export function AuthPage({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>(session.setupRequired ? 'setup' : 'login');
  const done = (next: Session) => queryClient.setQueryData(SESSION_QUERY_KEY, next);

  const submit = async (c: Credentials) => {
    if (mode === 'setup') done(await api.setup(c));
    // The token field is only filled in setup mode; register sends no token.
    else if (mode === 'register') {
      done(
        await api.register({ email: c.email, displayName: c.displayName, password: c.password })
      );
    } else done(await api.login({ email: c.email, password: c.password }));
  };

  return (
    <StudioAuthLayout>
      <h1 className="studio-auth__title">{TITLES[mode]}</h1>
      {mode === 'setup' ? (
        <p className="studio-muted">
          This instance has no accounts yet. The account you create now becomes the instance admin
          and owns every existing project.
        </p>
      ) : null}
      <CredentialsForm key={mode} mode={mode} onSubmit={submit} />
      {mode !== 'setup' && session.registrationOpen ? (
        <p className="studio-auth__switch">
          {mode === 'login' ? 'No account yet? ' : 'Already have an account? '}
          <button
            type="button"
            className="ui-link studio-link-button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Create one' : 'Log in'}
          </button>
        </p>
      ) : null}
    </StudioAuthLayout>
  );
}
