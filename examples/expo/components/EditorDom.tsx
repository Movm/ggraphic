// SPDX-License-Identifier: MPL-2.0
'use dom';
// Expo bundles this file for a web view: the editor and its stylesheets run there, not in React
// Native. The brand is imported here, so it never has to cross the bridge.
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
