import { LayoutGrid, Library, List, PanelLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AddDialog } from "@/components/AddDialog";
import { Board, ItemList } from "@/components/ItemList";
import { ItemView } from "@/components/ItemView";
import { Reader, type ReaderTarget } from "@/components/Reader";
import { FindBar, SearchDialog } from "@/components/Search";
import { SettingsDialog } from "@/components/SettingsDialog";
import { clampWidth, Sidebar } from "@/components/Sidebar";
import { ZoteroDialog } from "@/components/ZoteroDialog";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { HEADER_BUTTON } from "@cursive/editor/components/Dialog";
import { Editor } from "@cursive/editor/components/Editor";
import { cn } from "@cursive/editor/lib/cn";
import { openFind } from "@cursive/editor/lib/find";
import {
  backlinks,
  linkablePages,
  linkIndex,
  retargetLinks,
} from "@cursive/editor/lib/links";
import { readPage, writePage } from "@cursive/editor/lib/page-file";
import {
  ATTACHMENTS,
  baseName,
  join,
  parentOf,
  type Project,
} from "@cursive/editor/lib/paths";
import { dragWindow, openExternal } from "@cursive/editor/lib/platform";
import { WorkspaceProvider, type Workspace } from "@cursive/editor/lib/workspace";
import { ReferencesProvider } from "@cursive/editor/references/context";
import { lookUp, lookupOf } from "@cursive/editor/references/lookup";
import {
  zoteroReference,
  type ZoteroItem,
  type ZoteroLibrary,
} from "@cursive/editor/references/zotero";
import {
  authorsShort,
  BINDER_FILE,
  extensionOf,
  FORMAT,
  freeItemPath,
  ITEMS,
  itemsOf,
  kindOfFile,
  newItemSource,
  readBinderInfo,
  readItem,
  setProperties,
  sortItems,
  tagCounts,
  thoughtTitle,
  titleOfFile,
  today,
  writeBinderInfo,
  zoteroKeyOf,
  zoteroLink,
  type Item,
  type ItemChanges,
  type NewItem,
  type Status,
} from "@/lib/binder";
import {
  inView,
  itemOfReference,
  searchablePages,
  titleOfUrl,
  urlOf,
  viewCounts,
  viewKey,
  viewOfKey,
  viewTitle,
  type View,
} from "@/lib/items";
import {
  loadLayout,
  loadSidebarWidth,
  loadView,
  saveLayout,
  saveSidebarWidth,
  saveView,
} from "@/lib/prefs";
import {
  highlightsPathOf,
  newHighlightId,
  placeHref,
  placeOfHref,
  readHighlights,
  retargetFileLinks,
  writeHighlights,
  type Highlight,
} from "@/lib/highlights";
import { removeFrom, renameIn, type BinderStore } from "@/lib/store";
import { isPdf, isReadable, normalize, updateIndex, type TextIndex } from "@/lib/text";
import { keepPage } from "@/lib/webpage";

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The address of a link clicked in notes: a link, or a file the editor
 * shows by its name. Null for anything else.
 */
function hrefAt(target: Element): string | null {
  const link = target.closest?.(".doc a[href]");
  if (link) return link.getAttribute("href");
  const file = target.closest?.(".doc .node-attachment");
  const dom = file?.closest(".ProseMirror") as
    (Element & { editor?: TiptapEditor }) | null;
  const editor = dom?.editor;
  if (!file || !editor) return null;
  let href: string | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (href !== null) return false;
    if (node.type.name === "attachment" && editor.view.nodeDOM(pos) === file) {
      href = String(node.attrs.href);
    }
    return true;
  });
  return href;
}

/** The view an item lives in: where it opens when it isn't in the one shown. */
const homeOf = (item: Item): View =>
  item.status === "inbox"
    ? { kind: "inbox" }
    : item.kind === "note" || item.kind === "thought"
      ? { kind: "notes" }
      : { kind: "reading" };

/** What the status bar says when everything is saved. */
const SAVED: Record<BinderStore["place"], string> = {
  disk: "Saved on this computer",
  browser: "Saved in this browser",
};

/** What deleting an item does, said before it happens. */
function deleteQuestion(item: Item, place: BinderStore["place"]): string {
  const what = item.file
    ? "The item, its notes and its file are"
    : "The item and its notes are";
  return place === "disk"
    ? `${what} moved to the trash on your computer.`
    : `${what} removed from this binder. You can't undo this.`;
}

/** Whether the window is wide enough to show a list and an item side by side. */
const wide = () => window.matchMedia("(min-width: 861px)").matches;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A free path for a file in `dir`: "photo.png", then "photo 2.png". */
function freeFilePath(project: Project, dir: string, name: string): string {
  const taken = new Set(
    [...(project.files ?? []), ...Object.keys(project.pages)].map((p) =>
      p.toLowerCase(),
    ),
  );
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const path = join(dir, `${n === 1 ? stem : `${stem} ${n}`}${extension}`);
    if (!taken.has(path.toLowerCase())) return path;
  }
}

/** The file part of a path without its extension. */
const stemOf = (path: string) => baseName(path).replace(/\.[^.]*$/, "");

