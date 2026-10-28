# Accounts, organisations and brand packs

Design note for Studio (`apps/studio-server`, `apps/studio`). Studio is self-host only:
every instance has its own database, its own keys and its own people. Until this
change anyone who could reach an instance could do everything; this note describes
what replaces that.

## Data model

All tables live in `migrations/0002_accounts.sql`; `src/db/schema.ts` mirrors them.

| Table           | Columns (abridged)                                                                                                                                              | Notes                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `accounts`      | `id uuid`, `email text`, `display_name`, `password_hash`, `is_instance_admin`, `created_at`                                                                     | Unique on `lower(email)`. `password_hash` is an argon2id PHC string.                                                       |
| `sessions`      | `token_hash text PK`, `account_id`, `csrf_token`, `created_at`, `expires_at`, `last_seen_at`                                                                    | The cookie carries a random 256-bit token; the table stores only its SHA-256, so a database dump yields no usable session. |
| `organisations` | `id uuid`, `name`, `created_at`                                                                                                                                 | The default organisation has the fixed id `00000000-0000-4000-8000-000000000001`.                                          |
| `memberships`   | `organisation_id`, `account_id`, `role ('owner'\|'editor')`, `created_at`                                                                                       | PK on both ids. Written when an account gets its organisation; no route changes members.                                   |
| `invitations`   | `id`, `token_hash`, `organisation_id`, `role`, `created_by`, `created_at`, `expires_at`, `accepted_at`, `accepted_by`                                           | Dormant: no route reads or writes it while Studio is single-user.                                                          |
| `projects`      | + `organisation_id uuid NOT NULL`, `deleted_at timestamptz` (`0003_trash.sql`)                                                                                  | Every project belongs to exactly one organisation. `deleted_at` is set while it is in the trash (see Trash).               |
| `uploads`       | `file_name text PK`, `organisation_id`, `content_type`, `size`, `created_at`                                                                                    | Ties a stored upload file to its organisation.                                                                             |
| `brand_packs`   | `organisation_id PK`, `name`, `colors jsonb`, `backgrounds jsonb`, `logo_asset_id`, `fonts jsonb`, `updated_at`                                                 | The owner's settings, not the built pack.                                                                                  |
| `brand_assets`  | `id uuid`, `organisation_id`, `kind ('logo'\|'font')`, `file_name`, `content_type`, `size`, `font_family`, `font_weight`, `font_style`, `licence`, `created_at` | `licence` is `NOT NULL` for fonts (check constraint).                                                                      |

Roles: `editor` may create, edit and delete the organisation's projects and uploads and
read its brand pack. `owner` may additionally change the brand pack. `is_instance_admin`
is an instance-level flag; it grants no access to organisations the admin is not a member
of. Studio is single-user for now: the member and invitation routes, and the route that
created further organisations, are gone. The tables, the role check and the
`/api/orgs/:orgId/...` URLs stay (the shape multi-user needs), so adding it back is routes
and pages, not a migration.

## Accounts and registration

- **First run:** while `accounts` is empty, `POST /api/auth/setup` creates the first account,
  marks it instance admin and makes it owner of the default organisation. It requires the
  setup token: `SETUP_TOKEN`, or a random token the server prints once at start when the
  instance has no account. The route checks for an existing account and the token
  (constant time) before hashing anything; the insert runs under an advisory lock and
  re-checks the table, and the token is cleared in that transaction.
- **Afterwards:** `POST /api/auth/register` works only with `ALLOW_REGISTRATION=true`
  (default `false`) and gives the new account its own organisation. Otherwise there is
  no way to create a second account: set `ALLOW_REGISTRATION=true` for as long as it takes.
  There is no admin screen for accounts.
- **Every account has an organisation.** `ensurePersonalOrganisation` runs at login and on
  `GET /api/auth/session`: an account without a membership gets an organisation named
  after the person, owned by them (serialised per account, so concurrent requests create
  one). The session lists an account's organisations owned-first, then oldest membership,
  and the app works in the first. `canCreateOrganisations` is always `false`; the field is
  kept for older cached web clients and will go.
- **Passwords:** argon2id via [`argon2`](https://github.com/ranisalt/node-argon2) (MIT,
  prebuilt binaries for glibc and musl), parameters m = 19 MiB, t = 2, p = 1 (OWASP
  minimum). 10 to 256 characters. Unknown emails still run one verification against a
  dummy hash so response time does not reveal which emails exist.
