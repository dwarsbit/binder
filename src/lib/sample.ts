import type { Project } from "@cursive/editor/lib/paths";
import { newItemSource, writeBinderInfo, type NewItem } from "./binder";
import { highlightLine, placeHref, writeHighlights } from "./highlights";
import { writeAssistant } from "./assistant/file";
import { SAMPLE_FILES } from "./sample-files";

/**
 * The demo binder that `pnpm dev` opens in a browser: a student's thesis
 * on how first-year students read, with sources in every status, a
 * thought and a note.
 */
const ITEMS: Array<NewItem & { path: string; added: string }> = [
  {
    path: "items/Screen or paper how first-year students read course texts.md",
    added: "2026-11-12",
    title: "Screen or paper: how first-year students read course texts",
    kind: "article",
    status: "inbox",
    authors: ["Okafor, Nkem", "Brandt, Sofie"],
    year: "2021",
    publishedIn: "Journal of Higher Education Research",
    doi: "10.1000/jher.2021.0042",
    file: "Screen or paper how first-year students read course texts.pdf",
    tags: ["survey", "laptops", "printing"],
  },
  {
    path: "items/Reading compliance in the first year.md",
    added: "2026-11-12",
    title: "Reading compliance in the first year",
    kind: "article",
    status: "inbox",
    authors: ["Hartman, Lea"],
    year: "2019",
    publishedIn: "Teaching in Higher Education",
    tags: ["compliance"],
  },
  {
    path: "items/Where students read library survey 2025.md",
    added: "2026-11-12",
    title: "Where students read: library survey 2025",
    kind: "webpage",
    status: "inbox",
    publishedIn: "University Library",
    url: "https://example.org/library/where-students-read",
    file: "Where students read library survey 2025.html",
    tags: ["survey"],
  },
  {
    path: "items/Does an e-reader count as a screen.md",
    added: "2026-11-12",
    title: "Does an e-reader count as a screen?",
    kind: "thought",
    markdown:
      "Ask my supervisor. Okafor and Brandt only asked about laptops and paper.\n",
  },
  {
    path: "items/Time on text a diary study of course reading.md",
    added: "2026-11-10",
    title: "Time on text: a diary study of course reading",
    kind: "article",
    status: "to-read",
    authors: ["Petrov, Ivan", "Nair, Anjali"],
    year: "2020",
    publishedIn: "Studies in Higher Education",
    tags: ["diary study", "methods"],
  },
  {
    path: "items/Annotating on a tablet what students mark and why.md",
    added: "2026-11-10",
    title: "Annotating on a tablet: what students mark and why",
    kind: "article",
    status: "to-read",
    authors: ["Visser, Maren"],
    year: "2022",
    publishedIn: "Computers & Education",
    tags: ["annotation", "tablets"],
  },
  {
    path: "items/The reading student.md",
    added: "2026-11-08",
    title: "The reading student",
    kind: "book",
    status: "reading",
    authors: ["de Boer, Anna"],
    year: "2018",
    publisher: "Amsterdam University Press",
    isbn: "9789462981234",
    tags: ["first year"],
    markdown: `Chapter 3 is the one on course texts. De Boer separates **reading to know** from **reading to pass**, and says first-year students mostly do the second.

- Ask whether the survey in Okafor and Brandt can tell the two apart.
- Her numbers are from 2015, before the laptop rule.
`,
  },
  {
    path: "items/Reading in a second language.md",
    added: "2026-11-08",
    title: "Reading in a second language",
    kind: "article",
    status: "reading",
    authors: ["Lee, Min"],
    year: "2020",
    publishedIn: "Reading Research Quarterly",
    tags: ["first year"],
  },
  {
    path: "items/Skimming scanning and deep reading.md",
    added: "2026-11-05",
    title: "Skimming, scanning and deep reading",
    kind: "chapter",
    status: "processed",
    authors: ["Lindqvist, Karin"],
    year: "2017",
    publishedIn: "Reading in the Digital Age",
    tags: ["methods"],
    markdown: `Three ways of reading, with a test for each. I use her definition of deep reading in chapter 2 of the thesis.

> Deep reading is reading that changes what you will do with the next text.
`,
  },
  {
    path: "items/Guest lecture How students read now.md",
    added: "2026-11-10",
    title: "Guest lecture: How students read now",
    kind: "lecture",
    status: "processed",
    authors: ["Moreno, Lucía"],
    year: "2026",
    tags: ["laptops"],
    markdown:
      "Moreno: most students read on their phone on the way to class, and say they don't count that as reading.\n",
  },
  {
    path: "items/Speed reading apps.md",
    added: "2026-11-03",
    title: "Speed reading apps",
    kind: "webpage",
    status: "set-aside",
    url: "https://example.org/speed-reading",
    markdown: "Not about course texts.\n",
  },
  {
    path: "items/Questions for my supervisor.md",
    added: "2026-11-11",
    title: "Questions for my supervisor",
    kind: "note",
    markdown: `- Does an e-reader count as a screen?
- Can I use the library survey, or is it too small?
- See [[The reading student]], chapter 3.

> “We did not ask about e-readers, which few students in our sample owned.” [Okafor and Brandt 2021, p. 3](Screen%20or%20paper%20how%20first-year%20students%20read%20course%20texts.pdf#page=3)
`,
  },
];

