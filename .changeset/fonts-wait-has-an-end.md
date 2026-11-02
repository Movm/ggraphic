---
'@ggraphic/editor': patch
---

An export waits at most 3 s for fonts. A web view that cannot fetch a font file (WKWebView in an
Expo DOM component) left its faces loading for good, and `captureActivePage` never returned.
