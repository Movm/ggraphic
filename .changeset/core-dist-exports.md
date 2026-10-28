---
'@ggraphic/core': patch
---

Resolve `import` to the built `dist/` outside development, so Node can load the package in a deployed install (the Studio server image).
