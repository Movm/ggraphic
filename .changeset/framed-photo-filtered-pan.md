---
'@ggraphic/editor': patch
---

A filtered photo in a frame pans and resizes its crop at frame rate, as the background photo does since #200. Dragging the photo inside its frame, or the crop window's handles, used to re-cache the node, and so run every filter, once per pointer move. Now the node shows a copy filtered once when Ausschnitt mode opens, and its filters and a sharp cache come back on release.
