# The binder format

A binder is a folder of Markdown files with the original files next to
them. Binder reads and writes it, and any other tool can too: an item is
a Markdown file with its properties in the front matter, as Cursive and
Obsidian read them. This page says what Binder writes and what it reads.

This is version 1 of the format, used since Binder 0.1. The format may
still change before Binder 1.0. When it does, Binder brings an older
binder along the first time it opens it, and says so.

## A binder

```text
Thesis/
├── binder.md
└── items/
    ├── Screen or paper.md
    ├── Screen or paper.pdf
    ├── Screen or paper.highlights.md
    ├── Screen or paper.assistant.md
    ├── The reading student.md
    ├── Where students read.md
    ├── Where students read.html
    └── Does an e-reader count as a screen.md
```

- The folder's name is the binder's name.
- `binder.md` says that the folder is a binder, and holds its research
  question.
- `items/` holds the items: one Markdown file each, with the original
  file next to it under the same name, and the highlights in it, if
  any, in a file of their own.
- Binder reads every Markdown file in the folder and the folders in it,
  so an item can live in any folder. It writes new items to `items/`.
- A folder whose name starts with a dot, such as `.git`, is left alone.
  Binder keeps what it can rebuild in `.binder/`: see
  [What Binder can rebuild](#what-binder-can-rebuild).

## `binder.md`

```markdown
---
binder: 1
---

How do first-year students read for their courses, and do they read less
on screen than on paper?
```

| Property    | Value                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `binder`    | The version of the format, a whole number. A folder with this property is a binder.                   |
| `assistant` | `false` keeps the assistant out of this binder. Without it, the assistant is on where you set one up. |

The body is the research question, in Markdown. It can be empty.

A folder without `binder.md` opens as a binder too: Binder writes the
file when you first write down the research question.

A binder whose `binder` is higher than the version this Binder knows
opens read-only, with a message to update Binder.

## An item

```markdown
---
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

My notes on the article, in blocks, as in Cursive.
```

The front matter holds the item's properties, one line each. Binder
writes them in this order and leaves out the ones without a value. Lines
it doesn't know, such as your own properties, are kept as written.

| Property         | Value                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`          | The title. Without it, the file name is the title.                                                                                               |
| `kind`           | What the item is: `article`, `book`, `chapter`, `webpage`, `lecture`, `slides`, `note`, `thought` or `file`. Without it, the item is a `note`.   |
| `status`         | How far you are with it: `inbox`, `to-read`, `reading`, `processed` or `set-aside`. Notes have none.                                             |
| `authors`        | The authors, each as “Family, Given”, or an organization by its name.                                                                            |
| `year`           | The year it was published.                                                                                                                       |
| `published-in`   | The journal, the book a chapter is in, the proceedings or the website.                                                                           |
| `publisher`      | The publisher of a book or report.                                                                                                               |
| `doi`            | The DOI, without `https://doi.org/`.                                                                                                             |
| `isbn`           | The ISBN of a book.                                                                                                                              |
| `url`            | The address of a web page, or where the work is online.                                                                                          |
| `file`           | The original file, as a path from the item's own folder. Binder names it after the item and keeps it next to it.                                 |
| `zotero`         | The item in Zotero, as a `zotero://select/…` link that opens it there. `library` is the Zotero app's own library, `groups/<id>` a group library. |
| `zotero-version` | The version of the Zotero item when Binder last read it, so Binder can tell when it changed.                                                     |
| `tags`           | Tags, as a list.                                                                                                                                 |
| `added`          | The date the item was added, as `YYYY-MM-DD`.                                                                                                    |
| `assistant`      | `false` keeps the assistant away from this item: it doesn't read it or write about it.                                                           |

The body is your notes on the item, in Markdown, written in Binder's
blocks. A note or a thought has no source: its body is the note.

### File names

An item's file is named after its title, without the characters a file
system refuses, and cut at 80 characters. A second item with the same
title gets a number: `Screen or paper 2.md`. When the title changes,
the file, its original file and its highlights get the new name, and
links to them in notes follow.

### Kinds

| `kind`    | Shown as | What it is                                       |
| --------- | -------- | ------------------------------------------------ |
| `article` | Article  | An article in a journal, proceedings or magazine |
| `book`    | Book     | A book, or the scan of one                       |
| `chapter` | Chapter  | A chapter in an edited book                      |
| `webpage` | Web page | A page on the web, kept by its address           |
| `lecture` | Lecture  | A lecture or talk you attended                   |
| `slides`  | Slides   | The slides of a talk or a course                 |
| `note`    | Note     | A note of your own                               |
| `thought` | Thought  | A short note that belongs to no source yet       |
| `file`    | File     | Any other file                                   |

### Statuses

| `status`    | Shown as  | Meaning                                                           |
| ----------- | --------- | ----------------------------------------------------------------- |
| `inbox`     | Inbox     | New, not looked at yet. Every new source and thought starts here. |
| `to-read`   | To read   | Worth reading                                                     |
| `reading`   | Reading   | Being read                                                        |
| `processed` | Processed | Read, and what it means for the project is written down           |
| `set-aside` | Set aside | Not for this project, or not now                                  |

## A kept web page

A web page's text can be kept with its item, so it can be read and
highlighted without the site. Binder saves the page's article, without
the site's menus, ads, scripts, styles and images, as an HTML file next to
the item, and points `file` at it:

```markdown
---
title: Where students read
kind: webpage
status: to-read
url: https://example.org/where-students-read
file: Where students read.html
---
```

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Where students read</title>
    <link rel="canonical" href="https://example.org/where-students-read" />
    <meta name="binder-kept" content="2026-11-13" />
  </head>
  <body>
    <article>
      <h1>Where students read</h1>
      <p>…</p>
    </article>
  </body>
</html>
```

- The page keeps headings, paragraphs, lists, quotes, tables, code,
  emphasis and links. Links point to the web.
- `binder-kept` is the date the page was kept.
- When the link leads to a PDF, the PDF is saved instead, as the
  item's file.

## Highlights

The highlights in a source are kept next to its item, in a Markdown file
named after the item with `.highlights` before `.md`:

```markdown
---
highlights-of: Screen or paper.md
---

- **Claim** · p. 4 · “Students who read on paper remembered more of the argument.” ^k3x9q2
- **Method** · p. 2 · “We asked 1,204 first-year students at three universities.” ^b71zdm
- **Quote** · “Reading is slower on screen, but not by much.” ^q0w8ea
```

| Property        | Value                                           |
| --------------- | ----------------------------------------------- |
| `highlights-of` | The item, as a path from the highlights' folder |

Each highlight is one line of a list, in the order they were made:

- its category in bold: **Claim**, **Definition**, **Method**,
  **Finding** or **Quote**;
- `p. N`, the page in a PDF, counted from 1 as the file counts them;
  a web page has none;
- the highlighted text between “ and ”, on one line;
- `^` and its id: letters and digits, unique in the file.

Binder finds a highlight again by its text, on its page. When the text is
on the page more than once, the first one is highlighted. A line Binder
can't read is kept as written.

The highlights file is not an item: Binder doesn't show it in a list. It
moves and goes away with its item.

### A link to a page

A highlight taken into notes is a quote with a link to its place in the
source, as a Markdown link to the file with the page after `#page=`:

```markdown
> Students who read on paper remembered more of the argument.
> [Okafor and Brandt 2021, p. 4](Screen%20or%20paper.pdf#page=4&highlight=k3x9q2)
```

- `page` is the page, as in the highlights file. A web page has none.
- `highlight` is the highlight's id. Binder opens the source there, and
  at the page when the highlight is gone.
- Other apps open the file; most PDF readers go to the page.

## What the assistant wrote

What the assistant writes about an item is kept next to it, in a Markdown
file named after the item with `.assistant` before `.md`. It is the
assistant's until you take it over: Binder shows it apart from your
notes, marked as the assistant's, and nothing in it changes your item
before you accept it.

```markdown
---
assistant-of: Screen or paper.md
model: mistral-small-latest
provider: Mistral
written: 2026-11-13
proposed-kind: article
proposed-title: "Screen or paper: how first-year students read course texts"
proposed-authors: ["Okafor, Nkem", "Brandt, Sofie"]
proposed-year: 2021
proposed-tags: [survey, recall]
---

## Summary

Students who read on paper remembered more of the argument than students who read on screen. [p. 4](Screen%20or%20paper.pdf#page=4&text=students%20who%20read%20on%20paper%20remembered%20more)

## Read closely

- The comparison of recall after a week, the core of the finding. [p. 4](Screen%20or%20paper.pdf#page=4&text=after%20a%20week)

## Outline

- Introduction: why reading on screen matters for first-year students. [p. 1](Screen%20or%20paper.pdf#page=1&text=first-year%20students%20read)

## Proposed highlights

- **Finding** · p. 4 · “Students who read on paper remembered more of the argument.” ^r4k2pa
```

| Property           | Value                                               |
| ------------------ | --------------------------------------------------- |
| `assistant-of`     | The item, as a path from this file's folder         |
| `model`            | The model that wrote it                             |
| `provider`         | Where the model ran: a provider, or `this computer` |
| `written`          | The date it was written, as `YYYY-MM-DD`            |
| `proposed-kind`    | The kind the assistant proposes for the item        |
| `proposed-title`   | The title it proposes                               |
| `proposed-authors` | The authors it proposes, as a list                  |
| `proposed-year`    | The year it proposes                                |
| `proposed-tags`    | The tags it proposes, as a list                     |

The `proposed-` properties are the assistant's proposal for the item.
When you accept it, Binder writes the values to the item and takes the
lines out. A proposal that matches the item has none.

The body has up to four parts, each under its own heading. Binder reads
them by their headings and keeps any other part as written.

- **Summary**: what the source says, written for the binder's research
  question.
- **Read closely**: the parts worth reading closely, as a list.
- **Outline**: the parts of a long source, each with a line on what it
  is about.
- **Proposed highlights**: passages the assistant proposes to highlight,
  in the form of the highlights file. When you keep one, it moves to the
  highlights file.

Every sentence of the summary and every line of the other parts ends in
a link to its passage: the source file with the page after `#page=` and
the words it rests on after `text=`. Binder checks each passage
against the text of the source before it writes the file, and leaves out
what has none. A link opens the source at the passage. Other apps open
the file; most PDF readers go to the page.

When you take a part over, it moves to your notes on the item, without
the mark, and is yours. The file goes away when nothing is left in it.
Like the highlights file, it is not an item, and it moves and goes away
with its item.

## What Binder can rebuild

`.binder/` holds what Binder works out from the files in the binder, so
it doesn't have to again. Deleting it loses nothing: Binder builds it
again. Leave it out when you share or back up a binder.

| File                | What it holds                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `.binder/text.json` | The text of each PDF and kept web page, by page, for search. Each file's text is kept with its checksum. |

The assistant finds passages in this text: Binder cuts each page into
passages of a few sentences and looks them up on your computer, so it
doesn't need a file of its own.

## Coming later

Later releases add to this format. Each addition is written down here
before the code that reads it.

- 0.5: topics, as a property of items, highlights and notes.
