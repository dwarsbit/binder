import { describe, expect, it } from "vitest";
import {
  highlightsPathOf,
  isHighlightsPath,
  newHighlightId,
  placeHref,
  placeOfHref,
  readHighlights,
  retargetFileLinks,
  writeHighlights,
  type Highlight,
} from "./highlights";
import { itemsOf } from "./binder";

const HIGHLIGHTS: Highlight[] = [
  {
    id: "k3x9q2",
    category: "claim",
    page: 4,
    text: "Students who read on paper remembered more of the argument.",
  },
  {
    id: "q0w8ea",
    category: "quote",
    page: null,
    text: "Reading is “slower” on screen.",
  },
];

describe("highlights", () => {
  it("writes and reads the highlights file", () => {
    const source = writeHighlights("items/Screen or paper.md", HIGHLIGHTS);
    expect(source).toBe(`---
highlights-of: Screen or paper.md
---

- **Claim** · p. 4 · “Students who read on paper remembered more of the argument.” ^k3x9q2
- **Quote** · “Reading is “slower” on screen.” ^q0w8ea
`);
    expect(readHighlights(source).highlights).toEqual(HIGHLIGHTS);
  });

  it("keeps lines and properties it doesn't read", () => {
    const before = `---
highlights-of: Old.md
reviewed: true
---

- **Finding** · p. 2 · “A finding.” ^a1
- A line of my own
`;
    const after = writeHighlights("items/New.md", [], before);
    expect(after).toBe(`---
highlights-of: New.md
reviewed: true
---

- A line of my own
`);
  });

  it("names the file after the item and leaves it out of the items", () => {
    expect(highlightsPathOf("items/Screen or paper.md")).toBe(
      "items/Screen or paper.highlights.md",
    );
    expect(isHighlightsPath("items/Screen or paper.highlights.md")).toBe(true);
    const project = {
      name: "Thesis",
      folders: ["items"],
      pages: {
        "items/A.md": "---\ntitle: A\n---\n",
        "items/A.highlights.md": writeHighlights("items/A.md", HIGHLIGHTS),
      },
    };
    expect(itemsOf(project).map((item) => item.path)).toEqual(["items/A.md"]);
  });

  it("makes ids that are not taken", () => {
    const id = newHighlightId(["abc123"]);
    expect(id).toMatch(/^[a-z0-9]{6}$/);
    expect(id).not.toBe("abc123");
  });
});

describe("links to a place in a source", () => {
  it("writes and reads a link to a page and a highlight", () => {
    const href = placeHref("items", {
      file: "items/Screen or paper.pdf",
      page: 4,
      highlight: "k3x9q2",
    });
    expect(href).toBe("Screen%20or%20paper.pdf#page=4&highlight=k3x9q2");
    expect(placeOfHref("items", href)).toEqual({
      file: "items/Screen or paper.pdf",
      page: 4,
      highlight: "k3x9q2",
      text: null,
    });
    expect(placeOfHref("notes", "../items/Screen%20or%20paper.pdf")).toEqual({
      file: "items/Screen or paper.pdf",
      page: null,
      highlight: null,
      text: null,
    });
  });

  it("keeps a link whole when the file's name has parentheses", () => {
    const href = placeHref("items", {
      file: "items/A (copy).pdf",
      page: 1,
      highlight: null,
    });
    expect(href).toBe("A%20%28copy%29.pdf#page=1");
    expect(placeOfHref("items", href)?.file).toBe("items/A (copy).pdf");
    const [[, moved]] = retargetFileLinks(
      { "items/A.md": `[p. 1](${href})` },
      "items/A (copy).pdf",
      "items/B (2).pdf",
    );
    expect(moved).toBe("[p. 1](B%20%282%29.pdf#page=1)");
  });

  it("carries the words of a passage", () => {
    const href = placeHref("items", {
      file: "items/A.pdf",
      page: 2,
      highlight: null,
      text: "students' recall, a week later",
    });
    expect(href).toBe("A.pdf#page=2&text=students%27%20recall%2C%20a%20week%20later");
    expect(placeOfHref("items", href)?.text).toBe("students' recall, a week later");
  });

  it("leaves web links and pages alone", () => {
    expect(placeOfHref("items", "https://example.org/a.pdf")).toBeNull();
    expect(placeOfHref("items", "Notes.md")).toBeNull();
    expect(placeOfHref("", "../outside.pdf")).toBeNull();
  });

  it("points links at a file that moved", () => {
    const pages = {
      "items/A.md": "> “Quote” [p. 4](Old%20name.pdf#page=4&highlight=k3)\n",
      "notes/B.md": "See [the PDF](../items/Old%20name.pdf).\n",
      "items/C.md": "Nothing here.\n",
    };
    expect(
      retargetFileLinks(pages, "items/Old name.pdf", "items/New name.pdf"),
    ).toEqual([
      ["items/A.md", "> “Quote” [p. 4](New%20name.pdf#page=4&highlight=k3)\n"],
      ["notes/B.md", "See [the PDF](../items/New%20name.pdf).\n"],
    ]);
  });
});
