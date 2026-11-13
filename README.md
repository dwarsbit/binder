<p align="center">
  <img src="assets/app-icon.svg" alt="Binder app icon" height="80">
</p>

<h1 align="center">Binder</h1>

<p align="center">
  <strong>Collect, read, understand</strong><br>
  A research binder for the sources of a thesis, a paper or a course.
</p>

<p align="center">
  <a href="https://github.com/dwarsbit/binder/actions/workflows/ci.yml"><img src="https://github.com/dwarsbit/binder/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/dwarsbit/binder?color=0F5B62" alt="License"></a>
  <a href="https://github.com/dwarsbit/binder/releases"><img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-0F5B62" alt="Platforms: macOS, Windows and Linux"></a>
</p>

<p align="center">
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="docs/guide.md">Guide</a> ·
  <a href="https://github.com/dwarsbit/binder/releases">Releases</a> ·
  <a href="https://github.com/dwarsbit/polemic">Polemic</a> ·
  <a href="https://github.com/dwarsbit/cursive">Cursive</a>
</p>

<p align="center">
  <img src="assets/readme/reading-list.png" alt="A binder called Thesis: its research question and lists in the sidebar, the reading list grouped by status, and a book with its details and notes" width="800">
</p>

Binder keeps the sources of a research project together: articles, books,
web pages, lectures, slides and your own thoughts. You write down your
research question, add what you find, and move each source from your inbox
to your reading list and on, until you know what it means for your
project. Each item has your notes on it, in blocks. A binder is a folder of
Markdown files on your computer, with the original files next to them, so
nothing is locked in.

Binder is for macOS, Windows and Linux. It is open source and part of the
Polemic kit, with [Polemic](https://github.com/dwarsbit/polemic) for
writing in LaTeX and [Cursive](https://github.com/dwarsbit/cursive) for
notes, presentations and tutorials.

Binder is in early development. This is version 0.3: collecting,
organizing and reading, with highlights in PDFs and web pages, and an
assistant on your own AI provider or a model on your computer that reads
your sources and sums them up. Asking your sources questions comes in 0.4.

## Features

- **Binders**: make a binder for each project, in the Binder folder in
  your home folder, or open any folder as one. Write down your research
  question when you make it, and change it in the sidebar.
- **Add anything**: press Cmd/Ctrl + N and paste a link, a DOI or an ISBN,
  or write down a thought. A DOI is looked up at Crossref and an ISBN at
  Open Library, so the title, authors, year and journal fill themselves
  in. Add a file, or drop files on the window: each is copied next to its
  item.
- **Zotero**: add a whole collection from the Zotero app or your library
  at zotero.org at once, or search for a work. Works already in the binder
  are left out, and each item opens in Zotero.
- **Inbox**: everything new lands in your inbox. Move each item on to your
  reading list, or set it aside, and the next one opens.
- **Reading list**: five statuses, from inbox to set aside, as a list or
  as a board. Drag a card to another column to change its status.
- **Read and highlight**: read a PDF or a web page next to your notes,
  with zoom and find. Highlight a claim, definition, method, finding or
  quote, and drag it into your notes: it keeps a link to its page. A link
  you add keeps the page's text, so you can read it without the site.
- **Assistant**: on a provider with your own key, or a model on your
  computer. It proposes each new source's details and tags, sums it up for
  your research question, says what to read closely, outlines a long
  source and proposes highlights. Every sentence links to the passage it
  rests on, checked against the source, and nothing changes until you
  accept it or take it over.
- **Notes in blocks**: write on any item, or add a note of your own, with
  the blocks of Cursive: headings, lists, quotes, callouts, tables,
  equations and `@` citations. Link items with `[[`.
- **Tags**: tag items and see every tag with its items in the sidebar.
- **Search**: Cmd/Ctrl + K searches titles, authors, journals, DOIs, tags
  and notes, and the text of every PDF and kept page. Cmd/Ctrl + F finds
  text in the open item or source.
- **Your files**: an item is a Markdown file with its details in the front
  matter, as Cursive and Obsidian read it. See [the binder format](docs/format.md).

## Develop

Binder is a Tauri app: a React front end in `src/` and a Rust back end in
`src-tauri/`. The block editor is Cursive's package `@cursive/editor`,
installed from the [cursive](https://github.com/dwarsbit/cursive)
repository and pinned to a commit in `package.json`.

### Requirements

- Node.js 22 or later and pnpm
- Rust (stable) with cargo and the
  [Tauri prerequisites](https://tauri.app/start/prerequisites/)

### Run

```bash
pnpm install
pnpm tauri dev    # the desktop app
pnpm dev          # a demo in the browser, at http://localhost:1440
```

`pnpm dev` keeps a sample binder in the browser's own storage.

### Check

CI runs the same checks on every pull request.

```bash
pnpm lint
pnpm test
pnpm build
cd src-tauri && cargo test
```

### Build

```bash
pnpm tauri build
```

### The editor package

To take a newer editor, set the commit in the `@cursive/editor` line of
`package.json` and run `pnpm install`. When the package imports a module
it didn't before, add it to `EDITOR_DEPS` in `vite.config.ts`.

### More

- `src/lib/binder.ts`: a binder and its items as Markdown files, with
  their tests
- `src/lib/store.ts`: a binder as a folder on disk, or in the browser for
  the demo
- `src/components`: the sidebar, the lists and board, an item, and the
  dialogs
- `src-tauri`: the desktop app, which reads and writes the binder's
  folder, keeps the list of binders and talks to the Zotero app
- [The binder format](docs/format.md): what Binder writes, version by
  version
- [Releasing](docs/releasing.md): how a version is built and published
- [Content style](CONTENT.md): the rules for all public text, from the
  Polemic design system. Change them there first.

## License

[GPL-3.0](LICENSE)
