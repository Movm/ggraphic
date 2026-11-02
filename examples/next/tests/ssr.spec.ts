// SPDX-License-Identifier: MIT
import { expect, test } from '@playwright/test';

/** Next.js's error document, and React's marker for a boundary that failed on the server. */
function expectNoServerError(html: string) {
  expect(html).not.toContain('__next_error__');
  expect(html).not.toContain('<!--$!-->');
}

test('the server renders the start page from the formats and the parsed templates', async ({
  request,
}) => {
  const start = await request.get('/');
  expect(start.status()).toBe(200);
  const html = await start.text();
  expect(html).toContain('My host app');
  // The page, a server component, read the formats through `@ggraphic/editor/host` (#136).
  for (const id of ['post-portrait', 'profile-square', 'slide-16-9']) {
    expect(html).toContain(`href="/?format=${id}"`);
  }
  expectNoServerError(html);

  // With a format, the templates that fit it, parsed on the server through `@ggraphic/editor/page`.
  const choices = await (await request.get('/?format=slide-16-9')).text();
  expect(choices).toContain('Headline + text');
  expect(choices).toContain('href="/edit?format=slide-16-9&amp;template=ggraphic-blank"');
  expect(choices).toContain('href="/edit?format=slide-16-9&amp;template=studio-quote"');
  expectNoServerError(choices);
});

test('the server renders the editor page without the editor and without an error', async ({
  request,
}) => {
  const response = await request.get('/edit?format=post-portrait&template=studio-headline');
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('New design');
  // GgraphicEditor renders nothing on the server; its root appears only in the browser.
  expect(html).not.toContain('data-ggraphic');
  expectNoServerError(html);

  // A format or a template the start page does not offer goes back to it.
  const unknown = await request.get('/edit?format=post-portrait&template=nope', {
    maxRedirects: 0,
  });
  expect(unknown.status()).toBe(307);
  expect(unknown.headers()['location']).toBe('/');
});
