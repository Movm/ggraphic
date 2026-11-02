// SPDX-License-Identifier: MIT
// The editor page, a server component around the client component `Editor`. From the start page
// it gets `?format=…&template=…` and opens a new design; without them it opens the stored one.
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { newDesign } from '../catalog';
import { Editor } from '../Editor';

export default async function EditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { format, template } = await searchParams;
  const fromStartPage = format !== undefined || template !== undefined;
  const start = fromStartPage ? newDesign(format, template) : null;
  if (fromStartPage && !start) redirect('/');

  return (
    // The header takes its height, the editor the rest of the window: the editor fills its
    // host's box, so `.editor` sets the size and nothing scrolls.
    <div className="edit-layout">
      <header className="page-header">
        <h1 className="page-title">My host app</h1>
        <Link href="/">New design</Link>
      </header>
      <main className="editor">
        <Editor start={start} />
      </main>
    </div>
  );
}
