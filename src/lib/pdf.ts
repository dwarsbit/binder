import type * as PdfJs from "pdfjs-dist";

/** pdf.js, loaded the first time a PDF is read, with its worker. As Polemic reads PDFs. */
let loading: Promise<typeof PdfJs> | null = null;
export function pdfjs(): Promise<typeof PdfJs> {
  loading ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return loading;
}

export type PdfDocument = PdfJs.PDFDocumentProxy;

/** Opens a PDF from its bytes. pdf.js takes the bytes over, so it gets a copy. */
export async function openPdf(bytes: ArrayBuffer): Promise<PdfDocument> {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
}

/** The text of one page, with a line break where a line ends. */
export async function pageText(doc: PdfDocument, page: number): Promise<string> {
  const content = await (await doc.getPage(page)).getTextContent();
  let text = "";
  for (const item of content.items) {
    if (!("str" in item)) continue;
    text += item.str + (item.hasEOL ? "\n" : "");
  }
  return text;
}

/** The text of every page. */
export async function pdfPages(bytes: ArrayBuffer): Promise<string[]> {
  const doc = await openPdf(bytes);
  try {
    const pages: string[] = [];
    for (let page = 1; page <= doc.numPages; page++)
      pages.push(await pageText(doc, page));
    return pages;
  } finally {
    void doc.loadingTask.destroy();
  }
}
