import { Check, FolderClosed, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
} from "@cursive/editor/components/Dialog";
import { cn } from "@cursive/editor/lib/cn";
import { activeSources, sourceName } from "@cursive/editor/references/sources";
import {
  librariesOf,
  listZoteroCollections,
  searchZotero,
  zoteroCollectionItems,
  zoteroYear,
  type ZoteroCollection,
  type ZoteroItem,
  type ZoteroLibrary,
} from "@cursive/editor/references/zotero";

/** A collection with how deep it sits, for a list that reads as a tree. */
interface Shelf extends ZoteroCollection {
  depth: number;
}

/** Collections in tree order: each under the one it sits in. */
function shelves(collections: ZoteroCollection[]): Shelf[] {
  const keys = new Set(collections.map((c) => c.key));
  const out: Shelf[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const collection of collections) {
      const top = collection.parent === null || !keys.has(collection.parent);
      if (parent === null ? top : collection.parent === parent) {
        out.push({ ...collection, depth });
        walk(collection.key, depth + 1);
      }
    }
  };
  walk(null, 0);
  return out;
}

const creators = (item: ZoteroItem) => {
  const names = (item.creators ?? [])
    .map((c) => c.lastName?.trim() || c.name?.trim() || "")
    .filter(Boolean);
  return names.length > 2 ? `${names[0]} et al.` : names.join(" and ");
};

/**
 * Adds works from Zotero: a whole collection at once, or works found by
 * a search. Works already in the binder are left out.
 */
