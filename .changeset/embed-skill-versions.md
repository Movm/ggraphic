---
'@ggraphic/editor': patch
---

The `ggraphic-embed` skill no longer asks for one shared version across `@ggraphic/*`: the packages are versioned independently, so a host pins each one to the version under the `alpha` tag and takes core and schema at the versions the editor depends on.
