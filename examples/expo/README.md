# ggraphic in an Expo app

The editor as an Expo DOM component, driven from React Native with `@ggraphic/react-native`:
undo, redo, export as PNG (shown below the editor) and a new design.

- `components/EditorDom.tsx`: the `'use dom'` file. The editor, its styles, brand and templates
  live here, in the web view.
- `App.tsx`: the native screen with the bridge (`useGgraphicEditor`).

## Run

From the repository root, build the packages, then pack them for this app:

```sh
pnpm install && pnpm build
cd examples/expo
npm run pack:local
npm install
npx expo run:ios   # or run:android, or `npx expo start` with a development build
```

The app installs the packages from `tarballs/`, as a host app would from npm.
