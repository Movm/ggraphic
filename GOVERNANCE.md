# Governance

## Maintainers

ggraphic is maintained by Moritz Wächter ([@Movm](https://github.com/Movm)), who holds the copyright of the code extracted from the Grünerator and decides on licensing, releases and direction. Further maintainers are added by the existing maintainers and listed in `.github/CODEOWNERS`.

## Decisions

- Everyday changes are decided in pull request review.
- Changes to public APIs, the document format, licences or the release process start as an issue, so users can comment before code lands.
- Direction and larger plans are written down in `docs/` (for example [the embedding roadmap](./docs/embedding-roadmap.md)).

## Licensing

Packages are MPL-2.0, the open template pack CC0-1.0, Studio AGPL-3.0. Contributions come under the DCO and the licence of the part they change; there is no CLA. Moving code between parts with different licences (for example from Studio into a package) needs the copyright holder's explicit approval in the pull request.

## Releases

Packages are released with changesets from `main`, currently in pre mode (`alpha`). A release happens when a maintainer merges the "Version Packages" pull request; publishing uses npm trusted publishing with provenance.
