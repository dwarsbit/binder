# Changelog

## 0.3.0 (unreleased)

- Let an assistant read your sources, on your own provider (Mistral, OpenAI, Anthropic or any service with the OpenAI chat API) or a model on your computer (Ollama, LM Studio). Set it up in Settings, which names where the text goes. Your key is kept in your system's credential store.
- The assistant proposes the kind, title, authors, year and tags of each new source. Change what you like and accept it, or dismiss it. Items with a proposal have a mark in the inbox.
- It sums a source up for your research question and says which parts to read closely, and outlines a long source. Every sentence links to its passage, which opens the source there. Binder checks each passage against the source and leaves out what it can't find.
- It proposes highlights, shown dashed in the reader next to your own. Keep the ones you want.
- What the assistant wrote is marked as its own and kept apart from your notes, in a file next to the item. **Take over** moves a part to your notes. See [the binder format](docs/format.md).
- Keep the assistant away from one item, or out of a whole binder.
- Fixed: adding a highlight to empty notes left an empty line above the quote.
- Fixed: a link to a page of a file with parentheses in its name broke in notes.

## 0.2.0 (2026-11-13)

- Read a PDF or a web page in Binder: choose **Read** on its item. Zoom in and out, and find text in the source with Cmd/Ctrl + F.
- Highlight text in a source as a claim, definition, method, finding or quote. The highlights are listed next to the source, and a click goes back to each one.
- Take a highlight into your notes: drag it in, or choose **Add to notes**. It becomes a quote with a link to its page, and the link opens the source there.
- A link you add in the desktop app keeps the page's text, so you can read and highlight it without the site. A link to a PDF adds the PDF. For a web page you added before, choose **Keep the page text**.
- Search finds text inside every PDF and kept page, by page, and opens the source at the match.
- Highlights are kept in a Markdown file next to their item, and go along when the item gets a new name. See [the binder format](docs/format.md).

- Make a binder for a research project and write down your research question. A binder is a folder in the Binder folder in your home folder; open any other folder as a binder too.
- Add a link, a DOI, an ISBN or a thought with Cmd/Ctrl + N. A DOI is looked up at Crossref and an ISBN at Open Library, for the title, authors, year and journal.
- Add a file from Add to binder, or drop files on the window. Each file is copied into the binder, next to its item and under the same name.
- Add a whole collection from Zotero at once, or search your Zotero library for a work. Connect the Zotero app or a zotero.org library in Settings. Works already in the binder are left out, and an item opens in Zotero from its page.
- Go through your inbox: move each new item to your reading list or set it aside, and the next one opens.
- See your reading list as a list or as a board, with a column for each status: to read, reading, processed and set aside. Drag a card to change its status.
- Write notes on an item, or add a note of your own, in the blocks of Cursive. Cite with `@` and link items with `[[`.
- Tag items, and see each tag with its items in the sidebar.
- Search the titles, details, tags and notes of every item with Cmd/Ctrl + K, and find text in the open item with Cmd/Ctrl + F.
- Rename an item by its title: its file and its original file get the new name, and links to it follow.
- Every item is a Markdown file with its details in the front matter. See [the binder format](docs/format.md).
