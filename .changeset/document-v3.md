---
'@ggraphic/schema': minor
'@ggraphic/editor': minor
---

Canvas document version 3 for templates. The core step 2 → 3 is the identity on pages; the page keys `templateRef` and `groups` persist, are not inherited by added pages, and are known to the PPTX export. A build without version 3 now opens such a document read-only.
