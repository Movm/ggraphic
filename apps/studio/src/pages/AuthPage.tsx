// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Before a session: first-run setup on an empty instance, otherwise login, and
 * registration when the instance allows it. Also used by the invitation page.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';

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
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const signup = mode !== 'login';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ email, displayName, password });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="studio-auth__form" onSubmit={(e) => void submit(e)} aria-busy={busy}>
      <div className="studio-field">
        <label htmlFor={`${id}-email`}>Email</label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete={signup ? 'email' : 'username'}
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {signup ? (
        <div className="studio-field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            autoComplete="name"
            required
            maxLength={100}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
      ) : null}
      <div className="studio-field">
        <label htmlFor={`${id}-password`}>Password</label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          required
          minLength={signup ? PASSWORD_MIN : 1}
          maxLength={256}
          value={password}
          aria-describedby={signup ? `${id}-hint` : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        {signup ? (
          <small id={`${id}-hint`} className="studio-muted">
            At least {PASSWORD_MIN} characters.
          </small>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="studio-auth__error">
          {error}
        </p>
      ) : null}
      <button type="submit" className="studio-button studio-button--primary" disabled={busy}>
        {busy ? 'Please wait…' : (submitLabel ?? SUBMIT[mode])}
      </button>
    </form>
  );
}

export function AuthPage({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>(session.setupRequired ? 'setup' : 'login');
  const done = (next: Session) => queryClient.setQueryData(SESSION_QUERY_KEY, next);

  const submit = async (c: Credentials) => {
    if (mode === 'setup') done(await api.setup(c));
    else if (mode === 'register') done(await api.register(c));
    else done(await api.login({ email: c.email, password: c.password }));
  };

  return (
    <main className="studio-auth">
      <div className="studio-auth__card">
        <span className="studio-logo">ggraphic Studio</span>
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
              className="studio-link-button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Create one' : 'Log in'}
            </button>
          </p>
        ) : null}
        {mode === 'login' && !session.registrationOpen ? (
          <p className="studio-muted">
            New here? Ask an organisation owner for an invitation link.
          </p>
        ) : null}
      </div>
    </main>
  );
}
