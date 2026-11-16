---
'@ggraphic/editor': patch
---

Panning a background photo in Ausschnitt mode no longer jumps back when the pointer rests. The pan read its offset from the node, which it puts back on its box after every move. Konva fires `dragmove` without placing the node again when the pointer did not move, so a resting mouse or trackpad read a pan of zero and the photo jumped to where the drag began, back and forth while dragging and lost entirely when released during a pause. The offset now comes from the pointer, as Konva places a dragged node.
