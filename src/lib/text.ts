import { extensionOf } from "./binder";
import { pdfPages } from "./pdf";
import type { BinderStore } from "./store";

/**
 * The text of the binder's files, by page, for search: worked out once
 * per file and kept in `.binder/text.json` with the file's checksum.
 */

export const TEXT_CACHE = ".binder/text.json";
const CACHE_VERSION = 1;

/** Files Binder can read the text of. */
export const isReadable = (path: string) =>
  [".pdf", ".html", ".htm"].includes(extensionOf(path));
export const isPdf = (path: string) => extensionOf(path) === ".pdf";

export interface FileText {
  /** The file's checksum when its text was read; empty when there is none. */
  hash: string;
  /** The text, by page; a web page is one page. */
  pages: string[];
}
export type TextIndex = Record<string, FileText>;

/** Words as search compares them: one space between, and the same letters for “” and ‘’. */
export const normalize = (text: string) =>
  text
    .replace(/[­]/g, "")
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[‐-—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** The text of a kept web page. */
export function htmlPages(source: string): string[] {
  const doc = new DOMParser().parseFromString(source, "text/html");
  for (const element of doc.querySelectorAll("script, style, head")) element.remove();
  // Blocks end in a line break, as on screen.
  for (const element of doc.querySelectorAll(
    "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, tr, dt, dd, figcaption, br",
  ))
    element.append("\n");
  return [doc.body.textContent ?? ""];
}

/** The text of one file, by page. */
export async function readText(store: BinderStore, path: string): Promise<string[]> {
  const bytes = await store.readBytes(path);
  if (!bytes) return [];
  if (isPdf(path)) return pdfPages(bytes);
  return htmlPages(new TextDecoder().decode(bytes));
}

async function readCache(store: BinderStore): Promise<TextIndex> {
  const bytes = await store.readBytes(TEXT_CACHE);
  if (!bytes) return {};
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as {
      version?: number;
      files?: TextIndex;
    };
    return value.version === CACHE_VERSION && value.files ? value.files : {};
  } catch {
    return {};
  }
}

/**
 * Brings the index up to date with the binder's files: reads the text of
 * new and changed files and drops the gone ones. Calls `progress` as it
 * goes. Writes the cache when the store keeps one.
 */
export async function updateIndex(
  store: BinderStore,
  files: string[],
  current: TextIndex | null,
  progress: (index: TextIndex) => void,
  cancelled: () => boolean,
): Promise<TextIndex> {
  const hashes = store.fileHashes ? await store.fileHashes().catch(() => null) : null;
  const known = current ?? (hashes ? await readCache(store) : {});
  const next: TextIndex = {};
  const todo: string[] = [];
  for (const path of files.filter(isReadable)) {
    const hash = hashes?.[path] ?? "";
    const had = known[path];
    if (had && (had.hash === hash || !hashes)) next[path] = had;
    else todo.push(path);
  }
  let changed = todo.length > 0 || Object.keys(known).some((path) => !(path in next));
  progress({ ...next });
  for (const path of todo) {
    if (cancelled()) return next;
    try {
      next[path] = { hash: hashes?.[path] ?? "", pages: await readText(store, path) };
    } catch {
      // A file pdf.js can't read has no text to search.
      next[path] = { hash: hashes?.[path] ?? "", pages: [] };
    }
    changed = true;
    progress({ ...next });
  }
  if (changed && hashes && !cancelled()) {
    const json = JSON.stringify({ version: CACHE_VERSION, files: next });
    await store
      .writeFile(TEXT_CACHE, new Blob([json], { type: "application/json" }))
      .catch(() => {});
  }
  return next;
}

/** Where `query` is in a text: the starts of its matches, in normalized text. */
export function matchesIn(text: string, query: string): number[] {
  const needle = normalize(query).toLowerCase();
  if (!needle) return [];
  const hay = normalize(text).toLowerCase();
  const found: number[] = [];
  for (
    let at = hay.indexOf(needle);
    at >= 0;
    at = hay.indexOf(needle, at + needle.length)
  )
    found.push(at);
  return found;
}