export function ZoteroDialog({
  inBinder,
  onAdd,
  onSettings,
  onClose,
}: {
  /** Whether a Zotero item is in the binder already, by library and key. */
  inBinder: (library: string, key: string) => boolean;
  /** Adds works; gives how many were added. */
  onAdd: (library: ZoteroLibrary, items: ZoteroItem[]) => Promise<number>;
  onSettings: () => void;
  onClose: () => void;
}) {
  const [libraries, setLibraries] = useState<ZoteroLibrary[] | null>(null);
  const [libraryAt, setLibraryAt] = useState(0);
  const [collections, setCollections] = useState<Shelf[] | null>(null);
  const [collection, setCollection] = useState<Shelf | null>(null);
  const [works, setWorks] = useState<ZoteroItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ZoteroItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const library = libraries?.[libraryAt] ?? null;

  useEffect(() => {
    let current = true;
    activeSources().then(
      (sources) => current && setLibraries(sources.flatMap(librariesOf)),
      () => current && setLibraries([]),
    );
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!library) return;
    let current = true;
    listZoteroCollections(library).then(
      (list) => current && setCollections(shelves(list)),
      (error: unknown) => {
        if (!current) return;
        setCollections([]);
        setProblem(messageOf(error));
      },
    );
    return () => {
      current = false;
    };
  }, [library]);

  const openCollection = (shelf: Shelf) => {
    if (!library) return;
    setCollection(shelf);
    setWorks(null);
    setFound(null);
    setAdded(null);
    setProblem(null);
    zoteroCollectionItems(library, shelf.key).then(setWorks, (error: unknown) => {
      setWorks([]);
      setProblem(messageOf(error));
    });
  };

  const search = () => {
    if (!library || !query.trim()) return;
    setCollection(null);
    setFound(null);
    setAdded(null);
    setProblem(null);
    searchZotero(library, query, 25).then(setFound, (error: unknown) => {
      setFound([]);
      setProblem(messageOf(error));
    });
  };

  const add = async (items: ZoteroItem[]) => {
    if (!library || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const count = await onAdd(library, items);
      setAdded(
        count === 0
          ? "Nothing was added: these works are in the binder already."
          : `Added ${count === 1 ? "1 work" : `${count} works`} to the inbox.`,
      );
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const fresh = useMemo(
    () =>
      library && works ? works.filter((work) => !inBinder(library.id, work.key)) : [],
    [library, works, inBinder],
  );

  const body =
    libraries === null ? (
      <p className="mt-3 text-[13px] text-muted-foreground" role="status">
        Looking for your Zotero libraries…
      </p>
    ) : libraries.length === 0 ? (
      <>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Binder finds no Zotero library yet. Turn on the Zotero app, or a library at
          zotero.org, in Settings.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={BUTTON} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={PRIMARY_BUTTON} onClick={onSettings}>
            Open settings
          </button>
        </div>
      </>
    ) : (
      <>
        <div className="mt-3 flex flex-wrap gap-2">
          {libraries.length > 1 && (
            <select
              aria-label="Library"
              value={libraryAt}
              onChange={(event) => {
                setLibraryAt(Number(event.target.value));
                setCollections(null);
                setCollection(null);
                setWorks(null);
                setFound(null);
                setAdded(null);
                setProblem(null);
              }}
              className="h-8 max-w-48 rounded-md border bg-background px-2 text-[13px]"
            >
              {libraries.map((lib, index) => (
                <option key={`${lib.source.id}/${lib.path}`} value={index}>
                  {lib.group || sourceName(lib.source)}
                </option>
              ))}
            </select>
          )}
          <form
            className="flex min-w-48 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              search();
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, author or year"
              aria-label="Search the library"
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-[13px] outline-none focus:border-ring"
            />
            <button type="submit" className={BUTTON} aria-label="Search" title="Search">
              <Search className="size-3.5" aria-hidden />
            </button>
          </form>
        </div>

        <div className="mt-3 grid h-72 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 max-sm:grid-cols-1">
          <div
            className="min-h-0 overflow-y-auto rounded-md border p-1"
            aria-label="Collections"
          >
            {collections === null ? (
              <p className="p-1.5 text-xs text-muted-foreground">
                Reading the collections…
              </p>
            ) : collections.length === 0 ? (
              <p className="p-1.5 text-xs text-muted-foreground">
                This library has no collections.
              </p>
            ) : (
              collections.map((shelf) => (
                <button
                  key={shelf.key}
                  type="button"
                  aria-current={collection?.key === shelf.key ? "true" : undefined}
                  onClick={() => openCollection(shelf)}
                  style={{ paddingLeft: 6 + shelf.depth * 14 }}
                  className={cn(
                    "flex h-7 w-full items-center gap-1.5 rounded-[5px] pr-1.5 text-left text-xs",
                    collection?.key === shelf.key
                      ? "bg-tint-soft font-medium text-tint-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <FolderClosed className="size-3.5 flex-none opacity-70" aria-hidden />
                  <span className="truncate">{shelf.name}</span>
                </button>
              ))
            )}
          </div>
          <div className="flex min-h-0 flex-col rounded-md border">
            {collection || found ? (
              <Works
                works={collection ? works : found}
                library={library}
                inBinder={inBinder}
                busy={busy}
                onAdd={(work) => void add([work])}
              />
            ) : (
              <p className="p-2.5 text-xs text-muted-foreground">
                Pick a collection to add all of it, or search for a work.
              </p>
            )}
          </div>
        </div>

        <p
          className={cn(
            "mt-2 min-h-4 text-xs",
            problem ? "text-destructive" : "text-muted-foreground",
          )}
          role={problem ? "alert" : "status"}
        >
          {problem ?? added ?? ""}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className={BUTTON} onClick={onClose}>
            Done
          </button>
          {collection && (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || works === null || fresh.length === 0}
              onClick={() => void add(fresh)}
            >
              {works === null
                ? "Add collection"
                : fresh.length === 0
                  ? "All in the binder"
                  : `Add ${fresh.length === 1 ? "1 work" : `${fresh.length} works`}`}
            </button>
          )}
        </div>
      </>
    );

  return (
    <Dialog title="Add from Zotero" onClose={onClose}>
      <div className="dialog-wider">{body}</div>
    </Dialog>
  );
}

function Works({
  works,
  library,
  inBinder,
  busy,
  onAdd,
}: {
  works: ZoteroItem[] | null;
  library: ZoteroLibrary | null;
  inBinder: (library: string, key: string) => boolean;
  busy: boolean;
  onAdd: (work: ZoteroItem) => void;
}) {
  if (works === null) {
    return <p className="p-2.5 text-xs text-muted-foreground">Reading the works…</p>;
  }
  if (works.length === 0) {
    return <p className="p-2.5 text-xs text-muted-foreground">No works here.</p>;
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-1">
      {works.map((work) => {
        const there = library ? inBinder(library.id, work.key) : false;
        return (
          <li
            key={work.key}
            className="flex items-center gap-2 rounded-[5px] px-1.5 py-1 hover:bg-muted"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium">
                {work.title || "Untitled"}
              </span>
              <span className="truncate text-2xs text-muted-foreground">
                {[creators(work), zoteroYear(work.date)].filter(Boolean).join(" · ")}
              </span>
            </span>
            {there ? (
              <span className="inline-flex flex-none items-center gap-1 text-2xs text-muted-foreground">
                <Check className="size-3" aria-hidden />
                In binder
              </span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onAdd(work)}
                className="h-6 flex-none rounded-[5px] border bg-background px-2 text-2xs font-medium hover:bg-background/60 disabled:opacity-50"
              >
                Add
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
