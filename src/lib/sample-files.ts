/**
 * The files of the demo binder: an article as a PDF and a kept web page.
 * The article and the page are made up, as the rest of the demo.
 */

const ARTICLE_PDF =
  "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IDAgb2JqCjw8IC9UeXBlIC9DYXRhbG9nIC9QYWdlcyA5IDAgUiA+PgplbmRvYmoKMTEgMCBvYmoKPDwgL1RpdGxlIChTY3JlZW4gb3IgcGFwZXI6IGhvdyBmaXJzdC15ZWFyIHN0dWRlbnRzIHJlYWQgY291cnNlIHRleHRzKSAvQXV0aG9yIChOa2VtIE9rYWZvciBhbmQgU29maWUgQnJhbmR0KSA+PgplbmRvYmoKeHJlZgowIDEyCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMTA2IDAwMDAwIG4gCjAwMDAwMDAyMDggMDAwMDAgbiAKMDAwMDAwMDk0MCAwMDAwMCBuIAowMDAwMDAxNTY0IDAwMDAwIG4gCjAwMDAwMDIyMjEgMDAwMDAgbiAKMDAwMDAwMjM1NyAwMDAwMCBuIAowMDAwMDAyNDkzIDAwMDAwIG4gCjAwMDAwMDI2MjkgMDAwMDAgbiAKMDAwMDAwMjY5OCAwMDAwMCBuIAowMDAwMDAyNzQ4IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgMTIgL1Jvb3QgMTAgMCBSIC9JbmZvIDExIDAgUiA+PgpzdGFydHhyZWYKMjg3NwolJUVPRgo=";

const LIBRARY_PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Where students read: library survey 2025</title>
<link rel="canonical" href="https://example.org/library/where-students-read">
<meta name="binder-kept" content="2026-11-12">
</head>
<body>
<article>
<h1>Where students read: library survey 2025</h1>
<p>Every spring the library asks students where and how they study. This year 842 students answered, 312 of them in their first year.</p>
<h2>Most reading happens at home</h2>
<p>Two thirds of first-year students do most of their course reading at home. The library comes second, mostly in the weeks before exams. Only one in ten reads on the train or bus.</p>
<p>Students who read in the library more often print their texts: the printers are next to the study rooms, and printing there is free for the first 200 pages.</p>
<h2>Screens and paper</h2>
<ul>
<li>58% read course texts mostly on a laptop.</li>
<li>27% mostly print them.</li>
<li>11% use a tablet, and 4% a phone.</li>
</ul>
<p>Asked what would make them print more, most students named cost. A smaller group said they would read on paper if the texts came as a printed reader, as they did a few years ago.</p>
<blockquote><p>I read better on paper, but I only print what I have to hand in.</p></blockquote>
<h2>What the library will do</h2>
<p>From next term, the free print allowance goes up to 400 pages for first-year students, and the quiet reading room opens at 8 in the morning.</p>
</article>
</body>
</html>
`;

const dataUrl = (type: string, text: string) =>
  `data:${type};base64,${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}`;

/** The demo's files, by path, as the browser keeps them. */
export const SAMPLE_FILES: Record<string, string> = {
  "items/Screen or paper how first-year students read course texts.pdf": `data:application/pdf;base64,${ARTICLE_PDF}`,
  "items/Where students read library survey 2025.html": dataUrl(
    "text/html",
    LIBRARY_PAGE,
  ),
};
