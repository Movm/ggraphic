---
'@ggraphic/editor': patch
---

Read every page state through the document codec, so the editor can read both the plain and the structured form of a page's state (document version 4). Nothing writes the structured form yet. A change inside a structured key reaches the canvas as the whole key, and the history comparison no longer depends on the order of an object's keys.