export default function App({
  store,
  onSwitchBinder,
  onRenameBinder,
}: {
  store: BinderStore;
  /** Opens another binder, where the app can. */
  onSwitchBinder?: () => void;
  /** Gives the binder another name, where the app can. Rejects with why not. */
  onRenameBinder?: (name: string) => Promise<void>;
}) {
  const [project, setProject] = useState<Project | null>(null);
  // The binder as of the last change, also before the screen shows it.
  const fresh = useRef<Project | null>(null);
  const commit = (next: Project) => {
    fresh.current = next;
    setProject(next);
  };
  const [view, setView] = useState<View>(() => viewOfKey(loadView()));
  const [selected, setSelected] = useState<string | null>(null);
  // Counts the times an item was opened: each one starts a fresh editor.
  const [opened, setOpened] = useState(0);
  const [layout, setLayout] = useState(loadLayout);
  const [filesVersion, setFilesVersion] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [zotero, setZotero] = useState(false);
  const [settings, setSettings] = useState(false);
  const [searching, setSearching] = useState<string | null>(null);
  const [finding, setFinding] = useState<{ text: string; replace: boolean } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [dropping, setDropping] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampWidth(loadSidebarWidth()),
  );
  const focusEditor = useRef<(() => void) | null>(null);
  const focusEditorEnd = useRef<(() => void) | null>(null);
  const titleInput = useRef<HTMLTextAreaElement>(null);
  // The source being read, and where in it.
  const [reading, setReading] = useState<{ path: string; target: ReaderTarget } | null>(
    null,
  );
  const notesEditor = useRef<TiptapEditor | null>(null);
  const [textIndex, setTextIndex] = useState<TextIndex | null>(null);
  const [keeping, setKeeping] = useState(false);
  // The open item's title and path as links last knew them.
  const linked = useRef<{ path: string; title: string } | null>(null);

  useEffect(() => {
    let current = true;
    store.load().then(
      (loaded) => current && commit(loaded),
      (error: unknown) => current && setProblem(messageOf(error)),
    );
    return () => {
      current = false;
    };
  }, [store]);

  /** Runs a change in the store and says so when it fails. */
  const persist = (work: Promise<void>) =>
    work.then(
      () => setProblem(null),
      (error: unknown) => setProblem(messageOf(error)),
    );

  const items = useMemo(() => (project ? sortItems(itemsOf(project)) : []), [project]);
  const info = useMemo(
    () => (project ? readBinderInfo(project) : { format: FORMAT, question: "" }),
    [project],
  );
  const shown = useMemo(
    () => items.filter((item) => inView(item, view)),
    [items, view],
  );
  const counts = useMemo(() => viewCounts(items), [items]);
  const tags = useMemo(() => tagCounts(items), [items]);
  const source = project && selected ? (project.pages[selected] ?? null) : null;
  const item = useMemo(
    () => (selected && source !== null ? readItem(selected, source) : null),
    [selected, source],
  );
  const board = view.kind === "reading" && layout === "board";

  // Links name the open item by its title as it was when it was opened.
  useEffect(() => {
    const source = selected ? fresh.current?.pages[selected] : undefined;
    if (!selected || source === undefined || linked.current?.path === selected) return;
    linked.current = { path: selected, title: readPage(source).title.trim() };
  }, [selected]);

  // A wide window shows the first item of a list next to it.
  if (project && !board && !selected && shown.length && wide()) {
    setSelected(shown[0].path);
    setOpened((n) => n + 1);
  }

  useEffect(() => {
    document.title = project ? `${project.name} · Binder` : "Binder";
  }, [project]);

  /** Writes a page of the binder. */
  const writeSource = (path: string, next: string) => {
    const latest = fresh.current;
    if (!latest || latest.pages[path] === next) return;
    commit({ ...latest, pages: { ...latest.pages, [path]: next } });
    void persist(store.writePage(path, next));
  };

  /** Writes the pages whose links to a page that moved or got a new title must change. */
  const relink = (
    current: Project,
    before: Record<string, string>,
    from: string,
    to: string,
  ): Project => {
    const writes = retargetLinks(before, current.pages, from, to);
    if (!writes.length) return current;
    const next = {
      ...current,
      pages: { ...current.pages, ...Object.fromEntries(writes) },
    };
    commit(next);
    for (const [file, text] of writes) void persist(store.writePage(file, text));
    return next;
  };

  /** After the open item got another title or path: links in notes name it the new way. */
  const retitleLinks = (current: Project, path: string): Project => {
    const known = linked.current;
    if (!known || !(path in current.pages)) return current;
    const title = readPage(current.pages[path]).title.trim();
    linked.current = { path, title };
    if (!known.title || (known.path === path && known.title === title)) return current;
    const before = { ...current.pages };
    delete before[path];
    before[known.path] = writePage({
      ...readPage(current.pages[path]),
      title: known.title,
    });
    return relink(current, before, known.path, path);
  };

  /**
   * Names the open item's file after its title, once the title is
   * typed; its original file gets the same name. Returns the binder as
   * it is after that.
   */
  const syncFileName = (): Project | null => {
    const current = fresh.current;
    if (!current || !selected || !(selected in current.pages)) return current;
    const page = readPage(current.pages[selected]);
    if (!page.title.trim()) return retitleLinks(current, selected);
    const own = readItem(selected, current.pages[selected]);
    // The original file goes along when it is named as the item is.
    const carried =
      own.file &&
      parentOf(own.file) === parentOf(selected) &&
      stemOf(own.file) === stemOf(selected) &&
      (current.files ?? []).includes(own.file)
        ? own.file
        : null;
    const { path, file } = freeItemPath(
      current,
      page.title,
      carried ? extensionOf(carried) : "",
      parentOf(selected),
      selected,
    );
    if (path === selected) return retitleLinks(current, selected);
    let next = renameIn(current, selected, path);
    void persist(store.rename(selected, path));
    // The highlights go along, and say whose they are.
    const marks = highlightsPathOf(selected);
    if (marks in next.pages) {
      const moved = highlightsPathOf(path);
      next = renameIn(next, marks, moved);
      void persist(store.rename(marks, moved));
      const text = writeHighlights(
        path,
        readHighlights(next.pages[moved]).highlights,
        next.pages[moved],
      );
      next = { ...next, pages: { ...next.pages, [moved]: text } };
      void persist(store.writePage(moved, text));
    }
    if (carried && file && file !== carried) {
      next = renameIn(next, carried, file);
      void persist(store.rename(carried, file));
      const moved = setProperties(next.pages[path], { file: baseName(file) });
      next = { ...next, pages: { ...next.pages, [path]: moved } };
      void persist(store.writePage(path, moved));
      // Links to places in the file follow it.
      const writes = retargetFileLinks(next.pages, carried, file);
      if (writes.length) {
        next = { ...next, pages: { ...next.pages, ...Object.fromEntries(writes) } };
        for (const [page, text] of writes) void persist(store.writePage(page, text));
      }
      setFilesVersion((n) => n + 1);
    }
    commit(next);
    setSelected(path);
    next = relink(next, current.pages, selected, path);
    return retitleLinks(next, path);
  };

  const open = (path: string | null) => {
    setReading(null);
    if (path !== selected) {
      syncFileName();
      setSelected(path);
      setOpened((n) => n + 1);
    }
    setNavOpen(false);
  };

  const showView = (next: View) => {
    syncFileName();
    setReading(null);
    setView(next);
    saveView(viewKey(next));
    setSelected(null);
    setOpened((n) => n + 1);
    setNavOpen(false);
  };

  /** Changes an item's properties. An item that leaves the open list makes way for the next. */
  const changeItem = (path: string, changes: ItemChanges) => {
    const latest = fresh.current;
    const current = latest?.pages[path];
    if (current === undefined) return;
    const next = setProperties(current, changes);
    writeSource(path, next);
    const before = readItem(path, current);
    const after = readItem(path, next);
    if (path === selected && inView(before, view) && !inView(after, view) && !board) {
      const at = shown.findIndex((entry) => entry.path === path);
      const following = shown[at + 1] ?? shown[at - 1] ?? null;
      setSelected(following?.path ?? null);
      setOpened((n) => n + 1);
    }
  };

  const setStatus = (path: string, status: Status) => changeItem(path, { status });

  /** Adds an item, with its original file next to it. Gives its path. */
  const addItem = async (
    entry: NewItem,
    options: {
      data?: Blob;
      /** A web address to save the file from, in place of `data`. */
      download?: string;
      extension?: string;
      openIt?: boolean;
    } = {},
  ): Promise<string | null> => {
    const current = fresh.current;
    if (!current) return null;
    const { path, file } = freeItemPath(current, entry.title, options.extension ?? "");
    if (options.data && file) {
      await store.writeFile(file, options.data);
    } else if (options.download && file && store.download) {
      await store.download(options.download, file);
      options = { ...options, data: new Blob() };
    }
    const latest = fresh.current ?? current;
    const text = newItemSource({
      ...entry,
      file: file && options.data ? baseName(file) : entry.file,
    });
    commit({
      ...latest,
      folders: latest.folders.includes(ITEMS)
        ? latest.folders
        : [...latest.folders, ITEMS],
      pages: { ...latest.pages, [path]: text },
      files:
        file && options.data ? [...(latest.files ?? []), file].sort() : latest.files,
    });
    if (file && options.data) setFilesVersion((n) => n + 1);
    await store.writePage(path, text);
    if (options.openIt) {
      syncFileName();
      setSelected(path);
      setOpened((n) => n + 1);
    }
    return path;
  };

  /** Adds files as items in the inbox, each next to its own item. */
  const addFileItems = async (files: File[]) => {
    let first: string | null = null;
    for (const file of files) {
      try {
        const path = await addItem(
          { title: titleOfFile(file.name) || "Untitled", kind: kindOfFile(file.name) },
          { data: file, extension: extensionOf(file.name) },
        );
        first ??= path;
        setProblem(null);
      } catch (error) {
        setProblem(messageOf(error));
      }
    }
    if (first) {
      if (view.kind !== "inbox") showView({ kind: "inbox" });
      setSelected(first);
      setOpened((n) => n + 1);
    }
  };

  /** Adds what was typed in Add to binder: a DOI, an ISBN, a link or a thought. */
  const addText = async (text: string) => {
    const lookup = lookupOf(text);
    let path: string | null;
    if (lookup) {
      const duplicate = items.find((entry) =>
        lookup.kind === "doi"
          ? entry.doi.toLowerCase() === lookup.id.toLowerCase()
          : entry.isbn.replace(/-/g, "") === lookup.id,
      );
      if (duplicate) {
        throw new Error(`This work is in the binder already: “${duplicate.title}”.`);
      }
      const ref = await lookUp(lookup, []);
      if (!ref) {
        throw new Error(
          lookup.kind === "doi"
            ? "Crossref knows no work with this DOI. Check it, or add the work as a link."
            : "Open Library knows no book with this ISBN. Check it, or add the book as a note.",
        );
      }
      path = await addItem(itemOfReference(ref, lookup));
    } else {
      const url = urlOf(text);
      if (url && !/\s/.test(text.trim())) {
        path = await addLink(url);
      } else {
        const title = thoughtTitle(text);
        const lines = text.trim().split(/\r?\n/);
        const rest = title.endsWith("…")
          ? text.trim()
          : lines.slice(1).join("\n").trim();
        path = await addItem({
          title,
          kind: "thought",
          markdown: rest ? `${rest}\n` : "",
        });
      }
    }
    if (path) {
      if (view.kind !== "inbox") showView({ kind: "inbox" });
      setSelected(path);
      setOpened((n) => n + 1);
    }
  };

  /**
   * Fetches a web address for the binder, where the app can: a page as
   * its article, a PDF as the file. Null when there is nothing to keep.
   */
  const fetchForBinder = async (
    url: string,
  ): Promise<
    { kind: "page"; title: string; html: string } | { kind: "pdf"; url: string } | null
  > => {
    if (!store.fetchWeb) return null;
    const fetched = await store.fetchWeb(url);
    if (fetched.contentType === "application/pdf")
      return { kind: "pdf", url: fetched.url };
    if (!fetched.html) return null;
    const kept = keepPage(fetched.html, fetched.url, today());
    return kept ? { kind: "page", title: kept.title, html: kept.html } : null;
  };

  /** Adds a link: with the page's text, or its PDF, when the app can fetch it. */
  const addLink = async (url: string): Promise<string | null> => {
    const found = await fetchForBinder(url).catch(() => null);
    if (found?.kind === "page") {
      return addItem(
        { title: found.title || titleOfUrl(url), kind: "webpage", url },
        { data: new Blob([found.html], { type: "text/html" }), extension: ".html" },
      );
    }
    if (found?.kind === "pdf") {
      return addItem(
        { title: titleOfUrl(url), kind: "article", url },
        { download: found.url, extension: ".pdf" },
      ).catch(() => addItem({ title: titleOfUrl(url), kind: "webpage", url }));
    }
    return addItem({ title: titleOfUrl(url), kind: "webpage", url });
  };

  /** Keeps the text of an item's web page next to it, or the PDF behind its link. */
  const keepWebPage = async (entry: Item) => {
    setKeeping(true);
    try {
      const found = await fetchForBinder(entry.url);
      if (!found) throw new Error("This page has no article to keep.");
      const extension = found.kind === "pdf" ? ".pdf" : ".html";
      const file = entry.path.replace(/\.md$/i, extension);
      if (found.kind === "pdf") {
        if (!store.download) return;
        await store.download(found.url, file);
      } else {
        await store.writeFile(file, new Blob([found.html], { type: "text/html" }));
      }
      const latest = fresh.current;
      if (latest && !(latest.files ?? []).includes(file)) {
        commit({ ...latest, files: [...(latest.files ?? []), file].sort() });
      }
      setFilesVersion((n) => n + 1);
      changeItem(entry.path, { file: baseName(file) });
      setProblem(null);
    } catch (error) {
      setProblem(`The page wasn't kept. ${messageOf(error)}`);
    } finally {
      setKeeping(false);
    }
  };

  /** Shows an item, in the view it lives in when the one shown hasn't got it. */
  const showItem = (path: string) => {
    const found = itemsOf(fresh.current ?? { name: "", folders: [], pages: {} }).find(
      (entry) => entry.path === path,
    );
    if (found && !inView(found, view)) {
      const home = homeOf(found);
      setView(home);
      saveView(viewKey(home));
    }
    if (path !== selected) open(path);
  };

  /** Opens an item's source in the reader, at a page, a highlight or a text to find. */
  const readSource = (
    path: string,
    place: Omit<ReaderTarget, "nonce"> = { page: null, highlight: null, find: null },
  ) => {
    showItem(path);
    setFinding(null);
    setReading((current) => ({
      path,
      target: { ...place, nonce: (current?.target.nonce ?? 0) + 1 },
    }));
  };

  /** A link in notes to a place in a source opens the reader there. */
  const followPlace = (event: React.MouseEvent, from: string) => {
    // A link with text selected in it is being edited, not followed.
    const target = event.target as Element;
    const href = hrefAt(target);
    if (href === null) return;
    if (target.closest?.("a[href]") && !window.getSelection()?.isCollapsed) return;
    const place = placeOfHref(parentOf(from), href);
    if (!place || !isReadable(place.file)) return;
    const owner = items.find((entry) => entry.file === place.file);
    if (!owner) return;
    event.preventDefault();
    event.stopPropagation();
    readSource(owner.path, {
      page: place.page,
      highlight: place.highlight,
      find: null,
    });
  };

  /** Changes the highlights of an item. */
  const changeHighlights = (
    itemPath: string,
    change: (list: Highlight[]) => Highlight[],
  ) => {
    const latest = fresh.current;
    if (!latest) return;
    const path = highlightsPathOf(itemPath);
    const before = latest.pages[path];
    writeSource(
      path,
      writeHighlights(itemPath, change(readHighlights(before).highlights), before),
    );
  };

  /** A highlight as a quote in notes, with a link back to its place. */
  const quoteOf = (entry: Item, highlight: Highlight) => {
    const label =
      [authorsShort(entry.authors) || entry.title, entry.year]
        .filter(Boolean)
        .join(" ") + (highlight.page ? `, p. ${highlight.page}` : "");
    const href = placeHref(parentOf(entry.path), {
      file: entry.file ?? "",
      page: highlight.page,
      highlight: highlight.id,
    });
    return {
      html: `<blockquote><p>“${escapeHtml(highlight.text)}” <a href="${escapeHtml(href)}">${escapeHtml(label)}</a></p></blockquote>`,
      text: `> “${highlight.text}” [${label}](${href})`,
    };
  };

  /** Adds a note and puts the caret in its title. */
  const addNote = async (title = "") => {
    const path = await addItem({ title: title || "Untitled", kind: "note" }).catch(
      (error: unknown) => {
        setProblem(messageOf(error));
        return null;
      },
    );
    if (!path) return;
    if (!title) {
      // The title is typed on the page: the file is named after it then.
      const latest = fresh.current;
      if (latest) {
        const blank = writePage({ ...readPage(latest.pages[path]), title: "" });
        writeSource(path, blank);
      }
    }
    if (view.kind !== "notes") {
      setView({ kind: "notes" });
      saveView("notes");
    }
    setSelected(path);
    setOpened((n) => n + 1);
    setNavOpen(false);
    requestAnimationFrame(() =>
      title ? focusEditor.current?.() : titleInput.current?.focus(),
    );
  };

  /** Adds works from Zotero to the inbox, skipping the ones in the binder. Gives how many. */
  const addFromZotero = async (
    library: ZoteroLibrary,
    works: ZoteroItem[],
  ): Promise<number> => {
    let count = 0;
    for (const work of works) {
      if (inBinder(library.id, work.key)) continue;
      const ref = zoteroReference(work, library.id, []);
      await addItem({
        ...itemOfReference(ref),
        zotero: zoteroLink(library.id, work.key),
        zoteroVersion: work.version,
      });
      count += 1;
    }
    if (count && view.kind !== "inbox") showView({ kind: "inbox" });
    return count;
  };

  const zoteroKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of items) {
      const key = entry.zotero ? zoteroKeyOf(entry.zotero) : null;
      if (key)
        keys.add(
          `${entry.zotero.includes("/groups/") ? entry.zotero.split("/")[4] : ""}/${key}`,
        );
    }
    return keys;
  }, [items]);
  const inBinder = useCallback(
    (library: string, key: string) => {
      const group = /^groups\/(\d+)$/.exec(library)?.[1] ?? "";
      return zoteroKeys.has(`${group}/${key}`);
    },
    [zoteroKeys],
  );

  const remove = (entry: Item) => {
    const current = fresh.current;
    if (!current) return;
    let next = removeFrom(current, entry.path);
    void persist(store.remove(entry.path));
    const ownFile =
      entry.file &&
      stemOf(entry.file) === stemOf(entry.path) &&
      (current.files ?? []).includes(entry.file);
    if (ownFile && entry.file) {
      next = removeFrom(next, entry.file);
      void persist(store.remove(entry.file));
    }
    const marks = highlightsPathOf(entry.path);
    if (marks in current.pages) {
      next = removeFrom(next, marks);
      void persist(store.remove(marks));
    }
    if (reading?.path === entry.path) setReading(null);
    commit(next);
    if (selected === entry.path) {
      const at = shown.findIndex((other) => other.path === entry.path);
      const following = board ? null : (shown[at + 1] ?? shown[at - 1] ?? null);
      setSelected(following?.path ?? null);
      setOpened((n) => n + 1);
    }
  };

  const setQuestion = (question: string) => {
    const latest = fresh.current;
    if (!latest) return;
    writeSource(BINDER_FILE, writeBinderInfo(latest.pages[BINDER_FILE], question));
  };

  /** Adds files pasted or dropped into notes to the binder's attachments folder. */
  const addAttachments = async (files: File[]): Promise<string[]> => {
    const paths: string[] = [];
    for (const file of files) {
      const current = fresh.current;
      if (!current) break;
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ")
        .replace(/:/g, ".");
      const name = /^image\.\w+$/i.test(file.name)
        ? `Pasted image ${stamp}${file.name.slice(file.name.lastIndexOf("."))}`
        : file.name || `File ${stamp}`;
      const path = freeFilePath(current, ATTACHMENTS, name);
      try {
        await store.writeFile(path, file);
      } catch (error) {
        setProblem(messageOf(error));
        continue;
      }
      const latest = fresh.current ?? current;
      commit({ ...latest, files: [...(latest.files ?? []), path].sort() });
      paths.push(path);
    }
    if (paths.length) setFilesVersion((n) => n + 1);
    return paths;
  };

  const openFile = (path: string) =>
    void store.openFile(path).catch((error: unknown) => setProblem(messageOf(error)));

  // Keys: Cmd/Ctrl + N adds, Cmd/Ctrl + K searches, Cmd/Ctrl + F finds in the open item.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        setAdding(true);
      } else if (key === "k" || (key === "f" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        const selection = window.getSelection()?.toString().trim() ?? "";
        setSearching(selection.includes("\n") ? "" : selection);
      } else if (key === "f" && reading) {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new Event("binder:find-in-source"));
      } else if (key === "f" && item) {
        event.preventDefault();
        event.stopPropagation();
        const selection = window.getSelection()?.toString().trim() ?? "";
        openFind(selection && !selection.includes("\n") ? selection : undefined);
      }
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // The find bar opens on request: from the keys, or from the search.
  useEffect(() => {
    const show = (event: Event) => {
      const { text, replace } = (
        event as CustomEvent<{ text?: string; replace?: boolean }>
      ).detail;
      setFinding((current) => ({
        text: text ?? current?.text ?? "",
        replace: Boolean(replace) || Boolean(current?.replace),
      }));
    };
    window.addEventListener("cursive:find", show);
    return () => window.removeEventListener("cursive:find", show);
  }, []);

  // The citation menu asks for the settings when Zotero isn't set up.
  useEffect(() => {
    const show = () => setSettings(true);
    window.addEventListener("cursive:settings", show);
    return () => window.removeEventListener("cursive:settings", show);
  }, []);

  // Files dropped on the window, outside the notes, become items.
  const dropFiles = useRef<(files: File[]) => void>(() => {});
  useEffect(() => {
    dropFiles.current = (files) => void addFileItems(files);
  });
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
      setDropping(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      depth = 0;
      setDropping(false);
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) dropFiles.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const pages = project?.pages;
  const files = project?.files;
  const pageList = useMemo(
    () =>
      linkablePages({ name: "", folders: [], pages: pages ?? {} }).filter(
        (p) => p.path !== BINDER_FILE && !p.path.endsWith(".highlights.md"),
      ),
    [pages],
  );
  const index = useMemo(() => linkIndex(pages ?? {}), [pages]);
  const linkedFrom = useMemo(
    () => (pages && selected ? backlinks(pages, selected) : []),
    [pages, selected],
  );
  const fileSet = useMemo(() => new Set(files ?? []), [files]);
  const latest = useRef({ open, addNote, addAttachments });
  useEffect(() => {
    latest.current = { open, addNote, addAttachments };
  });
  const workspace = useMemo<Workspace>(
    () => ({
      pages: pageList,
      index,
      active: selected,
      openPage: (path) => latest.current.open(path),
      createPage: (title) => void latest.current.addNote(title),
      files: fileSet,
      filesVersion,
      fileUrl: (path) => store.fileUrl(path),
      openFile: (path) =>
        void store
          .openFile(path)
          .catch((error: unknown) => setProblem(messageOf(error))),
      addFiles: (added) => latest.current.addAttachments(added),
      canAddFiles: true,
    }),
    [pageList, index, selected, fileSet, filesVersion, store],
  );
  const searchPages = useMemo(() => {
    if (!project) return {};
    const found = searchablePages(project);
    for (const entry of items) {
      const text = entry.file ? textIndex?.[entry.file] : undefined;
      if (!text || !entry.file) continue;
      const pdf = isPdf(entry.file);
      text.pages.forEach((words, at) => {
        if (!words.trim()) return;
        found[`${entry.path}#page=${at + 1}`] = writePage({
          title: pdf ? `${entry.title}, p. ${at + 1}` : `${entry.title}, kept page`,
          properties: "",
          markdown: `${normalize(words)}\n`,
        });
      });
    }
    return found;
  }, [project, items, textIndex]);

  // The text of every PDF and kept page, for search: read in the background.
  const readable = useMemo(() => (files ?? []).filter(isReadable), [files]);
  const indexed = useRef<TextIndex | null>(null);
  useEffect(() => {
    let cancelled = false;
    void updateIndex(
      store,
      readable,
      indexed.current,
      (index) => {
        if (cancelled) return;
        indexed.current = index;
        setTextIndex(index);
      },
      () => cancelled,
    ).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [store, readable, filesVersion]);

  const readingItem =
    reading && project
      ? (items.find((entry) => entry.path === reading.path) ?? null)
      : null;
  const marksSource =
    readingItem && project
      ? project.pages[highlightsPathOf(readingItem.path)]
      : undefined;
  const readingHighlights = useMemo(
    () => readHighlights(marksSource).highlights,
    [marksSource],
  );
  const readBytes = useCallback((path: string) => store.readBytes(path), [store]);

  if (!project) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground" role="status">
            {problem
              ? `This binder can't be opened: ${problem}`
              : "Opening your binder…"}
          </p>
          {problem && onSwitchBinder && (
            <button
              type="button"
              onClick={onSwitchBinder}
              className="mt-3 h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted"
            >
              All binders
            </button>
          )}
        </div>
      </div>
    );
  }

  if (info.format > FORMAT) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm">This binder was made with a newer Binder.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Update Binder to open it. Nothing in the binder was changed.
          </p>
          {onSwitchBinder && (
            <button
              type="button"
              onClick={onSwitchBinder}
              className="mt-3 h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted"
            >
              All binders
            </button>
          )}
        </div>
      </div>
    );
  }

  const position = (() => {
    if (!item) return null;
    const at = shown.findIndex((entry) => entry.path === item.path);
    return at < 0 ? null : { index: at, total: shown.length };
  })();
  const step = (by: number) => {
    if (!position) return undefined;
    const target = shown[position.index + by];
    return target ? () => open(target.path) : undefined;
  };

  const title = viewTitle(view);
  const emptyText =
    view.kind === "inbox"
      ? "Your inbox is empty. What you add to the binder lands here first."
      : view.kind === "reading"
        ? "Nothing on your reading list yet. Move items here from your inbox."
        : view.kind === "notes"
          ? "No notes yet."
          : "No items with this tag.";

  const itemView = item && source !== null && (
    <div className="contents" onClickCapture={(event) => followPlace(event, item.path)}>
      <ItemView
        item={item}
        title={readPage(source).title}
        opened={opened}
        position={board ? null : position}
        onPrevious={step(-1)}
        onNext={step(1)}
        onBack={() => open(null)}
        backLabel={board ? "Back to the board" : `Back to ${title}`}
        onTitle={(next) => {
          const latestSource = fresh.current?.pages[item.path];
          if (latestSource === undefined) return;
          writeSource(item.path, writePage({ ...readPage(latestSource), title: next }));
        }}
        onTitleDone={() => void syncFileName()}
        onChange={(changes) => changeItem(item.path, changes)}
        onMarkdown={(markdown) => {
          const latestSource = fresh.current?.pages[item.path];
          if (latestSource === undefined) return;
          writeSource(item.path, writePage({ ...readPage(latestSource), markdown }));
        }}
        onOpenFile={openFile}
        onOpenLink={openExternal}
        onRead={
          item.file && isReadable(item.file) && fileSet.has(item.file)
            ? () => readSource(item.path)
            : undefined
        }
        onKeep={
          store.fetchWeb && item.url && !item.file && /^https?:\/\//i.test(item.url)
            ? () => void keepWebPage(item)
            : undefined
        }
        keeping={keeping}
        onDelete={() => setDeleting(item)}
        backlinks={linkedFrom}
        focusRef={focusEditor}
        focusEndRef={focusEditorEnd}
        titleRef={titleInput}
      />
    </div>
  );

  const reader = readingItem && readingItem.file && reading && (
    <Reader
      key={readingItem.file}
      title={readingItem.title}
      file={readingItem.file}
      readBytes={readBytes}
      highlights={readingHighlights}
      onAddHighlight={(added) =>
        changeHighlights(readingItem.path, (list) => [
          ...list,
          { ...added, id: newHighlightId(list.map((h) => h.id)) },
        ])
      }
      onChangeHighlight={(id, category) =>
        changeHighlights(readingItem.path, (list) =>
          list.map((h) => (h.id === id ? { ...h, category } : h)),
        )
      }
      onRemoveHighlight={(id) =>
        changeHighlights(readingItem.path, (list) => list.filter((h) => h.id !== id))
      }
      quoteOf={(highlight) => quoteOf(readingItem, highlight)}
      onAddToNotes={(highlight) => {
        const editor = notesEditor.current;
        if (!editor) return;
        editor
          .chain()
          .insertContentAt(
            editor.state.doc.content.size,
            quoteOf(readingItem, highlight).html,
          )
          .focus("end")
          .run();
      }}
      target={reading.target}
      onBack={() => setReading(null)}
      backLabel="Back to the item"
      notes={
        <div
          className="reader-notes-page"
          onClickCapture={(event) => followPlace(event, readingItem.path)}
        >
          <Editor
            key={`${readingItem.path}:${opened}`}
            markdown={readingItem.markdown}
            editorRef={notesEditor}
            onChange={(change) => {
              const latestSource = fresh.current?.pages[readingItem.path];
              if (latestSource === undefined) return;
              writeSource(
                readingItem.path,
                writePage({ ...readPage(latestSource), markdown: change.markdown }),
              );
            }}
          />
        </div>
      }
    />
  );

  const shell = (
    <div
      className={cn("app", navOpen && "nav-open")}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <Sidebar
        binderName={project.name}
        question={info.question}
        onQuestion={setQuestion}
        view={view}
        onView={showView}
        counts={counts}
        tags={tags}
        onAdd={() => {
          setNavOpen(false);
          setAdding(true);
        }}
        onSearch={() => {
          setNavOpen(false);
          setSearching("");
        }}
        onSettings={() => {
          setNavOpen(false);
          setSettings(true);
        }}
        onRenameBinder={
          onRenameBinder &&
          (async (name) => {
            syncFileName();
            await onRenameBinder(name);
            if (fresh.current) commit({ ...fresh.current, name });
          })
        }
        onSwitchBinder={onSwitchBinder}
        width={sidebarWidth}
        onResize={(width) => {
          setSidebarWidth(width);
          saveSidebarWidth(width);
        }}
      />
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] bg-card shadow-[0_1px_2px_oklch(14.5%_0.008_326/5%),0_0_0_1px_var(--border)]">
        {reader || (
          <>
            <header
              className="flex h-11 flex-none items-center gap-2 border-b px-3 text-xs"
              onPointerDown={dragWindow}
            >
              <button
                type="button"
                className="menu-button"
                aria-label="Show the sidebar"
                onClick={() => setNavOpen(true)}
              >
                <PanelLeft className="size-4" aria-hidden />
              </button>
              <h1 className="truncate text-sm font-semibold">{title}</h1>
              <span className="flex-1 truncate text-muted-foreground tabular-nums">
                {shown.length === 1 ? "1 item" : `${shown.length} items`}
              </span>
              {view.kind === "inbox" && (
                <button
                  type="button"
                  className={HEADER_BUTTON}
                  onClick={() => setZotero(true)}
                >
                  <Library className="size-3.5" aria-hidden />
                  Add from Zotero…
                </button>
              )}
              {view.kind === "reading" && (
                <div
                  role="group"
                  aria-label="Show as"
                  className="inline-flex flex-none gap-0.5 rounded-[7px] bg-muted p-0.5"
                >
                  {(
                    [
                      { id: "list", label: "List", icon: List },
                      { id: "board", label: "Board", icon: LayoutGrid },
                    ] as const
                  ).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={layout === entry.id}
                      onClick={() => {
                        setLayout(entry.id);
                        saveLayout(entry.id);
                        if (entry.id === "board") open(null);
                      }}
                      className={cn(
                        "inline-flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium",
                        layout === entry.id
                          ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <entry.icon className="size-3.5" aria-hidden />
                      {entry.label}
                    </button>
                  ))}
                </div>
              )}
            </header>

            {finding && item && (
              <FindBar
                text={finding.text}
                replacing={finding.replace}
                onClose={() => setFinding(null)}
              />
            )}

            {board ? (
              itemView || (
                <div className="min-h-0 flex-1 overflow-auto">
                  {shown.length ? (
                    <Board items={shown} onOpen={open} onStatus={setStatus} />
                  ) : (
                    <p className="p-4 text-[13px] text-muted-foreground">{emptyText}</p>
                  )}
                </div>
              )
            ) : (
              <div className={cn("split", item && "has-item")}>
                <div className="list-pane" aria-label={title}>
                  <ItemList
                    items={shown}
                    selected={selected}
                    groups={view.kind === "reading"}
                    showStatus={view.kind === "tag"}
                    empty={emptyText}
                    onOpen={open}
                  />
                </div>
                <div className="item-pane">
                  {itemView || (
                    <div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-muted-foreground">
                      {shown.length ? "Pick an item to see it here." : ""}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <footer className="flex h-7 flex-none items-center gap-3.5 border-t px-3.5 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
          <span className="inline-flex min-w-0 items-center gap-1.5" role="status">
            <span
              aria-hidden
              className={`size-1.5 flex-none rounded-full ${problem ? "bg-warning" : "bg-success"}`}
            />
            <span className="truncate">
              {problem ? `Not saved. ${problem}` : SAVED[store.place]}
            </span>
          </span>
          {selected && <span className="path truncate font-mono">{selected}</span>}
        </footer>
      </main>

      {dropping && <div className="drop-cover">Drop to add to your inbox</div>}
      {adding && (
        <AddDialog
          onAddText={addText}
          onAddFiles={(added) => void addFileItems(added)}
          onAddNote={() => {
            setAdding(false);
            void addNote();
          }}
          onZotero={() => {
            setAdding(false);
            setZotero(true);
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {zotero && (
        <ZoteroDialog
          inBinder={inBinder}
          onAdd={addFromZotero}
          onSettings={() => {
            setZotero(false);
            setSettings(true);
          }}
          onClose={() => setZotero(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          body={deleteQuestion(deleting, store.place)}
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            remove(deleting);
            setDeleting(null);
          }}
        />
      )}
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
      {searching !== null && (
        <SearchDialog
          pages={searchPages}
          initial={searching}
          onClose={() => setSearching(null)}
          onOpen={(path, query) => {
            setSearching(null);
            const inFile = /^(.*)#page=(\d+)$/.exec(path);
            if (inFile) {
              const page = Number(inFile[2]);
              const found = items.find((entry) => entry.path === inFile[1]);
              readSource(inFile[1], {
                page: found?.file && isPdf(found.file) ? page : null,
                highlight: null,
                find: query,
              });
              return;
            }
            setReading(null);
            showItem(path);
            requestAnimationFrame(() => openFind(query));
          }}
        />
      )}
    </div>
  );

  return (
    <WorkspaceProvider value={workspace}>
      <ReferencesProvider markdown={item?.markdown ?? ""} page={selected} live>
        {shell}
      </ReferencesProvider>
    </WorkspaceProvider>
  );
}
