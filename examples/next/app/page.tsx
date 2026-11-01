// SPDX-License-Identifier: MPL-2.0
// A server component: it renders the host's page; the editor is a client component inside it.
import { Editor } from './Editor';

export default function Page() {
  return (
    <>
      <h1 className="page-title">My host app</h1>
      {/* The editor fills the viewport: its sidebar and bars are fixed to the window. */}
      <main className="editor">
        <Editor />
      </main>
    </>
  );
}
