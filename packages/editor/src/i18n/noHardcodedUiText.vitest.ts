// SPDX-License-Identifier: MPL-2.0
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * UI text lives in the message catalogue (`i18n/de.ts`, `i18n/en.ts`), read through `useMessages()`
 * or `messages()`, so every host language gets its own wording. Two checks over the source (the
 * break is a single literal that no type check sees):
 *
 * 1. No German in a string literal or JSX text outside the German catalogue and search vocabulary.
 * 2. No prose in a UI position (JSX text; `title`, `aria-label`, `placeholder`, `alt`, `label`
 *    attributes) in any language: a hardcoded English string breaks a German host just as a
 *    hardcoded German one breaks an English host.
 */
const SRC = path.resolve(import.meta.dirname, '..');
const STUDIO_SRC = path.resolve(import.meta.dirname, '../../../../apps/studio/src');

/** Files where German is the point: the German catalogue, search synonyms, bundled artwork data. */
const ALLOWED_FILES = [
  /^i18n\/de\.ts$/,
  /^utils\/searchTranslations\.ts$/,
  /^utils\/illustrations\//,
  // Context handed to the AI model, not text a person reads.
  /^ai\/describeCanvasElements\.ts$/,
  // Developer notes on page keys the export drops.
  /^export\/pptx\/buildPptxModel\.ts$/,
  // Built-in format data in the original language; `formatLabel()` / `formatDescription()` read
  // the catalogue.
  /^formats\/index\.ts$/,
];
/** Stored or shared ids and file names that happen to be German words: frozen, never shown. */
const FROZEN = new Set([
  'marke',
  'vorlage',
  'bild',
  'fotos',
  'kreis',
  'application/x-ggraphic-template',
]);
/** Object keys whose array of strings is search vocabulary, not text on screen. */
const VOCABULARY_KEYS = new Set(['tags', 'keywords']);

const UMLAUT = /[äöüÄÖÜß]/;
/** German words with no umlaut that turned up in UI strings; extended as the scan finds more. */
const GERMAN_WORDS =
  /\b(sperren|entsperren|elemente|einfügen|hinzufügen|hinzufuegen|speichern|abbrechen|schlie(ss|ß)en|auswahl|seite|vorlage|ebene|farbe|bild|kopieren|entfernen|duplizieren|verschieben|zurücksetzen|punkte|aufsteigend|bogen|regenbogen|welle|notizen|zitat|untertitel|ihre|ihren|hier|eingeben|marke|erledigt|beitrag|foto|nenne|nicht|und|der|die|das|für|mit|ohne|bitte|von|auf|oder|nach|ist|zum|zur|dein|deine|deinen|fotos|aktivieren|anpassen|ausschnitt|schatten|spiegeln|datenreihe|diagramm|zeile|bezeichnung|mehr|nichts|gefunden|laden|keine|kostenlos|nutzbar|winkel|vorschau|pfadtext|kopiert|bearbeiten|generieren|beispieltext|verlaufstext|standard|titel|datum|uhrzeit|adresse|unterzeile|veranstaltung|veranstaltungsort|wochentag|fertig|zuschneiden|kreis|visitenkarte|plakat|briefbogen|zeitung|folien|wussten|sie|betonung|erste|zweite|dritte)\b/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(vitest|test)\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

function inVocabulary(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    // Developer output, not UI.
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === 'console'
    ) {
      return true;
    }
    if (
      ts.isPropertyAssignment(n) &&
      (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) &&
      VOCABULARY_KEYS.has(n.name.text)
    ) {
      return true;
    }
  }
  return false;
}

