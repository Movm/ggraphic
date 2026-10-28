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
  'application/x-ggraphic-vorlage',
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

/** Prose: two words, or one capitalised word of four letters or more, that is not a neutral name. */
function isProse(value: string): boolean {
  const text = value
    .replace(/\$\{[^}]*\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[A-Za-zÄÖÜäöüß]{3}/.test(text)) return false;
  if (LANGUAGE_NEUTRAL.has(text.toLowerCase())) return false;
  const words = text.split(' ').filter((w) => /[A-Za-zÄÖÜäöüß]{2}/.test(w));
  return words.length >= 2 || /^[A-ZÄÖÜ][a-zäöüß]{3,}$/.test(text);
}

function hardcodedUiText(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const found: string[] = [];
  const report = (node: ts.Node, value: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    found.push(
      `${path.relative(path.dirname(SRC), file)}:${line} ${JSON.stringify(value.trim().slice(0, 70))}`
    );
  };
  const literalText = (e: ts.Node): string | null => {
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    if (ts.isTemplateExpression(e)) {
      return e.head.text + e.templateSpans.map((s) => '${}' + s.literal.text).join('');
    }
    return null;
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && isProse(node.text)) report(node, node.text);
    if (ts.isJsxAttribute(node) && UI_ATTRIBUTES.has(node.name.getText()) && node.initializer) {
      const init = node.initializer;
      const value =
        ts.isJsxExpression(init) && init.expression
          ? literalText(init.expression)
          : literalText(init);
      if (value !== null && isProse(value)) report(init, value);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

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
      isEditorUiFile(relOf(file)) ? hardcodedUiText(file) : []
    );
    expect(stray).toEqual([]);
  });

  it('has no German in the Studio app either (the Studio is English by design)', () => {
    expect(sourceFiles(STUDIO_SRC).flatMap(germanStrings)).toEqual([]);
  });
});