- **Password reset** is out of scope. The design leaves room for it: a `password_resets`
  table with a hashed single-use token (like `invitations`), and `DELETE FROM sessions
WHERE account_id = $1` when the password changes — sessions are rows, not signed cookies,
  so they can be revoked.

## Sessions

Server-side sessions in Postgres. The cookie is `__Host-studio_session` (or
`studio_session` when `COOKIE_SECURE=false`), `HttpOnly`, `SameSite=Lax`, `Path=/`,
`Secure` unless `COOKIE_SECURE=false`. Chrome and Firefox accept `Secure` cookies on
`http://localhost`; Safari does not, which is what the switch is for. The server refuses to start with
`COOKIE_SECURE=false` on a non-loopback `HOST` unless `ALLOW_INSECURE_COOKIE=1` is set, and
warns loudly when it is. Sessions last 30 days
and slide forward when used after half their lifetime, but never beyond 90 days after login; logout deletes the row; expired rows
are deleted on login.

## CSRF: a session-bound token plus Fetch Metadata

Chosen over a pure Origin check because Studio runs behind proxies we do not know: the
`Host` the server sees is often rewritten, so comparing `Origin` to it fails in both
directions. Chosen over a cookie-only double submit because a sibling subdomain can plant
cookies; a token stored in the session row cannot be planted.

1. Every session row carries a random `csrf_token`. `GET /api/auth/session` returns it;
   the client keeps it in memory and sends `X-CSRF-Token` on every non-GET request. The
   server compares it in constant time. Missing or wrong → `403 csrf`.
2. Every non-GET request whose `Sec-Fetch-Site` is `cross-site` or `same-site` is refused
   before anything else (all current browsers send the header).
3. The unauthenticated endpoints (setup, login, register) take JSON
   only. A cross-site form cannot send `application/json`, and a cross-site `fetch` with
   it needs a CORS preflight, which Studio never answers.

`SameSite=Lax` is the third layer, not the first.

## Login rate limiting

In-process fixed windows: 10 failed attempts per email and 30 per client IP within 15
minutes, then `429` with `Retry-After`. IPv6 clients are keyed by their /64. Hashing and
verification share a semaphore of four slots with a queue of 64; a full queue answers `503`.
`TRUST_PROXY=true` is refused at start: only a hop count or proxy addresses are accepted. Setup, login and registration share
the IP window. Behind a reverse proxy, set `TRUST_PROXY` (Express `trust proxy`) so the IP
is the client's, not the proxy's. The counters are per process; a multi-process deployment
gets a limit per process (see open risks).

### Accepted trade-offs

- **Per-email lockout.** Ten failed logins lock that email for 15 minutes, also for its
  owner: anyone who knows an address can keep its owner out by failing on purpose. We accept
  this denial of service over unlimited guessing; the IP limit does not stop a distributed
  guesser, the email limit does. An operator can lift a lockout by restarting Studio.
- **`email_taken` tells whether an account exists.** Registration (when open) answers
  `409 email_taken` for a known address, so the person can log in instead. On a closed
  instance the route answers `403` first; the login itself answers alike for wrong
  passwords and unknown emails.

### Other limits

