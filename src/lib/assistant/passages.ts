import { normalize } from "../text";

/**
 * Passages: a source's text cut into pieces of a few sentences, each on
 * its page. The assistant reads and quotes them, and Binder checks every
 * quote against them. Worked out on this computer from the text Binder
 * keeps for search (`.binder/text.json`).
 */

export interface Passage {
  /** Its number in the source, from 1. */
  n: number;
  /** The page in a PDF, from 1; null in a web page. */
  page: number | null;
  text: string;
}

/** About how long a passage is, in characters. */
const TARGET = 700;
const MAX = 1200;

/** Sentences of a text: cut after . ! ? and a space before a capital, a digit or a quote. */
function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[\p{Lu}\d])/u)
    .filter(Boolean);
}

/** The passages of a source, from its text by page. */
export function passagesOf(pages: string[], pdf: boolean): Passage[] {
  const passages: Passage[] = [];
  pages.forEach((pageText, index) => {
    const page = pdf ? index + 1 : null;
    // A web page breaks into blocks: a passage ends where a block does.
    const blocks = pdf ? [pageText] : pageText.split(/\n+/);
    let current = "";
    const flush = () => {
      const text = current.trim();
      if (text) passages.push({ n: passages.length + 1, page, text });
      current = "";
    };
    for (const block of blocks) {
      for (const sentence of sentencesOf(block)) {
        if (current && current.length + sentence.length > MAX) flush();
        // A sentence longer than a passage gets one of its own, cut where it must be.
        if (sentence.length > MAX) {
          for (let at = 0; at < sentence.length; at += MAX) {
            current = sentence.slice(at, at + MAX);
            flush();
          }
          continue;
        }
        current = current ? `${current} ${sentence}` : sentence;
        if (current.length >= TARGET) flush();
      }
      if (!pdf && current.length >= TARGET / 2) flush();
    }
    flush();
  });
  return passages;
}

/** Text as quotes are compared: normalized, in lower case, and with words broken over a line joined. */
export const comparable = (text: string) =>
  normalize(text)
    .toLowerCase()
    .replace(/(\p{L})- (\p{Ll})/gu, "$1$2");

/** The shortest quote Binder accepts as a passage's words. */
const SHORTEST = 12;

/**
 * Where a quote is in a source: the passage that holds it, looked for in
 * the passage the model named first. Null when the quote isn't there:
 * the statement has no passage then. A quote with an ellipsis must have
 * each of its parts in the same passage, in order.
 */
export function findQuote(
  passages: Passage[],
  quote: string,
  named?: number,
): Passage | null {
  const parts = comparable(quote)
    .replace(/^["']|["']$/g, "")
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\]|\[…\])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length || parts.join(" ").length < SHORTEST) return null;
  const holds = (passage: Passage) => {
    const text = comparable(passage.text);
    let from = 0;
    for (const part of parts) {
      const at = text.indexOf(part, from);
      if (at < 0) return false;
      from = at + part.length;
    }
    return true;
  };
  const first = passages.find((passage) => passage.n === named);
  if (first && holds(first)) return first;
  // A quote that runs over into the next passage is found in the two joined.
  for (let i = 0; i < passages.length; i++) {
    if (holds(passages[i])) return passages[i];
    const next = passages[i + 1];
    if (next && next.page === passages[i].page) {
      const joined = { ...passages[i], text: `${passages[i].text} ${next.text}` };
      if (holds(joined)) return passages[i];
    }
  }
  return null;
}

/** The words of a quote that a link carries: its first part, at most about 25 words. */
export function quoteWords(quote: string): string {
  const first =
    normalize(quote)
      .replace(/^["']|["']$/g, "")
      .split(/\s*(?:\.\.\.|…|\[\.\.\.\]|\[…\])\s*/)[0] ?? "";
  const words = first.split(" ");
  return words.length > 25 ? words.slice(0, 25).join(" ") : first;
}

const STOP = new Set(
  "a an and are as at be by for from has have how in is it its of on or that the this to was were what when which who why will with do does did not no than then there these those their they we you i".split(
    " ",
  ),
);

const termsOf = (text: string) =>
  comparable(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1 && !STOP.has(term));

/**
 * An index of passages, to find the ones about a question: BM25 over
 * their words. Kept in memory; it is quick to build again.
 */
export class PassageIndex {
  private readonly terms: Array<Map<string, number>>;
  private readonly lengths: number[];
  private readonly frequency = new Map<string, number>();
  private readonly average: number;

  constructor(readonly passages: Passage[]) {
    this.terms = passages.map((passage) => {
      const counts = new Map<string, number>();
      for (const term of termsOf(passage.text))
        counts.set(term, (counts.get(term) ?? 0) + 1);
      for (const term of counts.keys())
        this.frequency.set(term, (this.frequency.get(term) ?? 0) + 1);
      return counts;
    });
    this.lengths = this.terms.map((counts) =>
      [...counts.values()].reduce((sum, n) => sum + n, 0),
    );
    this.average = this.lengths.reduce((sum, n) => sum + n, 0) / (passages.length || 1);
  }

  /** The passages that best match a question, the best first. */
  search(query: string, limit = 10): Passage[] {
    const k1 = 1.2;
    const b = 0.75;
    const count = this.passages.length;
    const terms = [...new Set(termsOf(query))];
    const scored = this.passages.map((passage, i) => {
      let score = 0;
      for (const term of terms) {
        const tf = this.terms[i].get(term) ?? 0;
        if (!tf) continue;
        const df = this.frequency.get(term) ?? 0;
        const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5));
        score +=
          (idf * tf * (k1 + 1)) /
          (tf + k1 * (1 - b + (b * this.lengths[i]) / (this.average || 1)));
      }
      return { passage, score };
    });
    return scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.passage.n - b.passage.n)
      .slice(0, limit)
      .map((entry) => entry.passage);
  }
}
