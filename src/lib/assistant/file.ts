import { readPage, writePage } from "@cursive/editor/lib/page-file";
import {
  formatProperties,
  parseProperties,
  type Property,
} from "@cursive/editor/lib/properties";
import { baseName } from "@cursive/editor/lib/paths";
import { KINDS, type Kind } from "../binder";
import { highlightLine, readHighlightLines, type Highlight } from "../highlights";

/**
 * What the assistant wrote about an item, kept next to it in
 * `<item>.assistant.md` until you take it over. `docs/format.md`
 * describes the file.
 */

export const assistantPathOf = (itemPath: string) =>
  itemPath.replace(/\.md$/i, "") + ".assistant.md";
export const isAssistantPath = (path: string) => /\.assistant\.md$/i.test(path);

/** What the assistant proposes for an item's properties. */
export interface Proposal {
  kind?: Kind;
  title?: string;
  authors?: string[];
  year?: string;
  tags?: string[];
}

export type PartId = "summary" | "read-closely" | "outline" | "highlights";

export const PARTS: Array<{ id: PartId; heading: string }> = [
  { id: "summary", heading: "Summary" },
  { id: "read-closely", heading: "Read closely" },
  { id: "outline", heading: "Outline" },
  { id: "highlights", heading: "Proposed highlights" },
];

export interface Part {
  /** Null for a part Binder doesn't know, kept as written. */
  id: PartId | null;
  heading: string;
  markdown: string;
}

export interface AssistantNote {
  model: string;
  /** Where the model ran: a provider's name, or "this computer". */
  provider: string;
  written: string;
  proposal: Proposal;
  parts: Part[];
}

const PROPOSED = ["kind", "title", "authors", "year", "tags"] as const;

const valueOf = (properties: Property[], key: string): string | string[] | null => {
  const found = properties.find((p) => p.kind !== "raw" && p.key === key);
  if (!found || found.kind === "raw") return null;
  if (found.kind === "list") return found.value;
  return String(found.value).trim();
};
const textOf = (properties: Property[], key: string) => {
  const value = valueOf(properties, key);
  return Array.isArray(value) ? value.join(", ") : (value ?? "");
};
const listOf = (properties: Property[], key: string) => {
  const value = valueOf(properties, key);
  if (value === null) return undefined;
  return Array.isArray(value) ? value : value ? [value] : [];
};

/** Reads the file. */
export function readAssistant(source: string): AssistantNote {
  const page = readPage(source);
  const properties = parseProperties(page.properties);
  const proposal: Proposal = {};
  const kind = textOf(properties, "proposed-kind").toLowerCase();
  if (KINDS.some((entry) => entry.id === kind)) proposal.kind = kind as Kind;
  const title = textOf(properties, "proposed-title");
  if (title) proposal.title = title;
  const authors = listOf(properties, "proposed-authors");
  if (authors?.length) proposal.authors = authors;
  const year = textOf(properties, "proposed-year");
  if (year) proposal.year = year;
  const tags = listOf(properties, "proposed-tags");
  if (tags?.length) proposal.tags = tags;

  const parts: Part[] = [];
  let part: Part | null = null;
  const loose: string[] = [];
  for (const line of page.markdown.split("\n")) {
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      if (part) parts.push(part);
      const name = heading[1].trim();
      const known = PARTS.find((p) => p.heading.toLowerCase() === name.toLowerCase());
      part = { id: known?.id ?? null, heading: known?.heading ?? name, markdown: "" };
      continue;
    }
    if (part) part.markdown += `${line}\n`;
    else loose.push(line);
  }
  if (part) parts.push(part);
  for (const p of parts) p.markdown = p.markdown.trim();
  // Text before the first heading is kept as a part of its own.
  if (loose.join("").trim())
    parts.unshift({ id: null, heading: "", markdown: loose.join("\n").trim() });

  return {
    model: textOf(properties, "model"),
    provider: textOf(properties, "provider"),
    written: textOf(properties, "written"),
    proposal,
    parts: parts.filter((p) => p.markdown),
  };
}

