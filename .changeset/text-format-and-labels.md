---
'@ggraphic/editor': patch
---

Fix three text editing details. Bold is disabled (and shown as not pressed, with an explanatory label)
while italic is on in a font without a bold italic cut; `FontMarkSupport` gains `boldItalic`, the one
answer `runFont` also reads. Layer names no longer show italic markers (`_text_`) literally. The
canvas texts in the Text tab are textareas, so editing no longer drops their line breaks.
