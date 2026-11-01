# Security policy

## Reporting a vulnerability

Report vulnerabilities **privately** through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Please do not open a public issue, discussion or pull request for a suspected vulnerability.

Include what you can:

- the affected package or app and version (`@ggraphic/editor@0.1.0-alpha.0`, Studio commit, …)
- the impact: what an attacker can do, and under which preconditions
- steps or a proof of concept to reproduce it

## What to expect

- We confirm receipt within 7 days and keep you updated while we work on it.
- We agree a disclosure date with you; fixes ship as a new release and a GitHub security advisory.
- We credit you in the advisory unless you prefer not to be named.

## Supported versions

ggraphic is alpha. Only the latest published version of each package and the latest Studio on `main` receive fixes.

## Scope

In scope: the packages in `packages/*` and ggraphic Studio (`apps/studio`, `apps/studio-server`), including the Docker Compose setup in this repository. Out of scope: deployments run by third parties, and vulnerabilities in dependencies that are already public (report those upstream; we update promptly).