/** The file, keeping the lines of the front matter Binder doesn't write. */
export function writeAssistant(
  itemPath: string,
  note: AssistantNote,
  previous?: string,
): string {
  const kept = previous
    ? parseProperties(readPage(previous).properties).filter(
        (p) =>
          p.kind === "raw" ||
          !(
            ["assistant-of", "model", "provider", "written"].includes(p.key) ||
            p.key.startsWith("proposed-")
          ),
      )
    : [];
  const text = (key: string, value: string | undefined): Property[] =>
    value ? [{ kind: "text", key, value }] : [];
  const list = (key: string, value: string[] | undefined): Property[] =>
    value?.length ? [{ kind: "list", key, value }] : [];
  const { proposal } = note;
  const properties: Property[] = [
    ...text("assistant-of", baseName(itemPath)),
    ...text("model", note.model),
    ...text("provider", note.provider),
    ...(note.written
      ? [{ kind: "date" as const, key: "written", value: note.written }]
      : []),
    ...text("proposed-kind", proposal.kind),
    ...text("proposed-title", proposal.title),
    ...list("proposed-authors", proposal.authors),
    ...(proposal.year && /^\d{1,4}$/.test(proposal.year)
      ? [{ kind: "number" as const, key: "proposed-year", value: proposal.year }]
      : text("proposed-year", proposal.year)),
    ...list("proposed-tags", proposal.tags),
    ...kept,
  ];
  const body = note.parts
    .filter((part) => part.markdown.trim())
    .map((part) =>
      part.heading
        ? `## ${part.heading}\n\n${part.markdown.trim()}`
        : part.markdown.trim(),
    )
    .join("\n\n");
  return writePage({
    title: "",
    properties: formatProperties(properties),
    markdown: body ? `${body}\n` : "",
  });
}

/** Whether nothing is left for you to accept or take over. */
export const isSpent = (note: AssistantNote) =>
  !note.parts.some((part) => part.markdown.trim()) && !hasProposal(note.proposal);

export const hasProposal = (proposal: Proposal) =>
  PROPOSED.some((key) => {
    const value = proposal[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

export const partOf = (note: AssistantNote, id: PartId) =>
  note.parts.find((part) => part.id === id) ?? null;

/** The highlights the assistant proposes. */
export const proposedHighlights = (note: AssistantNote): Highlight[] =>
  readHighlightLines(partOf(note, "highlights")?.markdown ?? "").highlights;

/** The note with a part set, or taken out when `markdown` is empty. Parts keep Binder's order. */
export function withPart(
  note: AssistantNote,
  id: PartId,
  markdown: string,
): AssistantNote {
  const heading = PARTS.find((p) => p.id === id)!.heading;
  const others = note.parts.filter((part) => part.id !== id);
  if (!markdown.trim()) return { ...note, parts: others };
  const part: Part = { id, heading, markdown: markdown.trim() };
  const order = (p: Part) =>
    p.id ? PARTS.findIndex((known) => known.id === p.id) : 99;
  return {
    ...note,
    parts: [...others, part].sort((a, b) => order(a) - order(b)),
  };
}

/** The note with proposed highlights, as their lines. */
export const withProposedHighlights = (note: AssistantNote, highlights: Highlight[]) =>
  withPart(note, "highlights", highlights.map(highlightLine).join("\n"));

/** The proposal without the values the item has already. */
export function newIn(
  proposal: Proposal,
  item: { kind: Kind; title: string; authors: string[]; year: string; tags: string[] },
): Proposal {
  const same = (a: string[] | undefined, b: string[]) =>
    !a || (a.length === b.length && a.every((value, i) => value === b[i]));
  const next: Proposal = {};
  if (proposal.kind && proposal.kind !== item.kind) next.kind = proposal.kind;
  if (proposal.title && proposal.title.trim() !== item.title.trim())
    next.title = proposal.title;
  if (!same(proposal.authors, item.authors)) next.authors = proposal.authors;
  if (proposal.year && proposal.year !== item.year) next.year = proposal.year;
  const tags = proposal.tags?.filter((tag) => !item.tags.includes(tag));
  if (tags?.length) next.tags = tags;
  return next;
}
