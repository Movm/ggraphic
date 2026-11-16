---
'@ggraphic/editor': minor
---

Text size like in Canva. The size field in the toolbar takes a typed number: Enter or leaving the field applies it, Escape drops it, the arrow keys step by 1 (10 with Shift). A text has corner handles: dragging a corner scales the text, the size field follows the drag live, and the size is written on release in the same undo step as the box. A free text kept only its new width before. A template text gets corners where its size persists (`fontSizeStateKey`). A size set by hand fixes the size: `updateAdditionalText` with `fontSize` drops `maxFontSize`, so no later edit, font or brand change refits the text over it.
