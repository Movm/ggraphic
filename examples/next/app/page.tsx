// SPDX-License-Identifier: MPL-2.0
// A server component: it renders the host's page; the editor is a client component inside it.
// Start-up code may also run here: the host entry loads no React UI, so a server component can
// import it (and call `registerTemplates`, `registerCanvasFormats`, …) without a client boundary.
import { canvasFormats } from '@ggraphic/editor/host';

import { Editor } from './Editor';

export default function Page() {
  return (
    <>
      <h1 className="page-title">My host app</h1>
      <p className="page-formats">{canvasFormats().length} canvas formats</p>
      {/* The editor fills the viewport: its sidebar and bars are fixed to the window. */}
      <main className="editor">
        <Editor />
      </main>
    </>
  );
}