const SURVEY = "items/Where students read library survey 2025.md";
/** A link from the survey's item to the words of a passage in its kept page. */
const inSurvey = (text: string) =>
  `[passage](${placeHref("items", {
    file: "items/Where students read library survey 2025.html",
    page: null,
    highlight: null,
    text,
  })})`;

/** What a model on the student's computer wrote about the library survey. */
const SURVEY_NOTE = writeAssistant(SURVEY, {
  model: "llama3.2",
  provider: "this computer",
  written: "2026-11-12",
  proposal: { tags: ["printing", "first year"] },
  parts: [
    {
      id: "summary",
      heading: "Summary",
      markdown: [
        `The library asked students where and how they study; 842 answered, 312 of them in their first year. ${inSurvey("This year 842 students answered, 312 of them in their first year")}`,
        `Most first-year students read for their courses at home. ${inSurvey("Two thirds of first-year students do most of their course reading at home")}`,
        `Most read on a laptop, and about a quarter print their texts. ${inSurvey("58% read course texts mostly on a laptop")} ${inSurvey("27% mostly print them")}`,
        `Cost keeps students from printing more. ${inSurvey("most students named cost")}`,
      ].join(" "),
    },
    {
      id: "read-closely",
      heading: "Read closely",
      markdown: `- The students who would read on paper if the texts came as a printed reader: close to your question about screen and paper. ${inSurvey("A smaller group said they would read on paper if the texts came as a printed reader")}`,
    },
    {
      id: "highlights",
      heading: "Proposed highlights",
      markdown: [
        highlightLine({
          id: "s4m1pa",
          category: "finding",
          page: null,
          text: "Students who read in the library more often print their texts",
        }),
        highlightLine({
          id: "q8t2vb",
          category: "quote",
          page: null,
          text: "I read better on paper, but I only print what I have to hand in.",
        }),
      ].join("\n"),
    },
  ],
});

export const SAMPLE_BINDER: Project = {
  name: "Thesis",
  folders: ["items"],
  pages: {
    "binder.md": writeBinderInfo(
      undefined,
      "How do first-year students read for their courses, and do they read less on screen than on paper?",
    ),
    ...Object.fromEntries(
      ITEMS.map(({ path, added, ...item }) => [path, newItemSource(item, added)]),
    ),
    "items/Where students read library survey 2025.assistant.md": SURVEY_NOTE,
    "items/Screen or paper how first-year students read course texts.highlights.md":
      writeHighlights(
        "items/Screen or paper how first-year students read course texts.md",
        [
          {
            id: "k3x9q2",
            category: "finding",
            page: 1,
            text: "Students who read on paper remembered more of the argument, while students who read on screen remembered as many facts.",
          },
          {
            id: "b71zdm",
            category: "method",
            page: 2,
            text: "We asked 1,204 first-year students at three universities to keep a reading log for eight weeks.",
          },
        ],
      ),
  },
  files: Object.keys(SAMPLE_FILES).sort(),
};

export { SAMPLE_FILES };
