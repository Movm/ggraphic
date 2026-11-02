# @ggraphic/react-native

The ggraphic editor in a React Native / Expo app. The editor runs in an
[Expo DOM component](https://docs.expo.dev/guides/dom-components/) (a web view),
and the app drives it through a small typed bridge:

- load a design and a template pack
- `onChange`: the whole design after every change
- export the active page as PNG (base64, back in the app)
- undo / redo

Private for now: not published to npm yet.

## Use

Expo DOM components need these in the app, next to `@expo/dom-webview`:

```sh
npx expo install react-dom react-native-web @expo/metro-runtime
```

The DOM side is a file of your own that starts with `'use dom'`, so that Expo bundles it for the
web view. It imports the brand, the stylesheets and the templates:

```tsx
// components/EditorDom.tsx
'use dom';
import { defaultBrand } from '@ggraphic/brand-default';
import '@ggraphic/brand-default/fonts';
import '@ggraphic/editor/styles/compiled.css';
import { GgraphicDomEditor, type GgraphicDomEditorProps } from '@ggraphic/react-native/dom';
import { type DOMProps } from 'expo/dom';

import templates from './templates.json';

export default function EditorDom(
  props: Omit<GgraphicDomEditorProps, 'brand' | 'templates'> & { dom?: DOMProps }
) {
  return <GgraphicDomEditor {...props} brand={defaultBrand} templates={templates} />;
}
```

The native side holds the bridge:

```tsx
import { useGgraphicEditor } from '@ggraphic/react-native';

const { editor, commands, onEvent } = useGgraphicEditor({ onChange: saveDesign });

<EditorDom commands={commands} onEvent={onEvent} dom={{ style: { flex: 1 } }} />;

const png = await editor.exportPng({ pixelRatio: 2 }); // base64, no data URL prefix
await editor.undo();
await editor.load({ document: storedDesign, templates: otherPack });
```

Every call resolves when the editor has answered, and rejects with the editor's error or after a
timeout (30 s, `timeoutMs`).

## The bridge

Expo DOM components take serialisable props, and a function prop becomes a call back into the
app. The bridge uses exactly that, in both directions:

- **App → editor:** the pending commands are a prop (`commands`), each with an id that only grows.
  The editor runs every id it has not run yet and answers each one exactly once. A reloaded web
  view runs what is still pending again.
- **Editor → app:** one function prop (`onEvent`) carries `ready`, `change` and `result`.

Commands run in the order they were sent. A command after a `load` runs on the design that load
opened; a `load` whose template pack fails is answered with the error and leaves the open design
as it is. If the editor throws (a broken design or pack), every command is answered with that
error until a `load` opens another design. `ready` comes once per mount, so after every `load`.

`exportPng` takes a `pixelRatio` up to 4 and fails for a PNG over 32 MiB of base64 instead of
sending it.

### When the web view reloads

The editor starts again from the `document` prop, with an empty undo history. To keep the user's
work, pass the last design from `onChange` as `document`; the editor reads it only when it mounts.
Do not call `load` on `ready`: every `load` remounts the editor, which sends `ready` again.

The commands still pending are run again. An undo or redo that ran just before the reload, but
whose answer had not reached the app yet, runs a second time.

### Fonts

Expo's Metro does not rewrite `url()` in CSS, so the font files of `@ggraphic/brand-default/fonts`
do not load in the web view: the editor and its PNGs use fallback faces. `GgraphicDomEditor`
exports with `fontWaitMs: 3000`, so an export waits at most 3 s for fonts; elsewhere the editor
waits until they settle.

`src/bridge.ts` defines the messages and reads them (`parseEditorCommand`, `parseEditorEvent`) on
both sides; `src/client.ts` is the app side without React. Nothing in the native entry loads the
editor.

See `examples/expo` for a whole app.
