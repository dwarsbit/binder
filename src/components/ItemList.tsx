import { Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@cursive/editor/lib/cn";
import { startPointerDrag } from "@cursive/editor/lib/pointer-drag";
import {
  authorsShort,
  itemByline,
  kindLabel,
  statusLabel,
  type Item,
  type Status,
} from "@/lib/binder";
import { READING } from "@/lib/items";
import { KindIcon } from "./KindIcon";

function Row({
  item,
  selected,
  showStatus,
  proposal,
  reading,
  onOpen,
}: {
  item: Item;
  selected: boolean;
  showStatus: boolean;
  /** The assistant has a proposal for the item. */
  proposal: boolean;
  /** The assistant is reading the item. */
  reading: boolean;
  onOpen: (path: string) => void;
}) {
  return (
    <button
      type="button"
      className="item-row"
      aria-current={selected ? "true" : undefined}
      data-path={item.path}
      onClick={() => onOpen(item.path)}
    >
      <KindIcon
        kind={item.kind}
        className="mt-0.5 size-4 flex-none text-muted-foreground"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="item-title line-clamp-2">{item.title}</span>
        <span className="item-meta truncate">{itemByline(item)}</span>
      </span>
      {(proposal || reading) && (
        <Sparkles
          className={cn(
            "mt-1 size-3.5 flex-none text-tint",
            reading && "animate-pulse",
          )}
          aria-label={
            reading ? "The assistant is reading it" : "The assistant has a proposal"
          }
        >
          <title>
            {reading ? "The assistant is reading it" : "The assistant has a proposal"}
          </title>
        </Sparkles>
      )}
      {showStatus && item.status && (
        <span
          className={cn("status-dot mt-1.5", `status-${item.status}`)}
          title={statusLabel(item.status)}
        />
      )}
    </button>
  );
}

/**
 * Items as a list, newest first. With `groups`, the reading list: a
 * heading for each status and its items under it.
 */
export function ItemList({
  items,
  selected,
  groups = false,
  showStatus = false,
  empty,
  onOpen,
  proposals,
  reading = null,
}: {
  items: Item[];
  selected: string | null;
  groups?: boolean;
  showStatus?: boolean;
  empty: React.ReactNode;
  onOpen: (path: string) => void;
  /** Items the assistant has a proposal for. */
  proposals?: Set<string>;
  /** The item the assistant is reading. */
  reading?: string | null;
}) {
  if (items.length === 0) {
    return <div className="px-2.5 py-2 text-[13px] text-muted-foreground">{empty}</div>;
  }
  if (!groups) {
    return (
      <div className="flex flex-col gap-px">
        {items.map((item) => (
          <Row
            key={item.path}
            item={item}
            selected={item.path === selected}
            showStatus={showStatus}
            proposal={proposals?.has(item.path) ?? false}
            reading={item.path === reading}
            onOpen={onOpen}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {READING.map((status) => {
        const inStatus = items.filter((item) => item.status === status);
        if (!inStatus.length) return null;
        return (
          <section
            key={status}
            aria-label={statusLabel(status)}
            className="flex flex-col gap-px"
          >
            <h2 className="flex h-7 items-center gap-2 px-2.5 text-xs font-semibold">
              <span className={cn("status-dot", `status-${status}`)} />
              <span className="flex-1">{statusLabel(status)}</span>
              <span className="font-normal text-muted-foreground tabular-nums">
                {inStatus.length}
              </span>
            </h2>
            {inStatus.map((item) => (
              <Row
                key={item.path}
                item={item}
                selected={item.path === selected}
                showStatus={false}
                proposal={proposals?.has(item.path) ?? false}
                reading={item.path === reading}
                onOpen={onOpen}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** The column under the pointer, by its status. */
const columnAt = (x: number, y: number): Status | null => {
  const column = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-status]");
  return (column?.dataset.status as Status | undefined) ?? null;
};

/** The reading list as a board: a column for each status. Dragging a card changes its status. */
export function Board({
  items,
  onOpen,
  onStatus,
}: {
  items: Item[];
  onOpen: (path: string) => void;
  onStatus: (path: string, status: Status) => void;
}) {
  const [drag, setDrag] = useState<{ path: string; over: Status | null } | null>(null);

  const press = (event: React.PointerEvent, item: Item) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    let over: Status | null = null;
    startPointerDrag(event, {
      onStart: () => setDrag({ path: item.path, over: null }),
      onMove: (move) => {
        over = columnAt(move.clientX, move.clientY);
        setDrag({ path: item.path, over });
      },
      onDrop: () => {
        if (over && over !== item.status) onStatus(item.path, over);
      },
      onEnd: () => setDrag(null),
    });
  };

  return (
    <div className="board">
      {READING.map((status) => {
        const inStatus = items.filter((item) => item.status === status);
        return (
          <section
            key={status}
            aria-label={statusLabel(status)}
            className="board-column"
            data-status={status}
            data-over={drag?.over === status ? "true" : undefined}
          >
            <h2 className="flex h-6 items-center gap-2 px-1 text-xs font-semibold">
              <span className={cn("status-dot", `status-${status}`)} />
              <span className="flex-1">{statusLabel(status)}</span>
              <span className="font-normal text-muted-foreground tabular-nums">
                {inStatus.length}
              </span>
            </h2>
            {inStatus.map((item) => (
              <button
                key={item.path}
                type="button"
                className="board-card"
                data-dragging={drag?.path === item.path ? "true" : undefined}
                onPointerDown={(event) => press(event, item)}
                onClick={() => onOpen(item.path)}
              >
                <span className="item-title">{item.title}</span>
                <span className="item-meta">
                  {[kindLabel(item.kind), authorsShort(item.authors), item.year]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {item.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
