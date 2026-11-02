---
'@ggraphic/editor': patch
---

The `react` and `react-dom` peer ranges now start at `^19.3.0` instead of `^19.0.0` (#134). The editor's `react-konva ^19.3.2` peer already required React 19.3, so a host on React 19.0–19.2 got `ERESOLVE` from npm naming react-konva, not the editor. Nothing changes for hosts on 19.3 or later. The README install line now uses the `alpha` dist-tag instead of a fixed version.
