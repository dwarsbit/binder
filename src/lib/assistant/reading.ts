import { KINDS, type Item, type Kind } from "../binder";
import {
  CATEGORIES,
  newHighlightId,
  type Category,
  type Highlight,
} from "../highlights";
import { normalize } from "../text";
import {
  newIn,
  withPart,
  withProposedHighlights,
  type AssistantNote,
  type Proposal,
} from "./file";
import {
  findQuote,
  PassageIndex,
  passagesOf,
  quoteWords,
  type Passage,
} from "./passages";
import type { ChatMessage, Complete } from "./transport";

/**
 * The assistant reads a source: it proposes the item's properties, sums
 * the source up for the research question, says what to read closely,
 * outlines a long source and proposes highlights. Every statement names
 * a passage and quotes it; Binder checks the quote against the source
 * and leaves out what it can't find.
 */

export interface ReadingInput {
  item: Item;
  /** The binder's research question; may be empty. */
  question: string;
  /** The source's text, by page. */
  pages: string[];
  pdf: boolean;
  /** Tags the binder uses, for the proposal to prefer. */
  tags: string[];
  /** Highlights the source has already, not to propose again. */
  highlights: Highlight[];
  /** A link from the item to a place in its source. */
  linkTo: (place: { page: number | null; text: string }) => string;
  complete: Complete;
  model: string;
  /** Where the model runs, as the file names it. */
  provider: string;
  /** How much text one request may carry, in characters. */
  budget: number;
  written: string;
  signal: AbortSignal;
  /** Says what the assistant is doing, for the window. */
  progress?: (step: string) => void;
}

/** A source with at least this many pages gets an outline. */
const LONG_PAGES = 10;
/** Room in a request for what isn't the source. */
const OVERHEAD = 4000;

const SYSTEM = `You help a researcher with the sources of a research project. You read one source, given as numbered passages, and write about it.

Rules:
- Say only what the source says. Every statement rests on one passage: give the passage's number and a quote copied word for word from that passage, 5 to 25 words long.
- When the source doesn't say something, leave it out. Don't add what you know from elsewhere.
- Write plainly, in short sentences, in the language of the research question, or in English when there is none.
- Answer with one JSON object and nothing else.`;

interface Statement {
  text: string;
  passage: number;
  quote: string;
}

interface RawHighlight {
  category: Category;
  passage: number;
  quote: string;
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const num = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(str(value).replace(/^\D+/, ""));
  return Number.isInteger(n) ? n : 0;
};
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The JSON object in a model's answer, also with a fence or words around it. */
export function jsonOf(answer: string): Record<string, unknown> | null {
  const text = answer.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const statementsOf = (value: unknown, field: string): Statement[] =>
  arr(value)
    .map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      return {
        text: str(e[field] ?? e.text ?? e.sentence ?? e.line),
        passage: num(e.passage),
        quote: str(e.quote),
      };
    })
    .filter((s) => s.text && s.quote);

const highlightsOf = (value: unknown): RawHighlight[] =>
  arr(value)
    .map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      const category = str(e.category).toLowerCase() as Category;
      return { category, passage: num(e.passage), quote: str(e.quote) };
    })
    .filter((h) => h.quote && CATEGORIES.some((c) => c.id === h.category));

/** What a source is about as the model may propose it; kinds you write yourself aren't proposed. */
const PROPOSABLE: Kind[] = KINDS.map((k) => k.id).filter(
  (k) => k !== "note" && k !== "thought",
);

