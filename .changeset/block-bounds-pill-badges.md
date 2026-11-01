---
'@ggraphic/editor': patch
---

`boundsOf` measures pill badges as the box they draw instead of a point, so a block made only of
boxed lines no longer has zero width when it is placed on a page.
