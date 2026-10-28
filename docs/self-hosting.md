# Self-hosting ggraphic Studio

ggraphic Studio is the hostable design app: projects with one editor document each, image uploads and optional AI text drafts. It runs on your own machine or server with Docker Compose. There is no hosted service, no account and no billing; every instance brings its own AI key if it wants AI at all.

> **No login yet.** Anyone who can reach Studio can read, change and delete every project. The compose file therefore binds Studio to `127.0.0.1` only. See [Security](#security) before exposing it anywhere else.

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

Open <http://localhost:8080>. Check the state with `docker compose ps` and `curl http://localhost:8080/healthz` (answers `{"status":"ok"}` when the database is reachable). Logs: `docker compose logs -f studio`.

The database schema is created and upgraded automatically when Studio starts.

Data lives in two named volumes:

| Volume                        | Content                                            |
| ----------------------------- | -------------------------------------------------- |
| `ggraphic-studio_db-data`     | Postgres: projects, documents, thumbnails          |
| `ggraphic-studio_studio-data` | Uploaded images (`/data/uploads` in the container) |

## Configuration

All settings are environment variables in `.env`; `.env.example` documents each one. After changing `.env`, apply it with `docker compose up -d`.

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

- **No authentication.** Keep Studio on `127.0.0.1` (the default) and use it on that machine, or through an SSH tunnel: `ssh -L 8080:127.0.0.1:8080 your-server`.
- To share an instance, put it behind your own authenticating reverse proxy (e.g. oauth2-proxy, Authelia, or HTTP basic auth with TLS in Caddy/nginx). Do not change the port binding to `0.0.0.0` without that.
- Uploads are checked by their content (PNG, JPEG, GIF, WebP, AVIF, SVG), stored under random names and served with `Content-Security-Policy: sandbox`; SVGs are additionally served as attachments so their scripts never run as a page.
- Accounts are planned (projects already carry an `owner_id` column); until then, treat every instance as single-user.

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

- Logins and per-user projects (Better Auth with email/password and optional OIDC is planned).
- Object storage (S3-compatible) for uploads; uploads are local disk only.
- Cleaning up uploads that no project uses any more.
