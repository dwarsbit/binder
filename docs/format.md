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
    ├── The reading student.md
    ├── Where students read.md
    └── Does an e-reader count as a screen.md
```

- The folder's name is the binder's name.
- `binder.md` says that the folder is a binder, and holds its research
  question.
- `items/` holds the items: one Markdown file each, with the original
  file next to it under the same name.
- Binder reads every Markdown file in the folder and the folders in it,
  so an item can live in any folder. It writes new items to `items/`.
- A folder whose name starts with a dot, such as `.git` or `.binder`, is
  left alone. Binder 0.3 will keep what it can rebuild, such as an index
  of passages, in `.binder/`.

## `binder.md`

```markdown
---
binder: 1
---

How do first-year students read for their courses, and do they read less
on screen than on paper?
```

| Property | Value                                                                               |
| -------- | ----------------------------------------------------------------------------------- |
| `binder` | The version of the format, a whole number. A folder with this property is a binder. |

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

The body is your notes on the item, in Markdown, written in Binder's
blocks. A note or a thought has no source: its body is the note.

### File names

An item's file is named after its title, without the characters a file
system refuses, and cut at 80 characters. A second item with the same
title gets a number: `Screen or paper 2.md`. When the title changes,
the file and its original file get the new name.

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

## Coming later

Later releases add to this format. Each addition is written down here
before the code that reads it.

- 0.2: highlights in a source, with their page and category, and the
  text of a web page kept with its item.
- 0.3: what the assistant proposes and writes, marked as the assistant's.
- 0.5: topics, as a property of items, highlights and notes.