Auth request bodies are capped at 16 kB. AI drafts are limited to 30 per account in 15
minutes (they spend the instance's provider budget). Unexpected errors are logged as name
and message only, database errors as driver code and message: drizzle's query errors carry
the query parameters (token hashes, CSRF tokens, emails, password hashes).

## Authorisation per route

Every `/api` route except `GET /api/config`, `GET /api/auth/session`, setup, login,
and register requires a session. Organisation-scoped routes look
up the membership in the same request; a project or upload of an organisation the account
is not a member of is answered `404`, never `403`, so ids of other organisations cannot be
probed. The route tests (`test/authz.test.ts`) run every route as a member of another
organisation and as an anonymous client.

## Migration of existing data

`0002_accounts.sql` creates the default organisation, adds `projects.organisation_id`,
sets it to the default organisation for every existing row and only then makes it
`NOT NULL`. Existing upload files have no row yet: at start the server scans the upload
directory and registers every well-formed file name without a row to the default
organisation (`adoptLegacyUploads`, idempotent). The first account created by setup becomes
owner of the default organisation, so every project and upload that existed before has an
owner as soon as the instance has one. No project is moved or deleted.

## Brand packs

- **Edit:** owners set the name, three colours (`primary`, `secondary`, `accent`;
  `#RRGGBB` only), the headline/body families, a logo and fonts. `PUT` derives the other
  five roles of `BrandColors` (`accentOnLight`, `attention`, `textOnDark`, `textOnLight`,
  `surface`) and the grounds with `deriveBrandColors` / `deriveGrounds` from
  `@ggraphic/core` (text 4.5:1, accents 3:1, the same thresholds as the colour worlds) and
  stores all eight roles and the grounds in the existing columns, so saved designs that bind
  `brand.<role>` and the swatch refs of the pack keep resolving. The full eight-colour body
  older clients send is still accepted, but only its three inputs count; the rest is
  derived again. Saving a pack that was set by hand therefore replaces its hand-set roles.
- **Logo:** PNG or WebP, detected by content. **SVG is rejected**: sanitising SVG safely
  server-side needs DOMPurify plus a DOM implementation (jsdom) in the server, a large
  attack surface of its own for one file type. The general upload route keeps its
  existing SVG handling (served as an attachment under a sandbox CSP).
- **Fonts:** WOFF2, TTF or OTF, detected by magic bytes, with a required `licence` field
  (free text up to 100 characters, e.g. `OFL-1.1`, `Apache-2.0`, `own licence`), family,
  weight and style. Served as `font/woff2`, `font/ttf`, `font/otf`.
- **Build:** `GET /api/orgs/:orgId/brand-pack` returns `{ settings, pack }`. `pack` is a full
  `BrandPack` built by `buildBrandPack()` from the settings (palette, text palette, markers,
  chart and effect colours are derived from the roles and grounds) and validated with a
  zod schema that is checked against the core's `BrandPack` type at compile time. `pack`
  is `null` while the organisation has not saved a brand.
- **Load:** when the editor opens a project, the client fetches its organisation's pack,
  loads its fonts with the `FontFace` API (equivalent to `@font-face`, but awaitable) and
  calls `registerBrandPacks([orgPack, studioBrand])`. Without a pack it registers
  `[studioBrand]` as before. `studioBrand` stays registered second so documents that name
  it keep rendering.

## Trash

`DELETE /api/projects/:id` is a soft delete: it sets `projects.deleted_at` and the project
disappears from the list, from `GET`, `PATCH` and the thumbnail routes (all `404`). Thumbnails
need no column: they cascade with the row and are only reachable through the project.
`GET /api/orgs/:orgId/trash` lists the deleted projects, newest first, with `purgeAt` and
`daysLeft`; `POST /api/projects/:id/restore` brings one back untouched (version and
`updated_at` unchanged); `DELETE /api/projects/:id/purge` ("delete now") removes one that is
already in the trash. Rights are those of delete: any member. A restore or purge of a project
that is not in the trash, or of another organisation, is `404`.

Every statement that reads `projects` must exclude the trash. `test/trashReaders.test.ts`
reads the source and fails on a statement without `live()` (`src/trash.ts`); the trash side
itself is an allowlist with one marker per statement. `projects` has no unique key besides
its primary key, so no uniqueness has to be limited to live rows.

`src/trashPurge.ts` removes projects trashed more than 30 days ago, 200 at a time, from a
timer in `server.ts` (first run ten minutes after start, then every six hours), guarded by
`pg_try_advisory_lock` so several instances do not both run it. The cutoff is part of the
`DELETE`'s own `WHERE`, not only of the subquery that picks the rows: a project restored in
between has `deleted_at = NULL` when the `DELETE` reaches it, Postgres re-checks the clause
on the new row version and skips it (`test/trashPurge.test.ts` holds a restore open
mid-purge to prove it). Each run logs its count. `TRASH_PURGE_ENABLED=false` turns the job
off. Rolling back the server below this version after projects were trashed would list them
as live again.

Uploads belong to the organisation, not to a project, and are not removed with one; an
orphan sweep is a separate, later job.

## File storage

Uploads and brand assets are stored under `DATA_DIR` with names the server generates
(128 random bits, extension from the detected type) and served only after the name matches
a strict pattern and a row in the database grants access. Request paths are never joined
into a file path. Size limits: `UPLOAD_MAX_BYTES` for uploads and logos, `FONT_MAX_BYTES`
(default 5 MiB) for fonts.

## Out of scope

Password reset and change, email sending, account deletion, organisation deletion and
renaming beyond the brand name, members and invitations (dormant tables only), an instance admin console (listing all accounts), 2FA,
SSO/OIDC, audit log, a shared rate-limit store for several processes, per-project
permissions.
