---
'@ggraphic/editor': patch
---

Declare `@tiptap/pm`, `react-is` and `y-protocols` as dependencies. The editor's tiptap packages, recharts and `@hocuspocus/provider` need them as peers; package managers that don't install missing peers (yarn) failed to build a host.
