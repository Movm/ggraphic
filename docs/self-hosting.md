# Self-hosting ggraphic Studio

ggraphic Studio is the hostable design app: organisations with their own projects and brand pack, image uploads and optional AI text drafts. It runs on your own machine or server with Docker Compose. There is no hosted service and no billing; every instance brings its own AI key if it wants AI at all.

> **First run needs the setup token.** On an empty instance Studio prints a one-time setup token to its log at start (`docker compose logs studio`); the admin account can only be created with it. Set `SETUP_TOKEN` in `.env` instead to choose it yourself. The compose file binds Studio to `127.0.0.1`; see [Security](#security) before exposing it.

## Requirements

- Docker Engine 24+ with the Compose plugin (`docker compose version`), or Docker Desktop / Colima / OrbStack.
- About 1 GB of RAM for Studio and Postgres, plus disk for your uploads.
- Optional: access to an OpenAI-compatible chat completions API (Mistral, LiteLLM, Ollama, ...).

## Install and start

Studio is published as a container image, `ghcr.io/movm/ggraphic-studio`, for linux/amd64 and linux/arm64. You need two files from this repository, not a clone:

```bash
mkdir ggraphic-studio && cd ggraphic-studio
curl -fsSLO https://raw.githubusercontent.com/Movm/ggraphic/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/Movm/ggraphic/main/.env.example -o .env
# Set at least POSTGRES_PASSWORD (URL-safe), e.g.:
sed -i.bak "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env && rm .env.bak
docker compose up -d
```

Compose pulls `latest` by default. To stay on one version, set `STUDIO_VERSION` in `.env` (e.g. `0.1.0-alpha.1`); the published versions are listed on the [package page](https://github.com/Movm/ggraphic/pkgs/container/ggraphic-studio).

Read the setup token with `docker compose logs studio`, open <http://localhost:8080> and create the admin account with it. The token works once and is not printed again; if you lose it before setup, restart Studio for a new one. Check the state with `docker compose ps` and `curl http://localhost:8080/healthz` (answers `{"status":"ok"}` when the database is reachable). Logs: `docker compose logs -f studio`.

The database schema is created and upgraded automatically when Studio starts.

Data lives in two named volumes:

| Volume                        | Content                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `ggraphic-studio_db-data`     | Postgres: accounts, sessions, organisations, projects, documents, thumbnails, brand settings |
| `ggraphic-studio_studio-data` | Uploaded images (`/data/uploads`), brand logos and fonts (`/data/brand-assets`)              |

The image is built from this repository by `.github/workflows/studio-image.yml`. Its labels name the source (`org.opencontainers.image.source`) and the licence, and `/app/LICENSES` holds the licence texts. Studio is AGPL-3.0: if you run a modified Studio as a service, offer its source to your users.

### Building from source

To build the image from a checkout instead of pulling it, add `docker-compose.build.yml`:

```bash
git clone https://github.com/Movm/ggraphic ggraphic && cd ggraphic
cp .env.example .env   # then set POSTGRES_PASSWORD as above
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

The build is tagged `ggraphic-studio:local`, not with the published name, so a later `docker compose up` without the second file uses the published image again.

## Configuration

All settings are environment variables in `.env`; `.env.example` documents each one. After changing `.env`, apply it with `docker compose up -d`.

### Accounts and organisations

Studio is a single-user tool for now: one person, one organisation.

- The first account is the **instance admin** and owner of the default organisation, which holds every project that existed before accounts (upgrades keep all projects; existing upload files are assigned to it at start).
- There are no invitation links and no member management. The tables and the `/api/orgs/:orgId/...` URLs stay, so this can come back; no endpoint creates organisations, members or invitations today.
- A second person gets an account only when you set `ALLOW_REGISTRATION=true` (default `false`) and they register on the login page; each new account gets its own organisation and sees nothing of yours. There is no admin screen to create accounts.
- Every account owns an organisation to work in. An account that owns none (a new one, or one that only has editor memberships left over from earlier invitations) gets a personal one, named after the person, at its next login or session check, and works there; its other memberships stay and are listed after it.
- There is no password reset yet. If someone forgets their password, the admin can set a new hash in the database: `docker compose exec studio node -e "import('argon2').then(a=>a.hash(process.argv[1],{type:a.argon2id})).then(console.log)" 'new password'`, then `UPDATE accounts SET password_hash = '<hash>' WHERE email = '...'; DELETE FROM sessions WHERE account_id = (SELECT id FROM accounts WHERE email = '...');`.

### Trash

Deleting a project moves it to the trash (`/trash` in the app); from there it can be restored or deleted for good. A project is removed for good 30 days after it was deleted, by a job inside the server process that checks every six hours (the first time ten minutes after start; with several instances on one database only one runs it at a time). Each run logs `Trash purge: removed N projects` and nothing else. `TRASH_PURGE_ENABLED=false` switches the job off: deleted projects then stay in the trash until they are deleted by hand. Uploaded images are shared by an organisation's projects and are not removed with a project.

### Brand packs

Owners set their organisation's brand on the Brand page: name, three colours (primary, secondary, accent), headline and body fonts, a logo (PNG or WebP; SVG is refused) and font files (WOFF2, TTF, OTF) with a required licence note that is stored with the file. Studio derives the other five roles (accent on light, attention, text on dark, text on light, surface) and the grounds a page can sit on from the three colours, so that text and accents stay readable; they cannot be set by hand. Saving a brand that was set by hand replaces its hand-set values with derived ones. Make sure you may use a font on a web server before uploading it. The editor opens every project with its organisation's brand; without one it uses Studio's own colours.

### Tools that need an outside service

Studio's tools that call an outside service all follow one rule: a tool is **on when its key or URL is set**. `<TOOL>_ENABLED=false` switches a configured tool off (for example `AI_ENABLED=false`), and `<TOOL>_ENABLED=true` without its key or URL stops the server at start with an error, so a typo does not leave you with a silently missing tool. Tools whose service is not configured are hidden in the editor, and their routes answer `{"error":"feature_disabled"}` (the AI routes keep `ai_disabled`). Icon search is the exception to "on when set": it needs no key, so it is **off until `ICONIFY_ENABLED=true`** (see [Icon search](#icon-search)). `GET /api/config` tells the app which tools are on, as booleans only; keys and hosts never leave the server.

### AI drafts

AI drafts are off unless `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `OPENAI_MODEL` are all set (or `AI_ENABLED=false`). The app asks `GET /api/config` and hides AI features when they are off. Studio calls `<OPENAI_BASE_URL>/chat/completions` with JSON mode (`response_format: {"type": "json_object"}`), so the model must support JSON output.

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

### Remove background

The editor's "remove background" tool is on when `REMBG_URL` points at a [rembg](https://github.com/danielgatis/rembg) server (`rembg s`, MIT). Studio posts the image and the model name `REMBG_MODEL` to `<REMBG_URL>/api/remove` and returns the PNG; `REMBG_TIMEOUT_MS` (default 60000) bounds one call. The URL is operator configuration: the route only takes image bytes from users, never a URL. Images sent for cutting leave Studio for the rembg server, so keep it on your own network, without a public port and without outbound access once its model is downloaded.

**With docker compose** add this line to `.env`, then `docker compose up -d`:

```bash
COMPOSE_PROFILES=rembg
```

This starts `ghcr.io/movm/ggraphic-rembg` next to Studio and points `REMBG_URL` at it (`http://rembg:7000`). The image is rembg's server with one model built in, u2net (Apache-2.0), so it never downloads a model. It runs on an internal network with no route out of the instance and no port on the host. It takes about 1.4 GB of disk, a download of about 420 MB (measured for rembg 2.0.86: 1.39 GB unpacked, 416 MB compressed); one cut takes a few seconds of CPU. `REMBG_VERSION` pins its tag (the rembg version). Use `COMPOSE_PROFILES` in `.env` rather than `docker compose --profile rembg`: compose shows the profiles to the compose file only through that variable, so with `--profile` alone rembg would run but Studio would not know about it. Compose cannot look for the word `rembg` in that variable either, so any non-empty `COMPOSE_PROFILES` points `REMBG_URL` at the rembg service. It is the compose file's only profile; if you add a profile of your own, set `REMBG_URL` as well (or `REMBG_ENABLED=false` without rembg).

**The model.** rembg's server picks the model per request, and its own default, `bria-rmbg`, carries BRIA's licence, which requires a paid agreement for commercial use; rembg's README says model weights have their own licences, independent of rembg's MIT licence. Studio therefore asks for `u2net` with every image. Before, Studio sent no model name, so a rembg server cut with `bria-rmbg`. If you have a BRIA licence, set `REMBG_MODEL=bria-rmbg`; any other model name rembg knows works the same way, and rembg downloads it on first use. rembg's own Docker image is not used here: it is amd64 only and carries the `bria-rmbg` weights (its Dockerfile runs `rembg d bria-rmbg`; checked against rembg's `main` branch, November 2026).

**Your own rembg server** works too: set `REMBG_URL`, e.g. with the Python package and `REMBG_URL=http://host.docker.internal:7000`:

```bash
pip install "rembg[cpu,cli]"
rembg s --host 0.0.0.0 --port 7000 --no-ui
```

Uploads for this tool are limited by `UPLOAD_MAX_BYTES`; SVG is refused.

### Icon search

With `ICONIFY_ENABLED=true` the editor's Elements tab searches 400,000+ icons from [Iconify](https://iconify.design) next to the icons bundled with the editor. It is off by default because it sends data out of the instance.

**What leaves your instance when it is on:** the search term (up to 64 characters) and the icon set and name of each icon that is previewed or placed, sent from the Studio server to `ICONIFY_API_URL` (default `https://api.iconify.design`, the public Iconify API; no key, no account). The browser never contacts Iconify: it asks Studio, so Iconify sees the server's address, not your users', and no cookie or account data. It does not see which account searched. No design content, image or text from a design is sent. To keep everything inside your network, run your own [Iconify API](https://iconify.design/docs/api/) (open source, with the icon sets you choose) and set `ICONIFY_API_URL` to it.

Studio fixes the host to `ICONIFY_API_URL`; users cannot send a URL. Requests are authenticated, rate limited per account, bounded in time (`ICONIFY_TIMEOUT_MS`, default 10000) and size, and never follow redirects. Studio caches search results (10 minutes), the licence table (1 hour) and icons (24 hours) in memory.

**Licences.** Only sets whose licence is in `ICONIFY_LICENCES` are offered (default `MIT,Apache-2.0,ISC,CC0-1.0,OFL-1.1,CC-BY-4.0,CC-BY-3.0`); a set whose licence Iconify does not state is never offered. NC, ND, SA and GPL licences are refused at start. Font Awesome sets are excluded on purpose, as is Remix Icon above version 4.8.0 (later versions carry a non-open licence). Each hit shows its set, licence and author. A placed icon is stored as a copy of its SVG in the design (so exports work offline), together with its source, licence and author. Studio rebuilds every SVG from an allowlist of shapes and attributes (no scripts, styles, animation, images or external references) before serving it and again before the editor stores or draws it. **Credits.** Almost every offered licence (MIT, Apache-2.0, ISC, CC BY, OFL) asks for a notice. Studio adds one line per icon set to the **share text** (the text offered next to the image when sharing or copying), in German, with the author and a link to the licence text, for every set except CC0. **Nothing is embedded in exported images** (PNG, PDF, PPTX): if you publish an image on its own, add the credit yourself. The picker shows "Icon: <set> von <author>, <licence>" for the selected icon.

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
docker compose pull
docker compose up -d
```

With `STUDIO_VERSION` set in `.env`, change it to the new version first. A new release can change `docker-compose.yml` or add settings to `.env.example`: fetch the compose file again with the `curl` line from [Install and start](#install-and-start) and compare `.env.example` with your `.env`. If you build from source, `git pull`, then `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`.

Migrations run on start-up, each in its own transaction; a failed migration stops Studio and leaves the database as it was. Check `docker compose logs studio` after an upgrade.

Postgres major versions (e.g. 17 to 18) are not upgraded in place: dump, switch the image, restore.

## Security

- **First-run setup is gated by a token** printed once at start (or `SETUP_TOKEN`). It is compared in constant time and becomes invalid with the first account.
- **TLS in front.** To share an instance, keep the `127.0.0.1` binding and put a TLS-terminating reverse proxy (Caddy, nginx, Traefik) in front. Set `TRUST_PROXY` to the proxy's hop count or addresses (e.g. `1`, or `loopback,172.16.0.0/12`) so login rate limits see client addresses, not the proxy's; `true` is refused, and Studio logs a warning once when it sees `X-Forwarded-For` while `TRUST_PROXY` is off.
- **Sessions** are server-side rows in Postgres; the browser holds a random token in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie (`__Host-studio_session`) and the database only its SHA-256. Passwords are hashed with argon2id. `COOKIE_SECURE=false` is refused on a non-loopback `HOST` (as in the container) unless `ALLOW_INSECURE_COOKIE=1` is set, and Studio then prints a warning at every start.
- **CSRF:** every state-changing request needs the session's CSRF token in `X-CSRF-Token`; requests a browser marks as cross-site are refused; the login endpoints accept JSON only.
- **Login rate limits:** 10 failed attempts per email and 30 attempts per client IP (IPv6: per /64) within 15 minutes, per Studio process. At most four password hashes run at once; when 64 more are waiting, further logins get `503`.
- **Organisations are isolated:** a project, upload or brand pack of an organisation you are not a member of answers `404`.
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
