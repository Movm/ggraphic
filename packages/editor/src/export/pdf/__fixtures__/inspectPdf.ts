// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Reads a PDF back for the writer tests: the objects pdf-lib finds in it, the decoded content of
 * a page, and (through pdf.js) its text and its pixels.
 */
import { createCanvas, type Canvas } from '@napi-rs/canvas';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFObject,
} from 'pdf-lib';

type Dict = PDFDict;

export interface PdfObject {
  ref: PDFRef;
  dict: Dict;
  stream: PDFRawStream | null;
}

export interface InspectedPdf {
  doc: PDFDocument;
  objects: PdfObject[];
  /** The decoded content stream of a page. */
  content(pageIndex: number): string;
  /** Objects whose `/Type` (or, for XObjects, `/Subtype`) is `name`. */
  ofType(name: string): PdfObject[];
  /** The value of a name entry without its slash, or null. */
  name(dict: Dict, key: string): string | null;
  number(dict: Dict, key: string): number | null;
  numbers(dict: Dict, key: string): number[] | null;
  /** The images a page can show: image XObjects that are not the soft mask of another. */
  pictures(): PdfObject[];
  /** The decoded bytes of the stream a key points at. */
  bytesAt(dict: Dict, key: string): Uint8Array | null;
  /** The dictionary (or the dictionary of the stream) a key points at, references followed. */
  dictAt(dict: Dict, key: string): Dict | null;
  /** The entries of an array a key points at, references followed. */
  arrayAt(dict: Dict, key: string): PDFObject[] | null;
}

export async function inspectPdf(bytes: Uint8Array): Promise<InspectedPdf> {
  const doc = await PDFDocument.load(bytes);
  const objects: PdfObject[] = [];
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict) objects.push({ ref, dict: object, stream: null });
    else if (object instanceof PDFRawStream)
      objects.push({ ref, dict: object.dict, stream: object });
  }
  const name = (dict: Dict, key: string): string | null => {
    const value = dict.get(PDFName.of(key));
    return value instanceof PDFName ? value.decodeText() : null;
  };
  const numberOf = (value: PDFObject | undefined) =>
    value instanceof PDFNumber ? value.asNumber() : null;
  const follow = (value: PDFObject | undefined) => (value ? doc.context.lookup(value) : undefined);
  return {
    doc,
    objects,
    pictures() {
      const masks = new Set<string>();
      for (const { dict } of objects) {
        const mask = dict.get(PDFName.of('SMask'));
        if (mask instanceof PDFRef) masks.add(mask.tag);
      }
      return objects.filter((o) => name(o.dict, 'Subtype') === 'Image' && !masks.has(o.ref.tag));
    },
    bytesAt(dict, key) {
      const value = follow(dict.get(PDFName.of(key)));
      return value instanceof PDFRawStream ? decodePDFRawStream(value).decode() : null;
    },
    dictAt(dict, key) {
      const value = follow(dict.get(PDFName.of(key)));
      if (value instanceof PDFDict) return value;
      return value instanceof PDFRawStream ? value.dict : null;
    },
    arrayAt(dict, key) {
      const value = follow(dict.get(PDFName.of(key)));
      return value instanceof PDFArray ? value.asArray().map((entry) => follow(entry)!) : null;
    },
    content(pageIndex) {
      const contents = doc.getPage(pageIndex).node.Contents();
      const streams =
        contents instanceof PDFArray
          ? contents.asArray().map((ref) => doc.context.lookup(ref))
          : [contents];
      return streams
        .map((stream) =>
          stream instanceof PDFRawStream
            ? new TextDecoder().decode(decodePDFRawStream(stream).decode())
            : ''
        )
        .join('\n');
    },
    ofType: (type) =>
      objects.filter((o) => name(o.dict, 'Type') === type || name(o.dict, 'Subtype') === type),
    name,
    number: (dict, key) => numberOf(dict.get(PDFName.of(key))),
    numbers(dict, key) {
      const value = dict.get(PDFName.of(key));
      return value instanceof PDFArray
        ? value.asArray().map((entry) => numberOf(entry) ?? Number.NaN)
        : null;
    },
  };
}

/** The decoded bytes of a stream object as text. */
export const streamText = (object: PdfObject): string =>
  object.stream ? new TextDecoder().decode(decodePDFRawStream(object.stream).decode()) : '';

// ---------------------------------------------------------------------------------------------
// pdf.js

async function openWithPdfjs(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // pdf.js takes the buffer over; give it a copy.
  return pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
}

/** The strings pdf.js finds on a page, in content order. */
export async function extractText(bytes: Uint8Array, pageIndex = 0): Promise<string[]> {
  const pdf = await openWithPdfjs(bytes);
  const page = await pdf.getPage(pageIndex + 1);
  const { items } = await page.getTextContent();
  return items.flatMap((item) => ('str' in item ? [item.str] : []));
}

/** The page drawn by pdf.js on a napi canvas, one canvas pixel per pt times `scale`. */
export async function renderPage(bytes: Uint8Array, pageIndex = 0, scale = 1): Promise<Canvas> {
  const pdf = await openWithPdfjs(bytes);
  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx as never, viewport, canvas: canvas as never }).promise;
  return canvas;
}
