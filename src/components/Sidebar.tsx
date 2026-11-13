import {
  FolderOpen,
  Inbox,
  ListChecks,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Tag,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@cursive/editor/lib/cn";
import { dragWindow } from "@cursive/editor/lib/platform";
import { startPointerDrag } from "@cursive/editor/lib/pointer-drag";
import { messageOf } from "@cursive/editor/components/Dialog";
import { viewKey, type View } from "@/lib/items";
import { Mark } from "./Mark";

export interface SidebarProps {
  binderName: string;
  question: string;
  /** Writes down the research question; only where the binder can be changed. */
  onQuestion?: (question: string) => void;
  view: View;
  onView: (view: View) => void;
  counts: Record<"inbox" | "reading" | "notes", number>;
  tags: Array<{ tag: string; count: number }>;
  onAdd: () => void;
  onSearch: () => void;
  onSettings: () => void;
  /** Gives the binder another name, where the app can. Rejects with why not. */
  onRenameBinder?: (name: string) => Promise<void>;
  /** Opens another binder, where the app can. */
  onSwitchBinder?: () => void;
  width: number;
  onResize: (width: number) => void;
}

function BinderName({
  name,
  onRename,
}: {
  name: string;
  onRename?: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = useRef(false);

  if (!onRename) return <span className="min-w-0 flex-1 truncate px-1">{name}</span>;
  // The name, and the field that renames it, take the room up to the buttons.

  const close = () => {
    setDraft(null);
    setProblem(null);
  };
  const commit = async () => {
    const wanted = draft?.trim();
    if (busy.current) return;
    if (!wanted || wanted === name) return close();
    busy.current = true;
    try {
      await onRename(wanted);
      close();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      busy.current = false;
    }
  };

  if (draft === null) {
    return (
      <span className="flex min-w-0 flex-1">
        <button
          type="button"
          title="Rename binder"
          onClick={() => setDraft(name)}
          className="h-7 min-w-0 truncate rounded-md px-1 text-left hover:bg-accent"
        >
          {name}
        </button>
      </span>
    );
  }
  return (
    <span className="relative min-w-0 flex-1">
      <input
        autoFocus
        value={draft}
        aria-label="Binder name"
        aria-invalid={problem !== null}
        maxLength={120}
        onFocus={(event) => event.target.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(null);
        }}
        // Leaving the field renames; with a problem on show, it gives up.
        onBlur={() => (problem ? close() : void commit())}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
          if (event.key === "Escape") close();
        }}
        className="h-7 w-full rounded-md border border-ring bg-background px-1 text-sm font-semibold outline-none"
      />
      {problem && (
        <span
          role="alert"
          className="popover absolute top-full left-0 z-20 mt-1 w-56 px-2 py-1.5 text-xs font-normal text-destructive"
        >
          {problem}
        </span>
      )}
    </span>
  );
}

/** The research question, written down in the sidebar where it stays in view. */
function Question({
  question,
  onChange,
}: {
  question: string;
  onChange?: (question: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = () => {
    if (draft !== null && draft.trim() !== question.trim()) onChange?.(draft);
    setDraft(null);
  };
  if (draft !== null) {
    return (
      <div className="px-2 pt-0.5 pb-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-2xs text-muted-foreground">Research question</span>
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={done}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                done();
              }
              if (event.key === "Escape") setDraft(null);
            }}
            placeholder="What do you want to find out?"
            className="w-full resize-none rounded-md border border-ring bg-background px-1.5 py-1 text-xs leading-[1.45] outline-none"
          />
        </label>
      </div>
    );
  }
  return (
    <div className="px-1 pt-0.5 pb-2.5">
      <button
        type="button"
        disabled={!onChange}
        title={onChange ? "Change the research question" : undefined}
        onClick={() => setDraft(question)}
        className="flex w-full flex-col gap-0.5 rounded-md px-1 py-1 text-left enabled:hover:bg-accent"
      >
        <span className="text-2xs text-muted-foreground">Research question</span>
        {question ? (
          <span className="line-clamp-5 leading-[1.45] text-secondary-foreground">
            {question}
          </span>
        ) : (
          <span className="leading-[1.45] text-muted-foreground">
            Write down what you want to find out.
          </span>
        )}
      </button>
    </div>
  );
}

