// SPDX-License-Identifier: MPL-2.0
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The Studio speaks English. German belongs in `i18n/de.ts` and in search vocabulary;
 * a German word in a string literal or JSX text anywhere else reaches the English UI.
 * Reads the source (the break is a single literal that no type check sees) and lists
 * every string that holds German, with file and line.
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
];
/** Stored or shared ids and file names that happen to be German words: frozen, never shown. */
const FROZEN = new Set([
  'marke',
  'vorlage',
  'bild',
  'fotos',
  'kreis',
  'seite-',
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
    // Ids and file name parts (`hand-pfeil-bogen`, `-seite-`) are stored or shared: frozen.
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

describe('English UI', () => {
  it('has no German in a string literal or JSX text outside the German catalogue', () => {
    const stray = sourceFiles(SRC).flatMap((file) => {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      return ALLOWED_FILES.some((re) => re.test(rel)) ? [] : germanStrings(file);
    });
    expect(stray).toEqual([]);
  });

  it('has none in the Studio app either', () => {
    expect(sourceFiles(STUDIO_SRC).flatMap(germanStrings)).toEqual([]);
  });
});
