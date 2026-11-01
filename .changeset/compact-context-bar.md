---
'@ggraphic/editor': minor
---

Compact context bar. Opacity is a popover button; Position is a text button whose popover also
holds the layer order; gradient, outline and shadow move into a new "Effects" sidebar area
(`EffectsSection`, tab id `effects`) opened from the bar. `MobileSelectionPill` is now
`SelectionPill` (`variant: 'touch' | 'pointer'`) and also stands above the selection on desktop,
with lock, duplicate, delete and a "..." menu. On mobile the "..." opens `CanvasActionSheet`, built
from the same menu model as the desktop context menu, and the selection bar shows its tools as
labelled tiles (`barTiles`). `FloatingGradientControl`, `FloatingOutlineControl` and
`FloatingShadowControl` are removed. Breaking for hosts that import them or
`components/MobileSelectionPill`.