function NavRow({
  icon,
  label,
  count,
  hint,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn("row w-full gap-2 px-2 text-left", active && "row-active")}
    >
      <span className="flex-none text-muted-foreground [.row-active_&]:text-tint-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-2xs font-normal text-muted-foreground tabular-nums">
          {count}
        </span>
      )}
      {hint && (
        <span className="text-2xs font-normal text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}

/** The sidebar's edge, which a drag makes wider or narrower. */
function Resizer({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width"
      aria-valuenow={width}
      title="Drag to resize"
      onDoubleClick={() => onResize(SIDEBAR_WIDTH)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const start = event.clientX;
        startPointerDrag(event, {
          threshold: 0,
          cursor: "col-resize",
          onMove: (move) => onResize(clampWidth(width + move.clientX - start)),
          onDrop: () => {},
        });
      }}
    />
  );
}

export const SIDEBAR_WIDTH = 248;
export const clampWidth = (width: number) =>
  Math.round(Math.min(420, Math.max(200, width)));

const ICON = "size-3.5";

/** The binder: its name and research question, the lists, and the tags. */
export function Sidebar(props: SidebarProps) {
  const active = viewKey(props.view);
  return (
    <aside className="sidebar" aria-label="Binder">
      <div
        className="sidebar-head flex h-11 flex-none items-center gap-1 px-2 text-sm font-semibold"
        onPointerDown={dragWindow}
      >
        <Mark className="mark mr-1 size-[22px] flex-none" />
        <BinderName name={props.binderName} onRename={props.onRenameBinder} />
        {props.onSwitchBinder && (
          <button
            type="button"
            aria-label="All binders"
            title="All binders"
            onClick={props.onSwitchBinder}
            className="grid size-6 flex-none place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <FolderOpen className={ICON} aria-hidden />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <Question question={props.question} onChange={props.onQuestion} />
        <button
          type="button"
          onClick={props.onAdd}
          className="mx-1 mb-2 flex h-7 w-[calc(100%-8px)] items-center gap-2 rounded-md border bg-card px-2 font-medium shadow-[0_1px_2px_oklch(0_0_0/5%)] hover:bg-muted"
        >
          <Plus className={ICON} aria-hidden />
          <span className="flex-1 text-left">Add to binder</span>
          <span className="text-2xs font-normal text-muted-foreground">
            Cmd/Ctrl + N
          </span>
        </button>
        <nav aria-label="Lists" className="flex flex-col gap-px">
          <NavRow
            icon={<Inbox className={ICON} aria-hidden />}
            label="Inbox"
            count={props.counts.inbox}
            active={active === "inbox"}
            onClick={() => props.onView({ kind: "inbox" })}
          />
          <NavRow
            icon={<ListChecks className={ICON} aria-hidden />}
            label="Reading list"
            count={props.counts.reading}
            active={active === "reading"}
            onClick={() => props.onView({ kind: "reading" })}
          />
          <NavRow
            icon={<NotebookPen className={ICON} aria-hidden />}
            label="Notes"
            count={props.counts.notes}
            active={active === "notes"}
            onClick={() => props.onView({ kind: "notes" })}
          />
          <NavRow
            icon={<Search className={ICON} aria-hidden />}
            label="Search"
            hint="Cmd/Ctrl + K"
            onClick={props.onSearch}
          />
        </nav>

        {props.tags.length > 0 && (
          <nav aria-label="Tags" className="mt-3 flex flex-col gap-px">
            <h2 className="flex h-7 items-center px-2 text-2xs font-normal text-muted-foreground">
              Tags
            </h2>
            {props.tags.map(({ tag, count }) => (
              <NavRow
                key={tag}
                icon={<Tag className={ICON} aria-hidden />}
                label={tag}
                count={count}
                active={active === `tag:${tag}`}
                onClick={() => props.onView({ kind: "tag", tag })}
              />
            ))}
          </nav>
        )}
      </div>

      <div className="flex-none border-t pt-1">
        <NavRow
          icon={<Settings className={ICON} aria-hidden />}
          label="Settings"
          onClick={props.onSettings}
        />
      </div>
      <Resizer width={props.width} onResize={props.onResize} />
    </aside>
  );
}