function germanStrings(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const check = (node: ts.Node, value: string) => {
    const trimmed = value.trim();
    // Ids and file name parts (`hand-pfeil-bogen`) are stored or shared: frozen.
    if (
      !trimmed ||
      FROZEN.has(trimmed) ||
      /^[a-z0-9]*(-[a-z0-9]+)+-?$|^-[a-z]+-$/i.test(trimmed) ||
      inVocabulary(node)
    ) {
      return;
    }
    if (UMLAUT.test(trimmed) || GERMAN_WORDS.test(trimmed)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      found.push(
        `${path.relative(path.dirname(SRC), file)}:${line} ${JSON.stringify(trimmed.slice(0, 70))}`
      );
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      check(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      check(node, node.text);
    } else if (ts.isJsxText(node)) check(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const UI_ATTRIBUTES = new Set([
  'title',
  'aria-label',
  'placeholder',
  'alt',
  'aria-description',
  'label',
  'actionLabel',
]);
/** Object properties whose string value a panel, menu or dialog renders. */
const UI_PROPERTIES = new Set([
  'title',
  'label',
  'tooltip',
  'description',
  'placeholder',
  'hint',
  'message',
  'ariaLabel',
  'caption',
  'heading',
  'subtitle',
]);
/** Variables named like the text they hold. */
const UI_VARIABLE =
  /^(title|label|text|message|msg|tooltip|hint|caption|heading|description|placeholder)$|(Label|Title|Message|Tooltip|Hint|Caption|Heading|Text|Description)$/;
/** Names and formats that read the same in every language. */
const LANGUAGE_NEUTRAL = new Set([
  'unsplash',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'pdf',
  'pptx',
  'powerpoint (.pptx)',
  'download',
  'alt',
  'text',
  'icon',
  'icons',
  'emoji',
  'sticker',
  'sharepic',
  'sharepics',
  'presets',
  'zoom',
  'name',
  'canvas',
  'raleway',
  'link',
  'qr',
  'ok',
]);

/**
 * A Tailwind class list: every token is a known utility shape (`text-xs`, `max-w-20`, `md:flex`),
 * not just lowercase with a hyphen, so `read-only mode` stays prose.
 */
const TAILWIND_TOKEN =
  /^(?:[a-z0-9-]+:)*-?(?:flex|grid|block|inline|hidden|contents|relative|absolute|fixed|sticky|static|truncate|italic|underline|uppercase|lowercase|capitalize|container|sr-only|(?:size|w|h|min-w|max-w|min-h|max-h|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|text|font|leading|tracking|bg|border|rounded|shadow|ring|outline|opacity|z|top|left|right|bottom|inset|grid-cols|col-span|row-span|order|basis|grow|shrink|object|overflow|cursor|select|pointer-events|transition|duration|ease|delay|animate|rotate|scale|translate-x|translate-y|items|justify|content|self|place-items|place-content|fill|stroke|aspect|line-clamp|whitespace|break)-[a-z0-9./[\]%#()_-]+)$/;
function isClassList(text: string): boolean {
  return text.split(' ').every((w) => TAILWIND_TOKEN.test(w));
}

/** Prose: two words, or one capitalised word of four letters or more, that is not a neutral name. */
function isProse(value: string): boolean {
  const text = value
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[A-Za-zÄÖÜäöüß]{3}/.test(text)) return false;
  // Markup and class lists (`text-xs max-w-20`) are code, not prose.
  if (text.startsWith('<')) return false;
  if (isClassList(text)) return false;
  if (LANGUAGE_NEUTRAL.has(text.toLowerCase())) return false;
  const words = text.split(' ').filter((w) => /[A-Za-zÄÖÜäöüß]{2}/.test(w));
  return words.length >= 2 || /^[A-ZÄÖÜ][a-zäöüß]{3,}$/.test(text);
}

function hardcodedUiText(file: string, text = readFileSync(file, 'utf8')): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const report = (node: ts.Node, value: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    found.push(
      `${path.relative(path.dirname(SRC), file)}:${line} ${JSON.stringify(value.trim().slice(0, 70))}`
    );
  };
  /** Every string a UI expression can show: both ternary branches, `||`/`??`/`+` operands. */
  const literals = (e: ts.Node): string[] => {
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
    if (ts.isTemplateExpression(e)) {
      return [
        e.head.text + e.templateSpans.map((s) => '${}' + s.literal.text).join(''),
        // `${x || `Reihe ${n}`}`: a fallback inside the placeholder is shown as well.
        ...e.templateSpans.flatMap((s) => literals(s.expression)),
      ];
    }
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) {
      return literals(e.expression);
    }
    if (ts.isConditionalExpression(e)) return [...literals(e.whenTrue), ...literals(e.whenFalse)];
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken ||
        op === ts.SyntaxKind.PlusToken ||
        op === ts.SyntaxKind.AmpersandAmpersandToken
      ) {
        return [...literals(e.left), ...literals(e.right)];
      }
    }
    return [];
  };
  const reportProse = (at: ts.Node, expr: ts.Node) => {
    for (const value of literals(expr)) {
      if (isProse(value) && !DEVELOPER_ERRORS.some((re) => re.test(value))) report(at, value);
    }
  };
  const nameOf = (n: ts.PropertyName): string | null =>
    ts.isIdentifier(n) || ts.isStringLiteral(n) ? n.text : null;
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && isProse(node.text)) report(node, node.text);
    if (ts.isJsxAttribute(node) && UI_ATTRIBUTES.has(node.name.getText()) && node.initializer) {
      const init = node.initializer;
      reportProse(init, ts.isJsxExpression(init) && init.expression ? init.expression : init);
    }
    // `title: 'Add circle'`: an object property that a panel or menu renders.
    if (ts.isPropertyAssignment(node)) {
      const key = nameOf(node.name);
      if (key !== null && UI_PROPERTIES.has(key)) reportProse(node.initializer, node.initializer);
    }
    // `const label = open ? 'Hide' : 'Show'`.
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      UI_VARIABLE.test(node.name.text) &&
      node.initializer
    ) {
      reportProse(node.initializer, node.initializer);
    }
    // `throw new Error('...')`: the message reaches a person through an error banner or toast.
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^(Error|TypeError|RangeError)$/.test(node.expression.text) &&
      node.arguments?.[0]
    ) {
      reportProse(node, node.arguments[0]);
    }
    // `setError('...')`, `userFacingError('...')`: the text ends up on screen.
    if (
      ts.isCallExpression(node) &&
      node.arguments[0] &&
      ts.isIdentifier(node.expression) &&
      /^(setError|userFacingError)$/.test(node.expression.text)
    ) {
      reportProse(node, node.arguments[0]);
    }
    // `toast('...')`, `toast.error('...')`.
    if (ts.isCallExpression(node) && node.arguments[0]) {
      const callee = node.expression;
      const base = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
      if (ts.isIdentifier(base) && /^toast$/i.test(base.text)) {
        reportProse(node, node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Files exempt from the prose check. The English catalogue is where English text belongs; testing
 * fixtures are sample templates, not editor UI.
 */
const PROSE_EXEMPT_FILES = [/^i18n\/en\.ts$/, /^testing\//];
/**
 * `new Error(...)` messages that are programmer errors (an invariant, a misused hook, an
 * exhaustiveness check) or are caught and swallowed before any person sees them. Everything else
 * in an `Error` is assumed to reach an error banner (`err.message` is shown in the tool panels).
 */
const DEVELOPER_ERRORS = [
  /^bindCanvasStoreToYMap: /,
  /^GenericCanvasElement: unhandled element type/,
  // Thrown by `loadCanvasConfig` for an id nobody registered; StandaloneCanvas checks the registry
  // first and says it in the catalogue.
  /^loadCanvasConfig: /,
  // Thrown by `usePageManager.getConfigForPage` for an id the registry does not know. The page
  // picker only offers registered ids and stored pages carry registered ones, so no person
  // reaches it; a host that registers late gets the console error, not a banner.
  /^Invalid config type: /,
  /^useUserUploads must be used within /,
  /^Template ".*" is already registered/,
  /^".*" is a core element kind/,
  /^Unexpected value: /,
  // smartcrop and the stock-photo / Iconify loaders catch these and fall back silently.
  /^smartcrop: /,
  /^no catalogue$/,
  /^unsafe svg$/,
];

const isEditorUiFile = (rel: string) => !ALLOWED_FILES.some((re) => re.test(rel));
const relOf = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

describe('UI text lives in the message catalogue', () => {
  it('has no German in a string literal or JSX text outside the German catalogue', () => {
    const stray = sourceFiles(SRC).flatMap((file) =>
      isEditorUiFile(relOf(file)) ? germanStrings(file) : []
    );
    expect(stray).toEqual([]);
  });

  it('has no prose hardcoded in JSX text or UI attributes, in any language', () => {
    const stray = sourceFiles(SRC).flatMap((file) =>
      isEditorUiFile(relOf(file)) && !PROSE_EXEMPT_FILES.some((re) => re.test(relOf(file)))
        ? hardcodedUiText(file)
        : []
    );
    expect(stray).toEqual([]);
  });

  it('has no German in the Studio app either (the Studio is English by design)', () => {
    expect(sourceFiles(STUDIO_SRC).flatMap(germanStrings)).toEqual([]);
  });
});

describe('the prose guard catches every way of hardcoding English UI text', () => {
  const found = (code: string) => hardcodedUiText('probe.tsx', code);

  it.each([
    ['JSX text', 'const a = <p>Delete this page</p>;'],
    ['an attribute', "const a = <button title='Add circle' />;"],
    ['a ternary in an attribute', "const a = <button title={on ? 'Hide layer' : 'Show layer'} />;"],
    ['a fallback in an attribute', "const a = <button aria-label={name || 'Unnamed layer'} />;"],
    ['an object property', "const item = { title: 'Add circle', run };"],
    ['a variable named like text', "const label = open ? 'Hide panel' : 'Show panel';"],
    ['an error message', "throw new Error('Could not save the design');"],
    ['a template error message', 'throw new Error(`Could not save ${name}`);'],
    ['a setError text', "setError('Could not load the canvas');"],
    ['a template setError text', 'setError(`Unknown canvas type: ${id}`);'],
    ['a userFacingError text', "throw userFacingError('Please pick a smaller photo');"],
    ['hyphenated English that looks like a class list', "const a = <p title='read-only mode' />;"],
    ['a toast', "toast('Design saved to your project');"],
    ['a toast variant', "toast.error('Upload failed, please retry');"],
  ])('flags %s', (_name, code) => {
    expect(found(code)).not.toEqual([]);
  });

  it.each([
    ['catalogue text', 'const a = <button title={t.common.close} />;'],
    ['a single neutral word', "const a = <button title='PDF' />;"],
    ['a class list', "const size = { label: 'text-xs max-w-20' };"],
    ['markup', 'const svg = `<svg xmlns="x"></svg>`;'],
    ['a developer invariant', "throw new Error('Unexpected value: x');"],
    ['an id-like property', "const a = { title: 'rect', label: 'x' };"],
  ])('lets %s through', (_name, code) => {
    expect(found(code)).toEqual([]);
  });
});
