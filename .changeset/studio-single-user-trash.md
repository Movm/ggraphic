---
'@ggraphic/studio-server': minor
---

Studio is single-user for now: the organisation, member and invitation routes are gone (tables and `/api/orgs/:orgId/...` URLs stay), and every account gets a personal organisation. Deleted projects move to a 30-day trash (restore, delete now, a purge job; `TRASH_PURGE_ENABLED=false` switches it off). The brand `PUT` takes three colours and derives the other roles and the grounds.
