// SPDX-License-Identifier: MPL-2.0
import { useGgraphicEditor, type GgraphicDocument } from '@ggraphic/react-native';
import { useState } from 'react';
import { Button, Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import EditorDom from './components/EditorDom';

export function App() {
  const [design, setDesign] = useState<GgraphicDocument | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Store `design` wherever the app keeps its data; `editor.load({ document })` opens it again.
  // As `document` it also brings the design back when the web view reloads.
  const { editor, commands, onEvent } = useGgraphicEditor({ onChange: setDesign });

  const exportPng = () => {
    editor.exportPng({ pixelRatio: 2 }).then(setPng, (e: Error) => setError(e.message));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.bar}>
        <Button title="Undo" onPress={() => void editor.undo()} />
        <Button title="Redo" onPress={() => void editor.redo()} />
        <Button title="Export PNG" onPress={exportPng} />
        <Button title="New" onPress={() => void editor.load({ document: null })} />
      </View>
      <Text style={styles.status}>
        {error ?? `${design?.pages.length ?? 0} page(s), ${commands.length} pending`}
      </Text>
      <View style={styles.editor}>
        <EditorDom
          document={design}
          commands={commands}
          onEvent={onEvent}
          dom={{ style: { flex: 1 } }}
        />
      </View>
      {png ? (
        <Image style={styles.preview} source={{ uri: `data:image/png;base64,${png}` }} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: { flexDirection: 'row', justifyContent: 'space-around' },
  status: { textAlign: 'center', padding: 4 },
  editor: { flex: 1 },
  preview: { height: 120, resizeMode: 'contain' },
});
