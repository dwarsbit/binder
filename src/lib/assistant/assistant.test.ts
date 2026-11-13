import { describe, expect, it } from "vitest";
import { readItem } from "../binder";
import {
  assistantPathOf,
  isSpent,
  newIn,
  proposedHighlights,
  readAssistant,
  withPart,
  writeAssistant,
  type AssistantNote,
} from "./file";
import { findQuote, PassageIndex, passagesOf, quoteWords } from "./passages";
import { jsonOf, proposalOf, readWithAssistant } from "./reading";
import type { ChatMessage } from "./transport";

const PAGES = [
  "Screen or paper. How first-year students read course texts. We asked 1,204 first-year students at three universities how they read for their courses. Most of them read on a laptop.",
  "Method. Students read one text on paper and one on screen, and wrote down what they remembered a week later. We counted the points of the argument they could name.",
  "Findings. Students who read on paper remem- bered more of the argument. Reading is slower on screen, but not by much. The difference was largest for long texts.",
];

describe("passages", () => {
  it("cuts pages into passages on their page", () => {
    const passages = passagesOf(PAGES, true);
    expect(passages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(passages[0].n).toBe(1);
    const long = passagesOf(["A sentence that runs on. ".repeat(100)], true);
    expect(long.length).toBeGreaterThan(2);
    expect(long.every((p) => p.text.length <= 1200)).toBe(true);
  });

  it("finds quotes word for word, also over a broken word and with an ellipsis", () => {
    const passages = passagesOf(PAGES, true);
    expect(
      findQuote(passages, "Students who read on paper remembered more", 3)?.page,
    ).toBe(3);
    // The model named the wrong passage: the quote is found anyway.
    expect(
      findQuote(passages, "wrote down what they remembered a week later", 1)?.page,
    ).toBe(2);
    expect(
      findQuote(passages, "“Reading is slower on screen … not by much”")?.page,
    ).toBe(3);
    expect(
      findQuote(passages, "Students who read on paper understood more"),
    ).toBeNull();
    expect(findQuote(passages, "paper")).toBeNull();
  });

  it("keeps the first words of a quote for a link", () => {
    expect(quoteWords("“Reading is slower on screen … not by much”")).toBe(
      "Reading is slower on screen",
    );
    expect(quoteWords(Array(40).fill("word").join(" ")).split(" ")).toHaveLength(25);
  });

  it("finds the passages about a question", () => {
    const index = new PassageIndex(passagesOf(PAGES, true));
    expect(
      index.search("what do students remember of the argument on paper")[0].page,
    ).toBe(3);
    expect(index.search("zebra")).toEqual([]);
  });
});

const ITEM_SOURCE = `---
title: okafor brandt 2021
kind: article
status: inbox
file: okafor brandt 2021.pdf
tags: [reading]
added: 2026-11-13
---
`;
const item = readItem("items/okafor brandt 2021.md", ITEM_SOURCE);

describe("the assistant file", () => {
  const note: AssistantNote = {
    model: "mistral-small-latest",
    provider: "Mistral",
    written: "2026-11-13",
    proposal: {
      kind: "article",
      title: "Screen or paper",
      authors: ["Okafor, Nkem"],
      year: "2021",
      tags: ["survey"],
    },
    parts: [],
  };

  it("writes and reads back its proposal and parts", () => {
    let full = withPart(note, "outline", "- Method [p. 2](x.pdf#page=2)");
    full = withPart(
      full,
      "summary",
      "Students remember more on paper. [p. 3](x.pdf#page=3)",
    );
    const text = writeAssistant(item.path, full);
    expect(text).toContain("assistant-of: okafor brandt 2021.md");
    expect(text).toContain("proposed-year: 2021");
    expect(text.indexOf("## Summary")).toBeLessThan(text.indexOf("## Outline"));
    const back = readAssistant(text);
    expect(back.proposal).toEqual(note.proposal);
    expect(back.parts.map((p) => p.id)).toEqual(["summary", "outline"]);
    expect(back.model).toBe("mistral-small-latest");
  });

  it("keeps lines and parts it doesn't know", () => {
    const text = `---\nassistant-of: a.md\nmine: kept\n---\n\n## Summary\n\nOne. [p. 1](a.pdf#page=1)\n\n## My own\n\nKept.\n`;
    const back = readAssistant(text);
    expect(back.parts.map((p) => p.heading)).toEqual(["Summary", "My own"]);
    const again = writeAssistant("a.md", withPart(back, "summary", ""), text);
    expect(again).toContain("mine: kept");
    expect(again).toContain("## My own\n\nKept.");
    expect(again).not.toContain("## Summary");
  });

  it("is spent when nothing is left to accept or take over", () => {
    expect(isSpent({ ...note, proposal: {} })).toBe(true);
    expect(isSpent(note)).toBe(false);
  });

  it("proposes only what the item hasn't got", () => {
    expect(
      newIn({ kind: "article", tags: ["reading", "survey"], year: "2021" }, item),
    ).toEqual({
      tags: ["survey"],
      year: "2021",
    });
  });

  it("names its path after the item", () => {
    expect(assistantPathOf("items/A.md")).toBe("items/A.assistant.md");
  });
});

describe("reading a source", () => {
  it("reads JSON out of an answer", () => {
    expect(jsonOf('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(jsonOf('<think>{no}</think> Here: {"b": [2]} done')).toEqual({ b: [2] });
    expect(jsonOf("no json")).toBeNull();
  });

  it("leaves catalogued details alone and prefers the binder's tags", () => {
    const zotero = { ...item, zotero: "zotero://select/library/items/AB" };
    expect(
      proposalOf(
        { kind: "book", title: "X", year: "2020", tags: ["Survey", "#Recall"] },
        zotero,
        ["survey"],
      ),
    ).toEqual({ tags: ["survey", "recall"] });
  });

  it("writes only statements whose quote is in the source", async () => {
    const asked: ChatMessage[][] = [];
    const answer = {
      proposal: {
        kind: "article",
        title: "Screen or paper",
        authors: ["Okafor, Nkem"],
        year: "2021",
        tags: ["survey"],
      },
      summary: [
        {
          sentence: "Students remembered more after reading on paper.",
          passage: 3,
          quote: "Students who read on paper remembered more of the argument",
        },
        {
          sentence: "The study ran at three universities. (p. 1)",
          passage: 1,
          quote: "first-year students at three universities",
        },
        {
          sentence: "Laptops were banned.",
          passage: 1,
          quote: "laptops were banned in every class",
        },
      ],
      readClosely: [
        {
          line: "The method of recall.",
          passage: 2,
          quote: "wrote down what they remembered a week later",
        },
      ],
      highlights: [
        {
          category: "finding",
          passage: 3,
          quote: "Reading is slower on screen, but not by much.",
        },
        { category: "claim", passage: 3, quote: "Paper is always better." },
      ],
    };
    const reading = await readWithAssistant({
      item,
      question: "Do students read less on screen?",
      pages: PAGES,
      pdf: true,
      tags: ["survey"],
      highlights: [],
      linkTo: ({ page, text }) =>
        `okafor%20brandt%202021.pdf#page=${page}&text=${encodeURIComponent(text)}`,
      complete: async (messages) => {
        asked.push(messages);
        return `Sure:\n${JSON.stringify(answer)}`;
      },
      model: "test",
      provider: "this computer",
      budget: 100_000,
      written: "2026-11-13",
      signal: new AbortController().signal,
    });
    expect(asked).toHaveLength(1);
    expect(asked[0][1].content).toContain("Do students read less on screen?");
    expect(asked[0][1].content).toContain("[3] (p. 3)");
    const summary = reading.note.parts.find((p) => p.id === "summary")!.markdown;
    expect(summary).toContain(
      "Students remembered more after reading on paper. [p. 3](",
    );
    expect(summary).toContain("The study ran at three universities. [p. 1](");
    expect(summary).not.toContain("Laptops");
    expect(reading.unchecked).toBe(2);
    expect(proposedHighlights(reading.note)).toMatchObject([
      {
        category: "finding",
        page: 3,
        text: "Reading is slower on screen, but not by much.",
      },
    ]);
    expect(reading.note.proposal).toEqual({
      title: "Screen or paper",
      authors: ["Okafor, Nkem"],
      year: "2021",
      tags: ["survey"],
    });
  });

  it("reads a long source in parts, with an outline", async () => {
    const pages = Array.from(
      { length: 12 },
      (_, i) =>
        `Chapter ${i + 1} on reading. ${"Students read texts for their courses in many ways. ".repeat(30)}`,
    );
    let calls = 0;
    const reading = await readWithAssistant({
      item,
      question: "",
      pages,
      pdf: true,
      tags: [],
      highlights: [],
      linkTo: ({ page }) => `x.pdf#page=${page}`,
      complete: async (messages) => {
        calls++;
        const last = messages[messages.length - 1].content;
        if (last.includes("one part of a long source")) {
          const n = Number(/\[(\d+)\] \(p\. (\d+)\) Chapter/.exec(last)?.[1] ?? 1);
          const page = /\[\d+\] \(p\. (\d+)\) Chapter/.exec(last)?.[1];
          return JSON.stringify({
            outline: [
              {
                line: `Chapter ${page}: reading.`,
                passage: n,
                quote: `Chapter ${page} on reading`,
              },
            ],
            points: [],
            highlights: [],
          });
        }
        return JSON.stringify({ summary: [], readClosely: [] });
      },
      model: "test",
      provider: "this computer",
      budget: 12_000,
      written: "2026-11-13",
      signal: new AbortController().signal,
    });
    expect(calls).toBeGreaterThan(2);
    const outline = reading.note.parts.find((p) => p.id === "outline")!.markdown;
    expect(outline.split("\n")[0]).toMatch(/^- Chapter 1: reading\. \[p\. 1\]/);
  });

  it("asks again when the answer isn't JSON, and gives up after that", async () => {
    let calls = 0;
    await expect(
      readWithAssistant({
        item,
        question: "",
        pages: PAGES,
        pdf: true,
        tags: [],
        highlights: [],
        linkTo: () => "x",
        complete: async () => {
          calls++;
          return "I can't.";
        },
        model: "test",
        provider: "this computer",
        budget: 100_000,
        written: "2026-11-13",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("form Binder can read");
    expect(calls).toBe(2);
  });
});
