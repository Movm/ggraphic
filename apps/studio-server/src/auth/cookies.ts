// SPDX-License-Identifier: AGPL-3.0-only

/** Parses a Cookie header. Values that do not decode are kept as sent. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const raw = part.slice(eq + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // keep raw
    }
    out[name] = value;
  }
  return out;
}

export interface SessionCookie {
  name: string;
  serialize(token: string, maxAgeSeconds: number): string;
  clear(): string;
}

/**
 * The session cookie. With `secure` it carries the `__Host-` prefix, which makes the
 * browser refuse it unless it is Secure, host-only and Path=/ — a sibling subdomain
 * cannot plant or overwrite it.
 */
export function sessionCookie(secure: boolean): SessionCookie {
  const name = secure ? '__Host-studio_session' : 'studio_session';
  const withAge = (value: string, maxAge: number) =>
    `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return {
    name,
    serialize: (token, maxAgeSeconds) => withAge(token, maxAgeSeconds),
    clear: () => withAge('', 0),
  };
}
