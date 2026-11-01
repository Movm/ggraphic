---
'@ggraphic/editor': minor
---

`GgraphicEditor` (`@ggraphic/editor/embed`): the editor in one component. A host passes a brand pack, a template pack (`templatePackFromJson`, also exported here), the document and an `onChange`; the component fills the brand, message and template registers, provides a React Query client and the host services, and renders the shell. Defaults: browser downloads, object-URL uploads, no AI and no collaboration, English texts (`locale`). The import is SSR-safe; the editor renders in the browser only. `CanvasEditorShell` gets `onPagesChange`, called with every page after each change to the deck.
