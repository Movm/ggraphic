---
'@ggraphic/core': minor
'@ggraphic/editor': minor
---

Hosts can ship SVG illustration sets of their own. `SvgSource` is now `keyof SvgSources`. A host adds its set with `declare module '@ggraphic/core' { interface SvgSources { mine: true } }` and lists it through `IllustrationSources.loadSvg` as before. The new `IllustrationSources.recolor` names, per set, the colour its files draw their main shapes in, and tinting swaps that colour. Open Doodles keeps its built-in `#ff5678`.