export function proposalOf(value: unknown, item: Item, tags: string[]): Proposal {
  const p = (value ?? {}) as Record<string, unknown>;
  const proposal: Proposal = {};
  // A work from Zotero or found by its DOI has its details from there.
  const catalogued = Boolean(item.zotero || item.doi);
  const kind = str(p.kind).toLowerCase() as Kind;
  if (!catalogued && PROPOSABLE.includes(kind)) proposal.kind = kind;
  const title = normalize(str(p.title));
  if (!catalogued && title && title.length <= 300) proposal.title = title;
  const authors = arr(p.authors)
    .map((a) => normalize(str(a)))
    .filter((a) => /\p{L}/u.test(a) && a.length <= 120)
    .slice(0, 20);
  if (!catalogued && authors.length) proposal.authors = authors;
  const year = str(p.year);
  if (!catalogued && /^\d{4}$/.test(year)) proposal.year = year;
  const known = new Map(tags.map((tag) => [tag.toLowerCase(), tag]));
  const proposedTags = arr(p.tags)
    .map((t) => str(t).replace(/^#/, "").replace(/\s+/g, " "))
    .filter((t) => t && t.length <= 40 && !/[[\]{},]/.test(t))
    .map((t) => known.get(t.toLowerCase()) ?? t.toLowerCase());
  if (proposedTags.length) proposal.tags = [...new Set(proposedTags)].slice(0, 5);
  return newIn(proposal, item);
}

/** Markdown a sentence of the model's can't break: no links, emphasis or HTML of its own. */
const escapeMarkdown = (text: string) =>
  normalize(text)
    .replace(/\s*[([](?:p\.|passage|pp\.)?\s*\d+[)\]]\s*$/i, "")
    .replace(/([\\[\]*_`<>])/g, "\\$1");

const passageList = (passages: Passage[]) =>
  passages
    .map((p) => `[${p.n}]${p.page ? ` (p. ${p.page})` : ""} ${p.text}`)
    .join("\n\n");

function aboutItem(input: ReadingInput): string {
  const { item } = input;
  return [
    `Research question: ${input.question.trim() || "none written down yet"}`,
    `What the researcher has for this source: ${JSON.stringify({
      kind: item.kind,
      title: item.title,
      authors: item.authors,
      year: item.year,
      tags: item.tags,
    })}`,
    input.tags.length
      ? `Tags used in the project: ${input.tags.slice(0, 80).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const STATEMENT = `{"sentence": "...", "passage": 12, "quote": "words copied from passage 12"}`;
const LINE = `{"line": "...", "passage": 3, "quote": "words copied from passage 3"}`;
const HIGHLIGHT = `{"category": "claim", "passage": 7, "quote": "words copied from passage 7"}`;
const PROPOSAL = `{"kind": "article", "title": "...", "authors": ["Family, Given"], "year": "2021", "tags": ["..."]}`;

function wholeTask(outline: boolean): string {
  return `Read the source and answer with this JSON object:
{
  "proposal": ${PROPOSAL},
  "summary": [${STATEMENT}],
  "readClosely": [${LINE}],${outline ? `\n  "outline": [${LINE}],` : ""}
  "highlights": [${HIGHLIGHT}]
}
- proposal: what the source is. kind is one of ${PROPOSABLE.join(", ")}. Authors as "Family, Given". Up to 5 tags, preferring the project's tags. Leave out what the source doesn't show.
- summary: 3 to 6 sentences on what the source says, with the research question in mind.
- readClosely: 1 to 4 parts worth reading closely for the research question, each with a line on why.${outline ? `\n- outline: the parts of the source in order, each as "Name of the part: what it is about", with its first passage.` : ""}
- highlights: 3 to 8 key passages, each as a claim, definition, method, finding or quote.`;
}

const PART_TASK = `This is one part of a long source. Answer with this JSON object:
{
  "outline": [${LINE}],
  "points": [${STATEMENT}],
  "highlights": [${HIGHLIGHT}]
}
- outline: the parts in this part of the source, in order, each as "Name of the part: what it is about", with its first passage.
- points: up to 6 statements of what this part says that matter most for the research question.
- highlights: up to 4 key passages, each as a claim, definition, method, finding or quote.`;

function closingTask(): string {
  return `You read the whole source in parts; your points from it are below, with the passages they rest on and the passages that matter most for the research question. Answer with this JSON object:
{
  "proposal": ${PROPOSAL},
  "summary": [${STATEMENT}],
  "readClosely": [${LINE}]
}
- proposal: what the source is. kind is one of ${PROPOSABLE.join(", ")}. Authors as "Family, Given". Up to 5 tags, preferring the project's tags. Leave out what the source doesn't show.
- summary: 3 to 6 sentences on what the source says, with the research question in mind.
- readClosely: 1 to 4 parts worth reading closely for the research question, each with a line on why.`;
}

/** Asks the model and reads its JSON, asking once more when it gave none. */
async function ask(
  input: ReadingInput,
  content: string,
): Promise<Record<string, unknown>> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content },
  ];
  const answer = await input.complete(messages, input.signal);
  const json = jsonOf(answer);
  if (json) return json;
  const again = await input.complete(
    [
      ...messages,
      { role: "assistant", content: answer },
      {
        role: "user",
        content: "That wasn't a JSON object. Answer with the JSON object only.",
      },
    ],
    input.signal,
  );
  const second = jsonOf(again);
  if (!second) throw new Error("The model didn't answer in a form Binder can read.");
  return second;
}

/** Passages in runs that each fit in one request. */
function partsOf(passages: Passage[], budget: number): Passage[][] {
  const runs: Passage[][] = [];
  let run: Passage[] = [];
  let size = 0;
  for (const passage of passages) {
    const length = passage.text.length + 16;
    if (run.length && size + length > budget) {
      runs.push(run);
      run = [];
      size = 0;
    }
    run.push(passage);
    size += length;
  }
  if (run.length) runs.push(run);
  return runs;
}

export interface Reading {
  note: AssistantNote;
  /** How many statements were left out because their quote isn't in the source. */
  unchecked: number;
}

/** Reads a source with the model, and gives what the assistant writes about it. */
export async function readWithAssistant(input: ReadingInput): Promise<Reading> {
  const passages = passagesOf(input.pages, input.pdf);
  if (!passages.length)
    throw new Error("This source has no text the assistant can read.");
  const room = Math.max(input.budget - OVERHEAD, 2000);
  const runs = partsOf(passages, room);
  const outline = runs.length > 1 || (input.pdf && input.pages.length >= LONG_PAGES);
  const about = aboutItem(input);

  let whole: Record<string, unknown>;
  let outlineLines: Statement[] = [];
  let highlights: RawHighlight[] = [];
  if (runs.length === 1) {
    input.progress?.("Reading the source");
    whole = await ask(
      input,
      `${about}\n\n${wholeTask(outline)}\n\nThe source:\n\n${passageList(passages)}`,
    );
    outlineLines = statementsOf(whole.outline, "line");
    highlights = highlightsOf(whole.highlights);
  } else {
    const points: Statement[] = [];
    for (const [i, run] of runs.entries()) {
      input.progress?.(`Reading part ${i + 1} of ${runs.length}`);
      const part = await ask(
        input,
        `${about}\n\n${PART_TASK}\n\nPart ${i + 1} of ${runs.length} of the source:\n\n${passageList(run)}`,
      );
      outlineLines.push(...statementsOf(part.outline, "line"));
      highlights.push(...highlightsOf(part.highlights).slice(0, 4));
      points.push(
        ...statementsOf(part.points, "sentence").filter((p) =>
          findQuote(passages, p.quote, p.passage),
        ),
      );
    }
    input.progress?.("Writing the summary");
    // The beginning, the passages the points rest on, and those about the question.
    const chosen = new Map<number, Passage>();
    const add = (passage: Passage | undefined) => {
      if (passage) chosen.set(passage.n, passage);
    };
    const fits = () =>
      [...chosen.values()].reduce((sum, p) => sum + p.text.length + 16, 0) < room / 2;
    for (const passage of passages.slice(0, 6)) add(passage);
    for (const point of points) if (fits()) add(passages[point.passage - 1]);
    const index = new PassageIndex(passages);
    for (const passage of index.search(`${input.question} ${input.item.title}`, 40))
      if (fits()) add(passage);
    const notes = points.map((p) => `- ${p.text} [${p.passage}]`).join("\n");
    whole = await ask(
      input,
      `${about}\n\n${closingTask()}\n\nYour points:\n${notes || "none"}\n\nPassages:\n\n${passageList(
        [...chosen.values()].sort((a, b) => a.n - b.n),
      )}`,
    );
  }

  let unchecked = 0;
  /** A statement with the link to its passage, or null when its quote isn't in the source. */
  const checked = (s: { passage: number; quote: string }) => {
    const found = findQuote(passages, s.quote, s.passage);
    if (!found) {
      unchecked++;
      return null;
    }
    const label = found.page ? `p. ${found.page}` : "passage";
    return {
      passage: found,
      link: `[${label}](${input.linkTo({ page: found.page, text: quoteWords(s.quote) })})`,
    };
  };

  const summary = statementsOf(whole.summary, "sentence")
    .map((s) => {
      const c = checked(s);
      return c ? `${escapeMarkdown(s.text)} ${c.link}` : null;
    })
    .filter(Boolean)
    .join(" ");
  const lines = (list: Statement[], sort: boolean) => {
    const done = list
      .map((s) => {
        const c = checked(s);
        return c
          ? { n: c.passage.n, line: `- ${escapeMarkdown(s.text)} ${c.link}` }
          : null;
      })
      .filter((entry): entry is { n: number; line: string } => entry !== null);
    if (sort) done.sort((a, b) => a.n - b.n);
    return [...new Set(done.map((entry) => entry.line))].join("\n");
  };

  const taken = new Set(input.highlights.map((h) => normalize(h.text).toLowerCase()));
  const ids = input.highlights.map((h) => h.id);
  const proposed: Highlight[] = [];
  for (const h of highlights) {
    const found = findQuote(passages, h.quote, h.passage);
    if (!found) {
      unchecked++;
      continue;
    }
    const text = normalize(h.quote).replace(/^["']|["']$/g, "");
    const key = text.toLowerCase();
    if (taken.has(key) || /\.\.\.|…/.test(text)) continue;
    taken.add(key);
    const id = newHighlightId(ids);
    ids.push(id);
    proposed.push({ id, category: h.category, page: found.page, text });
  }

  let note: AssistantNote = {
    model: input.model,
    provider: input.provider,
    written: input.written,
    proposal: proposalOf(whole.proposal, input.item, input.tags),
    parts: [],
  };
  note = withPart(note, "summary", summary);
  note = withPart(
    note,
    "read-closely",
    lines(statementsOf(whole.readClosely, "line"), false),
  );
  if (outline) note = withPart(note, "outline", lines(outlineLines, true));
  note = withProposedHighlights(note, proposed.slice(0, 12));
  return { note, unchecked };
}

/** How much text one request may carry: less for a model on this computer. */
export const budgetFor = (local: boolean) => (local ? 24_000 : 120_000);
