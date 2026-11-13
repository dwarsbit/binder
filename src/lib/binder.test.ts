import { describe, expect, it } from "vitest";
import {
  authorsShort,
  fileNameFor,
  freeItemPath,
  itemByline,
  kindOfFile,
  newItemSource,
  readBinderInfo,
  readItem,
  setProperties,
  tagCounts,
  thoughtTitle,
  writeBinderInfo,
  zoteroKeyOf,
  zoteroLink,
} from "./binder";

const ARTICLE = `---
title: "Screen or paper: how first-year students read course texts"
kind: article
status: to-read
authors: ["Okafor, Nkem", "Brandt, Sofie"]
year: 2021
published-in: Journal of Higher Education Research
doi: 10.1000/jher.2021.0042
file: Screen or paper.pdf
zotero: zotero://select/library/items/ABCD2345
tags: [survey, laptops]
added: 2026-11-13
---

My notes.
`;

describe("items", () => {
  it("reads an item's properties and notes", () => {
    const item = readItem("items/Screen or paper.md", ARTICLE);
    expect(item).toMatchObject({
      title: "Screen or paper: how first-year students read course texts",
      kind: "article",
      status: "to-read",
      authors: ["Okafor, Nkem", "Brandt, Sofie"],
      year: "2021",
      publishedIn: "Journal of Higher Education Research",
      doi: "10.1000/jher.2021.0042",
      file: "items/Screen or paper.pdf",
      zotero: "zotero://select/library/items/ABCD2345",
      tags: ["survey", "laptops"],
      added: "2026-11-13",
      markdown: "My notes.\n",
    });
    expect(itemByline(item)).toBe("Okafor and Brandt · 2021 · Article");
  });

  it("reads any Markdown file as a note, titled by its file name", () => {
    const item = readItem(
      "Ideas/Questions for my supervisor.md",
      "- Is an e-reader a screen?\n",
    );
    expect(item).toMatchObject({
      title: "Questions for my supervisor",
      kind: "note",
      status: null,
      authors: [],
      file: null,
    });
  });

  it("writes a new item with Binder's properties in order and leaves out empty ones", () => {
    const source = newItemSource(
      {
        title: "Reading compliance in the first year",
        kind: "article",
        authors: ["Hartman, Lea"],
        year: "2019",
        doi: "10.1000/x",
        file: "Reading compliance in the first year.pdf",
        tags: [],
      },
      "2026-11-13",
    );
    expect(source).toBe(`---
title: Reading compliance in the first year
kind: article
status: inbox
authors: ["Hartman, Lea"]
year: 2019
doi: 10.1000/x
file: Reading compliance in the first year.pdf
added: 2026-11-13
---

`);
  });

  it("starts thoughts in the inbox and notes without a status", () => {
    expect(
      readItem("a.md", newItemSource({ title: "A", kind: "thought" })).status,
    ).toBe("inbox");
    expect(
      readItem("b.md", newItemSource({ title: "B", kind: "note" })).status,
    ).toBeNull();
  });

  it("sets and removes properties and keeps lines it doesn't know", () => {
    const source = `---
title: The reading student
kind: book
rating: 4
---

Body
`;
    const changed = setProperties(source, {
      status: "reading",
      year: "2018",
      kind: null,
    });
    expect(changed).toBe(`---
title: The reading student
status: reading
year: 2018
rating: 4
---

Body
`);
    expect(setProperties(changed, { status: "processed" })).toContain(
      "status: processed\n",
    );
  });

  it("round-trips titles and authors that need quotes", () => {
    const source = newItemSource({
      title: "Yes: a study, of 2 parts",
      kind: "book",
      authors: ["de Boer, Anna", "World Health Organization"],
    });
    const item = readItem("items/x.md", source);
    expect(item.title).toBe("Yes: a study, of 2 parts");
    expect(item.authors).toEqual(["de Boer, Anna", "World Health Organization"]);
  });
});

describe("the binder file", () => {
  it("reads and writes the research question and the format version", () => {
    const written = writeBinderInfo(undefined, "Do students read less on screen?");
    expect(written).toBe("---\nbinder: 1\n---\n\nDo students read less on screen?\n");
    const project = { name: "Thesis", folders: [], pages: { "binder.md": written } };
    expect(readBinderInfo(project)).toEqual({
      format: 1,
      question: "Do students read less on screen?",
    });
    expect(readBinderInfo({ ...project, pages: {} })).toEqual({
      format: 1,
      question: "",
    });
    const later = { ...project, pages: { "binder.md": "---\nbinder: 3\n---\n" } };
    expect(readBinderInfo(later).format).toBe(3);
  });
});

describe("names", () => {
  it("names files after titles and finds a free one for the item and its file", () => {
    expect(fileNameFor("Screen or paper: a/b test?")).toBe("Screen or paper a b test");
    const project = {
      name: "Thesis",
      folders: ["items"],
      pages: { "items/Notes.md": "" },
      files: ["items/Paper.pdf"],
    };
    expect(freeItemPath(project, "Notes")).toEqual({
      path: "items/Notes 2.md",
      file: null,
    });
    expect(freeItemPath(project, "Paper", ".pdf")).toEqual({
      path: "items/Paper 2.md",
      file: "items/Paper 2.pdf",
    });
    expect(freeItemPath(project, "Notes", "", "items", "items/Notes.md").path).toBe(
      "items/Notes.md",
    );
  });

  it("takes a file's kind and title from its name", () => {
    expect(kindOfFile("okafor_brandt-2021.PDF")).toBe("article");
    expect(kindOfFile("week 3.pptx")).toBe("slides");
    expect(kindOfFile("data.csv")).toBe("file");
  });

  it("titles a thought by its first line", () => {
    expect(thoughtTitle("Does an e-reader count?\nAsk my supervisor")).toBe(
      "Does an e-reader count?",
    );
    expect(thoughtTitle("word ".repeat(30)).length).toBeLessThanOrEqual(81);
  });

  it("shortens author lists", () => {
    expect(authorsShort([])).toBe("");
    expect(authorsShort(["Lee, Min"])).toBe("Lee");
    expect(authorsShort(["A, B", "C, D", "E, F"])).toBe("A et al.");
  });
});

describe("tags and Zotero", () => {
  it("counts tags", () => {
    const items = [ARTICLE, ARTICLE.replace("laptops", "paper")].map((s, i) =>
      readItem(`${i}.md`, s),
    );
    expect(tagCounts(items)).toEqual([
      { tag: "laptops", count: 1 },
      { tag: "paper", count: 1 },
      { tag: "survey", count: 2 },
    ]);
  });

  it("links to Zotero items", () => {
    expect(zoteroLink("local", "ABCD2345")).toBe(
      "zotero://select/library/items/ABCD2345",
    );
    expect(zoteroLink("groups/42", "X1")).toBe("zotero://select/groups/42/items/X1");
    expect(zoteroKeyOf("zotero://select/groups/42/items/X1")).toBe("X1");
  });
});
