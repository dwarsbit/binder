// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { boxesOf, rangeOf } from "./dom-text";
import { htmlPages, isReadable, matchesIn, normalize } from "./text";
import { keepPage, keptArticle } from "./webpage";

describe("the text of files", () => {
  it("compares words as search does", () => {
    expect(normalize("  “Deep”\n reading—on   paper ")).toBe('"Deep" reading-on paper');
    expect(matchesIn("Read on paper.\nRead on\nscreen.", "read on")).toEqual([0, 15]);
    expect(
      matchesIn("A sentence that runs\nover two lines.", "runs over two"),
    ).toHaveLength(1);
  });

  it("reads files it can show", () => {
    expect(isReadable("items/A.pdf")).toBe(true);
    expect(isReadable("items/A.html")).toBe(true);
    expect(isReadable("items/A.docx")).toBe(false);
  });

  it("reads a kept page as one page of text", () => {
    const [text] = htmlPages(
      "<html><head><title>T</title></head><body><h1>Title</h1><p>One.</p><p>Two.</p></body></html>",
    );
    expect(normalize(text)).toBe("Title One. Two.");
  });

  it("finds a quote across elements and line breaks", () => {
    document.body.innerHTML =
      '<div id="page"><span>Students who read</span><br><span>on paper remembered</span> <span>more.</span></div>';
    const root = document.getElementById("page")!;
    const range = rangeOf(root, "who read on paper");
    expect(range?.toString()).toBe("who readon paper");
    expect(rangeOf(root, "remembered more.", 0)?.toString()).toBe("remembered more.");
    expect(rangeOf(root, "remembered more.", 1)).toBeNull();
    expect(range && boxesOf(range, root)).toBeDefined();
  });
});

describe("kept web pages", () => {
  const PAGE = `<!doctype html><html><head><title>Where students read | Library</title>
<meta property="og:title" content="Where students read">
<script>alert(1)</script><style>p{}</style></head>
<body><nav class="site-nav"><a href="/">Home</a></nav>
<main><article><h1>Where students read</h1>
<p onclick="steal()">Two thirds of first-year students do most of their course reading at home, the survey <a href="/survey.pdf">found</a>.</p>
<img src="x.png" alt="A chart"><svg><text>Ad</text></svg>
<p>The library comes second, mostly in the weeks before exams. Only one in ten reads on the train or bus, and almost nobody in a café.</p>
<div class="share-buttons"><a href="https://social.example">Share</a></div>
<blockquote>I read better on paper, but I only print what I have to hand in, says a student.</blockquote>
<p>From next term, the free print allowance goes up to 400 pages for first-year students.</p>
</article></main><footer>© Library</footer></body></html>`;

  it("keeps the article, without the site around it", () => {
    const kept = keepPage(PAGE, "https://example.org/library/where", "2026-11-13");
    expect(kept?.title).toBe("Where students read");
    expect(kept?.html).toContain(
      '<link rel="canonical" href="https://example.org/library/where">',
    );
    expect(kept?.html).toContain('<meta name="binder-kept" content="2026-11-13">');
    expect(kept?.html).toContain('<a href="https://example.org/survey.pdf">found</a>');
    for (const gone of [
      "<script",
      "<style",
      "onclick",
      "<img",
      "<iframe",
      "Home",
      "Share",
      "©",
    ]) {
      expect(kept?.html).not.toContain(gone);
    }
    expect(kept?.text).toContain("Two thirds of first-year students");
  });

  it("gives nothing for a page without an article", () => {
    expect(
      keepPage("<html><body><p>Hi</p></body></html>", "https://e.org", "2026-11-13"),
    ).toBeNull();
  });

  it("shows a kept page's article and its address", () => {
    const kept = keepPage(PAGE, "https://example.org/library/where", "2026-11-13");
    const shown = keptArticle(kept?.html ?? "");
    expect(shown.url).toBe("https://example.org/library/where");
    expect(shown.html).toContain("<h1>Where students read</h1>");
    expect(shown.html).not.toContain("<article");
  });
});
