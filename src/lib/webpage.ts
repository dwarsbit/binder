/**
 * A web page kept with its item: the article, without the site around
 * it. `docs/format.md` describes the file Binder writes.
 */

/** Elements kept, as they are. Anything else gives up its contents. */
const KEEP = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "blockquote",
  "pre",
  "code",
  "em",
  "strong",
  "i",
  "b",
  "u",
  "s",
  "sub",
  "sup",
  "small",
  "mark",
  "q",
  "cite",
  "abbr",
  "a",
  "br",
  "hr",
  "figure",
  "figcaption",
  "table",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
]);

/** Elements dropped with everything in them. */
const DROP =
  "script, style, noscript, template, iframe, object, embed, svg, canvas, video, audio, img, picture, source, form, button, input, select, textarea, nav, header, footer, aside, dialog, [hidden], [aria-hidden=true], [role=navigation], [role=banner], [role=contentinfo], [role=complementary]";

/** Names of classes and ids that hold no article: menus, shares, comments. */
const CLUTTER =
  /(^|[-_\s])(nav|menu|share|social|related|comment|comments|cookie|consent|newsletter|subscribe|promo|advert|ad|ads|sidebar|breadcrumbs?|footer|header|popup|modal)([-_\s]|$)/i;

const textLength = (element: Element) =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim().length;

/** The element that holds the article: the one with the most text in paragraphs. */
function articleOf(doc: Document): Element {
  const marked = doc.querySelector("article, main, [role=main]");
  if (marked && textLength(marked) > 400) return marked;
  const scores = new Map<Element, number>();
  for (const paragraph of doc.body.querySelectorAll("p")) {
    const length = textLength(paragraph);
    if (length < 40) continue;
    const parent = paragraph.parentElement;
    if (!parent) continue;
    scores.set(parent, (scores.get(parent) ?? 0) + length);
    const grand = parent.parentElement;
    if (grand) scores.set(grand, (scores.get(grand) ?? 0) + length / 2);
  }
  let best: Element = marked ?? doc.body;
  let most = 0;
  for (const [element, score] of scores) {
    if (score > most) {
      best = element;
      most = score;
    }
  }
  return best;
}

/** A copy of `node` with only the kept elements, and links made absolute. */
function clean(node: Node, doc: Document, base: string): Node[] {
  if (node.nodeType === 3) return [doc.createTextNode(node.textContent ?? "")];
  if (node.nodeType !== 1) return [];
  const element = node as Element;
  const name = element.tagName.toLowerCase();
  const id = `${element.getAttribute("class") ?? ""} ${element.id}`;
  if (
    name !== "article" &&
    name !== "main" &&
    CLUTTER.test(id) &&
    textLength(element) < 2000
  )
    return [];
  const children = [...element.childNodes].flatMap((child) => clean(child, doc, base));
  if (!KEEP.has(name)) return children;
  const copy = doc.createElement(name);
  if (name === "a") {
    const href = element.getAttribute("href") ?? "";
    try {
      const url = new URL(href, base);
      if (url.protocol === "https:" || url.protocol === "http:") {
        copy.setAttribute("href", url.href);
      }
    } catch {
      // Not an address: the text stays, without the link.
    }
  }
  for (const attribute of ["colspan", "rowspan", "start"]) {
    const value = element.getAttribute(attribute);
    if (value && /^\d+$/.test(value)) copy.setAttribute(attribute, value);
  }
  copy.append(...children);
  return [copy];
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface KeptPage {
  /** The page's own title. */
  title: string;
  /** The file Binder writes: a whole HTML document. */
  html: string;
  /** The article's text, as words. */
  text: string;
}

/** The title a page gives itself: its Open Graph title, its heading or its `<title>`. */
function titleOf(doc: Document, article: Element): string {
  const og = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  const heading =
    article.querySelector("h1")?.textContent ?? doc.querySelector("h1")?.textContent;
  const own = doc.title;
  return (og || heading || own || "").replace(/\s+/g, " ").trim();
}

/** The article of a web page, as the file Binder keeps; null when it has no text. */
export function keepPage(source: string, url: string, kept: string): KeptPage | null {
  const doc = new DOMParser().parseFromString(source, "text/html");
  for (const element of doc.querySelectorAll(DROP)) element.remove();
  const article = articleOf(doc);
  const title = titleOf(doc, article);
  const out = document.implementation.createHTMLDocument("");
  const body = out.createElement("article");
  body.append(...[...article.childNodes].flatMap((child) => clean(child, out, url)));
  // Empty elements are left from what was dropped.
  for (const element of [
    ...body.querySelectorAll("p, li, figure, div, blockquote, h1, h2, h3, h4, h5, h6"),
  ].reverse()) {
    if (!element.textContent?.trim() && !element.querySelector("br, hr"))
      element.remove();
  }
  const text = (body.textContent ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 80) return null;
  if (title && !body.querySelector("h1")) {
    const heading = out.createElement("h1");
    heading.textContent = title;
    body.prepend(heading);
  }
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<link rel="canonical" href="${escapeHtml(url)}">
<meta name="binder-kept" content="${escapeHtml(kept)}">
</head>
<body>
${body.outerHTML}
</body>
</html>
`;
  return { title, html, text };
}

/** The article of a kept page, ready to show: its elements, without the document around it. */
export function keptArticle(source: string): { html: string; url: string } {
  const doc = new DOMParser().parseFromString(source, "text/html");
  for (const element of doc.querySelectorAll(DROP)) element.remove();
  const url = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
  const article = doc.querySelector("body > article") ?? doc.body;
  const out = document.implementation.createHTMLDocument("");
  const copy = out.createElement("article");
  copy.append(
    ...[...article.childNodes].flatMap((child) =>
      clean(child, out, url || "https://invalid/"),
    ),
  );
  return { html: copy.innerHTML, url };
}
