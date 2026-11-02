// SPDX-License-Identifier: MIT
// The start page, a server component: pick a format, then a blank page or a template. Every choice
// is a link, so the page works before the browser has loaded any JavaScript; the editor loads only
// on /edit.
import {
  BLANK_PAGE_ID,
  canvasFormats,
  type CanvasFormat,
  formatDescription,
  formatLabel,
} from '@ggraphic/editor/host';
import Link from 'next/link';

import { aspectOf, formatById, templatesFor } from './catalog';
import { ContinueLink } from './ContinueLink';

/** The format's shape; the SVG scales it into the card's frame. */
function Shape({ width, height }: { width: number; height: number }) {
  return (
    <svg className="card-shape" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <rect width={width} height={height} rx={Math.min(width, height) * 0.04} />
    </svg>
  );
}

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { format: formatId } = await searchParams;
  const format = formatById(typeof formatId === 'string' ? formatId : undefined);

  return (
    <>
      <header className="page-header">
        <h1 className="page-title">My host app</h1>
        <ContinueLink />
      </header>
      <main className="start">
        <section aria-labelledby="formats-heading">
          <h2 id="formats-heading">Choose a format</h2>
          <ul className="cards">
            {canvasFormats().map((f) => (
              <li key={f.id}>
                <Link
                  className="card"
                  href={{ pathname: '/', query: { format: f.id } }}
                  scroll={false}
                  aria-current={f.id === format?.id ? 'true' : undefined}
                >
                  <Shape width={f.width} height={f.height} />
                  <span className="card-title">{formatLabel(f)}</span>
                  <span className="card-meta">{formatDescription(f)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {format ? <StartChoices format={format} /> : null}
      </main>
    </>
  );
}

function StartChoices({ format }: { format: CanvasFormat }) {
  const templates = templatesFor(format);
  const edit = (configId: string) => ({
    pathname: '/edit',
    query: { format: format.id, template: configId },
  });
  return (
    <section aria-labelledby="start-heading">
      <h2 id="start-heading">Start blank or from a template</h2>
      <ul className="cards">
        <li>
          <Link className="card" href={edit(BLANK_PAGE_ID)}>
            <Shape width={format.width} height={format.height} />
            <span className="card-title">Blank</span>
            <span className="card-meta">An empty page</span>
          </Link>
        </li>
        {templates.map((template) => (
          <li key={template.id}>
            <Link className="card card--template" href={edit(template.id)}>
              <Shape width={format.width} height={format.height} />
              <span className="card-title">{template.title}</span>
              <span className="card-meta">{template.description}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="note">
        {templates.length} templates for {aspectOf(format)}, read from <code>templates.json</code>{' '}
        on the server.
      </p>
    </section>
  );
}
