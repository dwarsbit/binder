import { readPage, writePage } from "@cursive/editor/lib/page-file";
import { formatProperties, parseProperties } from "@cursive/editor/lib/properties";
import { relativeHref } from "@cursive/editor/lib/links";
import { baseName, parentOf } from "@cursive/editor/lib/paths";

/**
 * The highlights in a source, kept next to its item in
 * `<item>.highlights.md`. `docs/format.md` describes the file.
 */

export type Category = "claim" | "definition" | "method" | "finding" | "quote";

export const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: "claim", label: "Claim" },
  { id: "definition", label: "Definition" },
  { id: "method", label: "Method" },
  { id: "finding", label: "Finding" },
  { id: "quote", label: "Quote" },
];

export const categoryLabel = (category: Category) =>
  CATEGORIES.find((entry) => entry.id === category)?.label ?? "Quote";

export interface Highlight {
  id: string;
  category: Category;
  /** The page in a PDF, from 1; null on a web page. */
  page: number | null;
  /** The highlighted text, on one line. */
  text: string;
}

/** The highlights file next to an item, and whether a path is one. */
export const highlightsPathOf = (itemPath: string) =>
  itemPath.replace(/\.md$/i, "") + ".highlights.md";
export const isHighlightsPath = (path: string) => /\.highlights\.md$/i.test(path);
/** The item whose highlights a highlights file holds. */
export const itemPathOfHighlights = (path: string) =>
  path.replace(/\.highlights\.md$/i, ".md");

const LINE = /^[-*] \*\*([A-Za-z]+)\*\*(?: · p\. (\d+))? · “(.*)” \^([A-Za-z0-9]+)\s*$/;

/** One line of text: what a highlight keeps of a selection. */
export const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** The highlights a file holds, and the lines it holds besides them. */
export function readHighlights(source: string | undefined): {
  highlights: Highlight[];
  other: string[];
} {
  if (!source) return { highlights: [], other: [] };
  return readHighlightLines(readPage(source).markdown);
}

/** The highlight lines of a list in Markdown, and its other lines. */
export function readHighlightLines(markdown: string): {
  highlights: Highlight[];
  other: string[];
} {
  const highlights: Highlight[] = [];
  const other: string[] = [];
  for (const line of markdown.split("\n")) {
    const found = LINE.exec(line);
    const category = found?.[1].toLowerCase() as Category | undefined;
    if (found && category && CATEGORIES.some((entry) => entry.id === category)) {
      highlights.push({
        id: found[4],
        category,
        page: found[2] ? Number(found[2]) : null,
        text: found[3],
      });
    } else if (line.trim()) {
      other.push(line);
    }
  }
  return { highlights, other };
}

/** A highlight as a line of its file. */
export const highlightLine = (h: Highlight) =>
  `- **${categoryLabel(h.category)}**${h.page ? ` · p. ${h.page}` : ""} · “${oneLine(h.text)}” ^${h.id}`;

/** The highlights file for an item, keeping the lines Binder doesn't read. */
export function writeHighlights(
  itemPath: string,
  highlights: Highlight[],
  previous?: string,
): string {
  const before = previous ? readPage(previous) : null;
  const properties = parseProperties(before?.properties ?? "").filter(
    (p) => p.kind === "raw" || p.key !== "highlights-of",
  );
  const other = readHighlights(previous).other;
  const lines = highlights.map(highlightLine);
  const body = [...lines, ...other];
  return writePage({
    title: "",
    properties: formatProperties([
      { kind: "text", key: "highlights-of", value: baseName(itemPath) },
      ...properties,
    ]),
    markdown: body.length ? `${body.join("\n")}\n` : "",
  });
}

/** A new id, not yet in `taken`. */
export function newHighlightId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    const id = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
    if (!used.has(id)) return id;
  }
}

/** Where a link to a place in a source leads: the file, its page and its highlight. */
export interface Place {
  file: string;
  page: number | null;
  highlight: string | null;
  /** The words of a passage, from a link the assistant wrote. */
  text?: string | null;
}

/** `text=` in a link: spaces as %20, as other apps read them. */
const encodeText = (text: string) => encodeURIComponent(text).replace(/'/g, "%27");

/** A path in a Markdown link: parentheses escaped, so a name like "Notes (draft)" keeps the link whole. */
const linkPath = (href: string) => href.replace(/\(/g, "%28").replace(/\)/g, "%29");

/** A link from a page in `fromDir` to a place in a source file. */
export function placeHref(fromDir: string, place: Place): string {
  const params = [
    place.page ? `page=${place.page}` : "",
    place.highlight ? `highlight=${place.highlight}` : "",
    place.text ? `text=${encodeText(place.text)}` : "",
  ].filter(Boolean);
  return (
    linkPath(relativeHref(fromDir, place.file)) +
    (params.length ? `#${params.join("&")}` : "")
  );
}

/** A path in the binder from a relative link in a page at `fromDir`; null when it leads out. */
export function resolveHref(fromDir: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/|^#/i.test(href)) return null;
  const parts = fromDir ? fromDir.split("/") : [];
  for (const raw of href.split("/")) {
    let part: string;
    try {
      part = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.length ? parts.join("/") : null;
}

/** The place a link in a page at `fromDir` leads to, when it leads into a file of the binder. */
export function placeOfHref(fromDir: string, href: string): Place | null {
  const hash = href.indexOf("#");
  const file = resolveHref(fromDir, hash < 0 ? href : href.slice(0, hash));
  if (!file || /\.md$/i.test(file)) return null;
  const params = new URLSearchParams(hash < 0 ? "" : href.slice(hash + 1));
  const page = Number(params.get("page"));
  return {
    file,
    page: Number.isInteger(page) && page > 0 ? page : null,
    highlight: params.get("highlight"),
    text: params.get("text"),
  };
}

/**
 * The pages with their links to `from` pointed at `to`, a file that
 * moved: only the pages that change.
 */
export function retargetFileLinks(
  pages: Record<string, string>,
  from: string,
  to: string,
): Array<[path: string, source: string]> {
  const writes: Array<[string, string]> = [];
  for (const [path, source] of Object.entries(pages)) {
    const name = baseName(from);
    if (
      !source.includes(encodeURIComponent(name)) &&
      !source.includes(linkPath(encodeURIComponent(name))) &&
      !source.includes(name)
    )
      continue;
    const dir = parentOf(path);
    const next = source.replace(/\]\(([^()\s]+)\)/g, (whole, href: string) => {
      const hash = href.indexOf("#");
      const target = resolveHref(dir, hash < 0 ? href : href.slice(0, hash));
      if (target !== from) return whole;
      return `](${linkPath(relativeHref(dir, to))}${hash < 0 ? "" : href.slice(hash)})`;
    });
    if (next !== source) writes.push([path, next]);
  }
  return writes;
}
