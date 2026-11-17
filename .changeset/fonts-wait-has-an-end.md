---
'@ggraphic/editor': minor
---

`captureActivePage` takes `fontWaitMs`: the longest wait for fonts before the export, after which the fallback faces are used. Without it the export waits until the fonts settle, as before.

A web view that cannot fetch a font file can leave its faces loading for good (WKWebView in an Expo DOM component), and `captureActivePage` then never returned. `@ggraphic/react-native` passes 3000.
