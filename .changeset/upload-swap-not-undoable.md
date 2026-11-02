---
'@ggraphic/editor': minor
---

An uploaded photo's durable URL replaces its `blob:` preview in the whole undo history instead of becoming an undo step of its own. Before, undo after a slow upload could bring back the revoked preview and save it, so the photo was lost for everyone. `createActions` gets an optional sixth argument, `history` (`CanvasActionHistory`), which `createUserImageActions` and `createElementActions` take as their last argument. A template that builds its own actions passes it on; without it the swap stays an undo step as before.
