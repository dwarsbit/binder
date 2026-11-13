import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
} from "@cursive/editor/components/Dialog";
import { cn } from "@cursive/editor/lib/cn";
import { dragWindow, formatOpened } from "@cursive/editor/lib/platform";
import { BINDER_FILE, writeBinderInfo } from "@/lib/binder";
import { ConfirmDialog } from "./ConfirmDialog";
import { Mark } from "./Mark";

interface Recent {
  name: string;
  path: string;
  openedAt: number;
}

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : messageOf(error));
};

/**
 * The desktop app without an open binder: make a binder in the Binder
 * folder, or open one you had open before, or any folder.
 */
export function BinderPicker({ onOpen }: { onOpen: (dir: string) => Promise<void> }) {
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [root, setRoot] = useState("");
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Recent | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Recent | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const refresh = () =>
    invoke<{ root: string; recent: Recent[] }>("binders_list").then(
      (binders) => {
        setRoot(binders.root);
        setRecent(binders.recent);
      },
      (error: unknown) => {
        setRecent([]);
        setProblem(messageOf(error));
      },
    );

  useEffect(() => {
    document.title = "Binder";
    void refresh();
  }, []);

  /** Runs something and says why when it didn't work. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const dir = await invoke<string>("binders_create", { name, unique: false }).catch(
        fail,
      );
      await invoke("project_write_page", {
        dir,
        path: BINDER_FILE,
        source: writeBinderInfo(undefined, question),
      }).catch(fail);
      await onOpen(dir);
    });

  const openFolder = () =>
    run(async () => {
      const picked = await open({
        directory: true,
        title: "Open a folder as a binder",
      });
      if (typeof picked === "string") await onOpen(picked);
    });

  const rename = () =>
    run(async () => {
      if (!renaming) return;
      await invoke("binders_rename", { dir: renaming.path, name: newName }).catch(fail);
      setRenaming(null);
      await refresh();
    });

  const trash = (binder: Recent) =>
    run(async () => {
      await invoke("binders_trash", { dir: binder.path }).catch(fail);
      await refresh();
    });

  return (
    <div className="relative flex h-full flex-col items-center overflow-y-auto px-4 pt-10 pb-16">
      <div className="absolute inset-x-0 top-0 h-11" onPointerDown={dragWindow} />
      <h1 className="mt-auto mb-6 flex flex-none flex-col items-center gap-3 text-lg font-semibold">
        <Mark className="size-14" />
        Binder
      </h1>
      <div className="mb-auto w-full max-w-lg flex-none rounded-xl bg-card p-6 shadow-[var(--pop-shadow)]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            // An empty name has nothing to create: point at the field.
            if (name.trim() === "") nameInput.current?.focus();
            else void create();
          }}
        >
          <div className="flex gap-2">
            <input
              ref={nameInput}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New binder name, such as Thesis"
              aria-label="New binder name"
              maxLength={120}
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
            />
            <button
              type="submit"
              disabled={busy}
              className={cn(PRIMARY_BUTTON, "h-9 px-4")}
            >
              Create
            </button>
          </div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={2}
            placeholder="Your research question, if you have one yet"
            aria-label="Research question"
            className="mt-2 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-[13px] leading-normal outline-none focus:border-ring"
          />
        </form>
        {root && (
          <p className="mt-1 truncate text-xs text-muted-foreground" title={root}>
            New binders are folders in {root}.
          </p>
        )}
        {problem && !renaming && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {problem}
          </p>
        )}

        <h2 className="mt-5 mb-1.5 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          Recent
        </h2>
        {recent === null ? (
          <p className="px-1.5 py-1.5 text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        ) : recent.length === 0 ? (
          <p className="px-1.5 py-1.5 text-sm text-muted-foreground">
            No binders yet. Create one above or open a folder.
          </p>
        ) : (
          <ul className="-mx-1 space-y-0.5">
            {recent.map((binder) => (
              <li
                key={binder.path}
                className="group relative flex items-center rounded-md hover:bg-muted"
              >
                <button
                  type="button"
                  title={binder.path}
                  disabled={busy}
                  onClick={() => void run(() => onOpen(binder.path))}
                  className="flex min-w-0 flex-1 items-baseline gap-3 px-2.5 py-1.5 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{binder.name}</span>
                  <span className="flex-none text-2xs text-muted-foreground group-focus-within:invisible group-hover:invisible">
                    {formatOpened(binder.openedAt)}
                  </span>
                </button>
                {/* Over the date on hover, so the row keeps its height. */}
                <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${binder.name}`}
                    title="Rename binder"
                    onClick={() => {
                      setProblem(null);
                      setNewName(binder.name);
                      setRenaming(binder);
                    }}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${binder.name} to the trash`}
                    title="Move binder to the trash"
                    onClick={() => setDeleting(binder)}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => void openFolder()}
          >
            Open folder…
          </button>
        </div>
      </div>

      {renaming && (
        <Dialog title="Rename binder" onClose={() => setRenaming(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim() !== "") void rename();
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onFocus={(event) => event.target.select()}
              aria-label="Binder name"
              maxLength={120}
              className="mt-3 h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The binder's folder gets the same name.
            </p>
            {problem && (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {problem}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={BUTTON}
                onClick={() => setRenaming(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={busy || newName.trim() === ""}
              >
                Rename
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Move “${deleting.name}” to the trash?`}
          body="The binder's folder, with every item and file in it, moves to the trash on your computer. You can restore it from there until you empty the trash."
          confirmLabel="Move to trash"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            void trash(deleting);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
