import { FilePlus, Library, NotebookPen } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
} from "@cursive/editor/components/Dialog";
import { cn } from "@cursive/editor/lib/cn";
import { lookupOf } from "@cursive/editor/references/lookup";
import { urlOf } from "@/lib/items";

/** What the field holds, as Add takes it. */
function readInput(text: string) {
  const lookup = lookupOf(text);
  if (lookup)
    return {
      kind: lookup.kind,
      hint:
        lookup.kind === "doi"
          ? "A DOI. Binder looks up the work at Crossref."
          : "An ISBN. Binder looks up the book at Open Library.",
    } as const;
  if (urlOf(text) && !/\s/.test(text.trim())) {
    return {
      kind: "link",
      hint: "A link. Binder adds the web page by its address.",
    } as const;
  }
  if (text.trim())
    return { kind: "thought", hint: "A thought. It goes to your inbox." } as const;
  return null;
}

/**
 * Adds to the binder: a file, a link, a DOI or an ISBN, a thought, a
 * note, or works from Zotero.
 */
export function AddDialog({
  onAddText,
  onAddFiles,
  onAddNote,
  onZotero,
  onClose,
}: {
  /** Adds a link, a DOI, an ISBN or a thought. Rejects with why not. */
  onAddText: (text: string) => Promise<void>;
  onAddFiles: (files: File[]) => void;
  onAddNote: () => void;
  onZotero: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const input = useMemo(() => readInput(text), [text]);

  const add = async () => {
    if (!input || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onAddText(text);
      onClose();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Add to binder" onClose={onClose}>
      <form
        className="dialog-wide"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <textarea
          autoFocus
          rows={3}
          value={text}
          aria-label="A link, DOI, ISBN or thought"
          placeholder="Paste a link, a DOI or an ISBN, or write down a thought"
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void add();
            }
          }}
          className="mt-3 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-[13px] leading-normal outline-none focus:border-ring"
        />
        <p
          className={cn(
            "mt-1 min-h-4 text-xs",
            problem ? "text-destructive" : "text-muted-foreground",
          )}
          role={problem ? "alert" : "status"}
        >
          {problem ?? input?.hint ?? "Or add a file, a note, or works from Zotero."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cn(BUTTON, "inline-flex items-center gap-1.5")}
            onClick={() => picker.current?.click()}
          >
            <FilePlus className="size-3.5" aria-hidden />
            File…
          </button>
          <button
            type="button"
            className={cn(BUTTON, "inline-flex items-center gap-1.5")}
            onClick={onAddNote}
          >
            <NotebookPen className="size-3.5" aria-hidden />
            Note
          </button>
          <button
            type="button"
            className={cn(BUTTON, "inline-flex items-center gap-1.5")}
            onClick={onZotero}
          >
            <Library className="size-3.5" aria-hidden />
            Zotero…
          </button>
          <span className="flex-1" />
          <button type="submit" className={PRIMARY_BUTTON} disabled={!input || busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (files.length) {
              onAddFiles(files);
              onClose();
            }
          }}
        />
      </form>
    </Dialog>
  );
}
