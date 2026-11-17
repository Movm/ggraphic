---
'@ggraphic/editor': patch
---

Panning a filtered background photo in Ausschnitt mode runs at frame rate. Every pointer move used to re-cache the node and so ran every filter over the whole bitmap again (about 85 ms per move). Now the node shows a copy of the whole photo, filtered once at the resolution it is shown at, with its crop scaled to that copy and no filters or cache. The copy is made when Ausschnitt mode opens, and again after a zoom. On release the photo, its filters and a sharp cache come back before the store updates. `cropGhostSource` takes an optional `maxSide`.
