# Self-hosting ggraphic Studio

ggraphic Studio is the hostable design app: organisations with their own projects, members and brand pack, image uploads and optional AI text drafts. It runs on your own machine or server with Docker Compose. There is no hosted service and no billing; every instance brings its own AI key if it wants AI at all.

> **First run needs the setup token.** On an empty instance Studio prints a one-time setup token to its log at start (`docker compose logs studio`); the admin account can only be created with it. Set `SETUP_TOKEN` in `.env` instead to choose it yourself. The compose file binds Studio to `127.0.0.1`; see [Security](#security) before exposing it.

## Requirements

- Docker Engine 24+ with the Compose plugin (`docker compose version`), or Docker Desktop / Colima / OrbStack.
- About 1 GB of RAM for Studio and Postgres, plus disk for your uploads.
- Optional: access to an OpenAI-compatible chat completions API (Mistral, LiteLLM, Ollama, ...).

## Install and start

```bash
git clone <repository-url> ggraphic && cd ggraphic
cp .env.example .env
# Set at least POSTGRES_PASSWORD (URL-safe), e.g.:
sed -i.bak "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env && rm .env.bak
docker compose up -d --build
```

Read the setup token with `docker compose logs studio`, open <http://localhost:8080> and create the admin account with it. The token works once and is not printed again; if you lose it before setup, restart Studio for a new one. Check the state with `docker compose ps` and `curl http://localhost:8080/healthz` (answers `{"status":"ok"}` when the database is reachable). Logs: `docker compose logs -f studio`.

The database schema is created and upgraded automatically when Studio starts.

Data lives in two named volumes:

| Volume                        | Content                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `ggraphic-studio_db-data`     | Postgres: accounts, sessions, organisations, projects, documents, thumbnails, brand settings |
| `ggraphic-studio_studio-data` | Uploaded images (`/data/uploads`), brand logos and fonts (`/data/brand-assets`)              |

## Configuration

All settings are environment variables in `.env`; `.env.example` documents each one. After changing `.env`, apply it with `docker compose up -d`.

### Accounts and organisations

- The first account is the **instance admin** and owner of the default organisation, which holds every project that existed before accounts (upgrades keep all projects; existing upload files are assigned to it at start).
- Every account belongs to one or more organisations as **owner** (projects, members, invitations, brand) or **editor** (projects).
- New people join through **invitation links**: an owner creates one on the Members page and passes it on; Studio sends no email. A link works once and for seven days. While self-registration is off, only links created by the instance admin can create new accounts; links from other owners need an existing account.
- `ALLOW_REGISTRATION=true` opens self-registration; each new account gets its own organisation.
- Only the instance admin creates further organisations (everyone, when registration is open).
- There is no password reset yet. If someone forgets their password, the admin can set a new hash in the database: `docker compose exec studio node -e "import('argon2').then(a=>a.hash(process.argv[1],{type:a.argon2id})).then(console.log)" 'new password'`, then `UPDATE accounts SET password_hash = '<hash>' WHERE email = '...'; DELETE FROM sessions WHERE account_id = (SELECT id FROM accounts WHERE email = '...');`.

### Brand packs

Owners set their organisation's brand on the Brand page: name, the eight colour roles, the grounds a page can sit on, headline and body fonts, a logo (PNG or WebP; SVG is refused) and font files (WOFF2, TTF, OTF) with a required licence note that is stored with the file. Make sure you may use a font on a web server before uploading it. The editor opens every project with its organisation's brand; without one it uses Studio's own colours.

### AI drafts

AI drafts are off unless `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `OPENAI_MODEL` are all set. The app asks `GET /api/config` and hides AI features when they are off. Studio calls `<OPENAI_BASE_URL>/chat/completions` with JSON mode (`response_format: {"type": "json_object"}`), so the model must support JSON output.

Mistral:

```dotenv
OPENAI_BASE_URL=https://api.mistral.ai/v1
OPENAI_API_KEY=<your Mistral API key>
OPENAI_MODEL=mistral-small-latest
```

Ollama on the same machine (Ollama ignores the key, but Studio needs a value to switch AI on):

```dotenv
OPENAI_BASE_URL=http://host.docker.internal:11434/v1
OPENAI_API_KEY=ollama
OPENAI_MODEL=llama3.2
```

On Linux, Ollama listens on `127.0.0.1` by default and is then not reachable from containers; start it with `OLLAMA_HOST=0.0.0.0` (and keep port 11434 firewalled). Small local models are slower: raise `AI_TIMEOUT_MS` if drafts time out.

LiteLLM proxy (route to any provider you configured there):

```dotenv
OPENAI_BASE_URL=http://litellm.internal:4000/v1
OPENAI_API_KEY=<a LiteLLM virtual key>
OPENAI_MODEL=<model name from your LiteLLM config>
```

The API key stays on the server: it is never sent to the browser and never written to the logs. Briefing texts do go to the provider you configure, so pick one whose data processing you accept.

## Backups

Back up both the database and the uploads volume; one without the other leaves projects pointing at missing images.

```bash
# Database (consistent dump while running)
docker compose exec -T db pg_dump -U studio -d studio --format=custom > studio-$(date +%F).dump

# Uploads
docker run --rm -v ggraphic-studio_studio-data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/studio-uploads-$(date +%F).tar.gz -C /data .
```

Restore into a fresh installation:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U studio -d studio --clean --if-exists < studio-YYYY-MM-DD.dump
docker run --rm -v ggraphic-studio_studio-data:/data -v "$PWD":/backup alpine \
  sh -c 'tar xzf /backup/studio-uploads-YYYY-MM-DD.tar.gz -C /data && chown -R 1000:1000 /data'
docker compose up -d
```

## Upgrades

```bash
# Back up first (see above), then:
git pull
docker compose up -d --build
```

Migrations run on start-up, each in its own transaction; a failed migration stops Studio and leaves the database as it was. Check `docker compose logs studio` after an upgrade.

Postgres major versions (e.g. 17 to 18) are not upgraded in place: dump, switch the image, restore.

## Security

- **First-run setup is gated by a token** printed once at start (or `SETUP_TOKEN`). It is compared in constant time and becomes invalid with the first account.
- **TLS in front.** To share an instance, keep the `127.0.0.1` binding and put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front. Set `TRUST_PROXY` to the proxy's hop count or addresses (e.g. `1`, or `loopback,172.16.0.0/12`) so login rate limits see client addresses, not the proxy's; `true` is refused, and Studio logs a warning once when it sees `X-Forwarded-For` while `TRUST_PROXY` is off.
- **Sessions** are server-side rows in Postgres; the browser holds a random token in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie (`__Host-studio_session`) and the database only its SHA-256. Passwords are hashed with argon2id.
- **CSRF:** every state-changing request needs the session's CSRF token in `X-CSRF-Token`; requests a browser marks as cross-site are refused; the login endpoints accept JSON only.
- **Login rate limits:** 10 failed attempts per email and 30 attempts per client IP (IPv6: per /64) within 15 minutes, per Studio process. At most four password hashes run at once; when 64 more are waiting, further logins get `503`.
- **Organisations are isolated:** a project, upload, member list or brand pack of an organisation you are not a member of answers `404`.
- Uploads are checked by their content (PNG, JPEG, GIF, WebP, AVIF, SVG), stored under random names and served with `Content-Security-Policy: sandbox`; SVGs are additionally served as attachments so their scripts never run as a page.
- Logos and fonts are checked by their content as well, stored under random names and served only to members of their organisation.

## Stopping and removing

```bash
docker compose down        # stop, keep data
docker compose down -v     # stop and DELETE all projects and uploads
```

## Running without Docker

Node 22+ and pnpm, plus a Postgres 13+ database:

```bash
pnpm install
pnpm --filter @ggraphic/studio-server build
DATABASE_URL=postgres://studio:secret@127.0.0.1:5432/studio pnpm --filter @ggraphic/studio-server start
```

## Not yet supported

- Password reset and change, email, two-factor login and OIDC/SSO.
- Deleting accounts and organisations from the UI.
- Object storage (S3-compatible) for uploads; uploads are local disk only.
- Cleaning up uploads that no project uses any more.
