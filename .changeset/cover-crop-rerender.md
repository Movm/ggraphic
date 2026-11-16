---
'@ggraphic/editor': patch
---

A background photo in Ausschnitt mode keeps the crop a pan has set on the node through a re-render. `CanvasImage` built its crop as a new object on every render, so react-konva wrote the committed crop back over the panned one whenever the image re-rendered mid-gesture, and the photo jumped back for a frame.
