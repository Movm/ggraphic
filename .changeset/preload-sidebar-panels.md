---
'@ggraphic/editor': patch
---

The editor shell preloads the Elements and Tools panels while the browser is idle, so their first open renders directly instead of suspending behind the chunk import. Any section of the config's tabs built with `lazyWithPreload` is warmed the same way.
