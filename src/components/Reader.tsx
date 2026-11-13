import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Search,
  Sparkles,
  TextQuote,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@cursive/editor/lib/cn";
import { openExternal } from "@cursive/editor/lib/platform";
import { boxesOf, rangeOf, textMap } from "@/lib/dom-text";
import {
  CATEGORIES,
  categoryLabel,
  oneLine,
  type Category,
  type Highlight,
} from "@/lib/highlights";
import { openPdf, pageText, type PdfDocument } from "@/lib/pdf";
import { htmlPages, isPdf, matchesIn } from "@/lib/text";
import { keptArticle } from "@/lib/webpage";

/** Where the reader goes: a page, a highlight, a passage, or a text to find. */
export interface ReaderTarget {
  page: number | null;
  highlight: string | null;
  find: string | null;
  /** The words of a passage, from a link the assistant wrote. */
  passage: string | null;
  /** Counts the requests: the same place asked for twice is gone to twice. */
  nonce: number;
}

/** What is found in the source: the query, and the match shown. */
interface Finding {
  query: string;
  /** The page of the match shown, and which match on that page it is. */
  page: number | null;
  nth: number;
}

/** A place to scroll to once its page is drawn. */
interface Pending {
  page: number | null;
  highlight: string | null;
  find: boolean;
}
/** A place asked for: each request has its own id, and is gone to once. */
type Request = Pending & { id: number };

/** Scrolls an element; outside the components, which only read the DOM. */
const scrollElement = (element: Element, top: number) => {
  element.scrollTop = top;
};

const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
/** The widest a page is drawn at 100%, in CSS pixels. */
const FIT_MAX = 860;

/** A highlight as drawn: a class of its own for proposed highlights and passages. */
type Marked = Highlight & { className?: string };

/** The id a passage from a link is drawn under. */
const PASSAGE = "passage";
/** Proposed highlights are drawn under their id with this before it. */
const PROPOSED = "proposed:";

/** Draws the highlights and what is found on one page of the source. */
function paintMarks(
  page: Element,
  textRoot: Element,
  highlights: Marked[],
  finding: Finding | null,
  pageNumber: number | null,
) {
  let layer = page.querySelector(":scope > .marks");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "marks";
    page.prepend(layer);
    // Under the text, over the drawn page.
    const canvas = page.querySelector(":scope > canvas");
    if (canvas) canvas.after(layer);
  }
  layer.replaceChildren();
  const map = textMap(textRoot);
  const add = (range: Range | null, className: string, id?: string) => {
    if (!range) return;
    boxesOf(range, page).forEach((box) => {
      const mark = document.createElement("div");
      mark.className = className;
      mark.style.left = `${box.left}px`;
      mark.style.top = `${box.top}px`;
      mark.style.width = `${box.width}px`;
      mark.style.height = `${box.height}px`;
      if (id) mark.dataset.highlight = id;
      layer.append(mark);
    });
  };
  for (const highlight of highlights) {
    if (highlight.page !== pageNumber) continue;
    add(
      rangeOf(textRoot, highlight.text, 0, map),
      highlight.className ?? `hl-mark hl-${highlight.category}`,
      highlight.id,
    );
  }
  if (finding?.query) {
    for (let nth = 0; nth < 500; nth++) {
      const range = rangeOf(textRoot, finding.query, nth, map);
      if (!range) break;
      const current = finding.page === pageNumber && finding.nth === nth;
      add(range, current ? "hl-mark hl-find hl-find-current" : "hl-mark hl-find");
    }
  }
}

/** Scrolls to what `pending` asks for on a page just drawn; true when done. */
function reach(page: Element, pending: Pending): boolean {
  const target = pending.highlight
    ? page.querySelector(`.marks [data-highlight="${CSS.escape(pending.highlight)}"]`)
    : pending.find
      ? page.querySelector(".marks .hl-find-current")
      : null;
  if (target) {
    target.scrollIntoView({ block: "center" });
    if (pending.highlight) {
      const marks = page.querySelectorAll(
        `.marks [data-highlight="${CSS.escape(pending.highlight)}"]`,
      );
      for (const mark of marks) {
        mark.classList.remove("flash");
        void (mark as HTMLElement).offsetWidth;
        mark.classList.add("flash");
      }
    }
    return true;
  }
  return !pending.highlight && !pending.find;
}

interface SourceProps {
  bytes: ArrayBuffer;
  zoom: number;
  highlights: Marked[];
  finding: Finding | null;
  /** Where to go, once: a page and maybe a highlight or the match shown. */
  request: Request | null;
  scroller: React.RefObject<HTMLDivElement | null>;
  onPage: (page: number) => void;
  onPages: (pages: number) => void;
  onError: (message: string) => void;
}

/** A PDF, page under page, drawn as the pages come into view. */
function PdfSource(props: SourceProps) {
  const { bytes, zoom, scroller, request } = props;
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [sizes, setSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [width, setWidth] = useState(0);
  const shells = useRef<Array<HTMLDivElement | null>>([]);
  const drawn = useRef(new Map<number, { scale: number; cancel: () => void }>());
  const near = useRef(new Set<number>());
  // The last request gone to, and the page a request waits on to be drawn.
  const done = useRef(0);
  const waiting = useRef<number | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    let cancelled = false;
    let opened: PdfDocument | null = null;
    openPdf(bytes)
      .then(async (loaded) => {
        opened = loaded;
        const found: Array<{ width: number; height: number }> = [];
        for (let n = 1; n <= loaded.numPages; n++) {
          const viewport = (await loaded.getPage(n)).getViewport({ scale: 1 });
          found.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        setSizes(found);
        setDoc(loaded);
        latest.current.onPages(loaded.numPages);
      })
      .catch(() => {
        if (!cancelled) latest.current.onError("This PDF can't be read.");
      });
    return () => {
      cancelled = true;
      void opened?.loadingTask.destroy();
    };
  }, [bytes]);

  // The page width follows the window.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scroller]);

  const widest = Math.max(1, ...sizes.map((size) => size.width));
  const fit = Math.min(Math.max(width - 48, 200), FIT_MAX) / widest;
  const scale = fit * zoom;

  /** Draws a page: the picture, its text to select, and the marks. */
  const draw = useRef<(n: number) => void>(() => {});
  useEffect(() => {
    draw.current = (n: number) => {
      const shell = shells.current[n - 1];
      if (!doc || !shell) return;
      const had = drawn.current.get(n);
      if (had?.scale === scale) return;
      had?.cancel();
      let cancelled = false;
      let task: { cancel: () => void } | null = null;
      drawn.current.set(n, {
        scale,
        cancel: () => {
          cancelled = true;
          task?.cancel();
        },
      });
      void (async () => {
        const page = await doc.getPage(n);
        if (cancelled) return;
        const lib = await import("pdfjs-dist");
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        const render = page.render({
          canvas,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        task = render;
        const text = document.createElement("div");
        text.className = "textLayer";
        const layer = new lib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: text,
          viewport,
        });
        await Promise.all([render.promise, layer.render()]).catch(() => {
          cancelled = true;
        });
        if (cancelled) return;
        shell.replaceChildren(canvas, text);
        const { highlights, finding, request } = latest.current;
        paintMarks(shell, text, highlights, finding, n);
        if (request && request.id !== done.current && waiting.current === n) {
          if (reach(shell, request)) done.current = request.id;
        }
      })();
    };
  });

  const undraw = (n: number) => {
    drawn.current.get(n)?.cancel();
    drawn.current.delete(n);
    shells.current[n - 1]?.replaceChildren();
  };

  // Pages are drawn near the view and let go far from it.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !doc) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) {
            near.current.add(n);
            draw.current(n);
          } else {
            near.current.delete(n);
            undraw(n);
          }
        }
      },
      { root, rootMargin: "1500px 0px" },
    );
    for (const shell of shells.current) if (shell) observer.observe(shell);
    return () => observer.disconnect();
  }, [doc, sizes, scroller]);

  // A new zoom draws the pages in view again, keeping the place.
  const place = useRef<{ page: number; offset: number } | null>(null);
  useLayoutEffect(() => {
    const root = scroller.current;
    const kept = place.current;
    if (root && kept) {
      const shell = shells.current[kept.page - 1];
      if (shell)
        scrollElement(root, shell.offsetTop + kept.offset * shell.offsetHeight);
    }
    for (const n of near.current) draw.current(n);
  }, [scale, scroller]);

  // The marks follow the highlights and what is found.
  useEffect(() => {
    for (const n of drawn.current.keys()) {
      const shell = shells.current[n - 1];
      const text = shell?.querySelector(".textLayer");
      if (shell && text) paintMarks(shell, text, props.highlights, props.finding, n);
    }
  }, [props.highlights, props.finding]);

  // Going to a page: there at once, then to the highlight or match once drawn.
  useEffect(() => {
    const root = scroller.current;
    if (!request || request.id === done.current || !root || !doc) return;
    const n = Math.min(Math.max(request.page ?? 1, 1), doc.numPages);
    const shell = shells.current[n - 1];
    if (!shell) return;
    if (drawn.current.get(n)?.scale === scale && shell.querySelector(".textLayer")) {
      if (reach(shell, request)) {
        done.current = request.id;
        return;
      }
    }
    // To the page; once it is drawn, the mark is centered.
    scrollElement(root, shell.offsetTop - 16);
    if (!request.highlight && !request.find) done.current = request.id;
    else waiting.current = n;
  }, [request, doc, scroller, scale]);

  // The page in view is the one across the middle of the window.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const onScroll = () => {
      const line = root.scrollTop + root.clientHeight / 2;
      let page = 1;
      for (let i = 0; i < shells.current.length; i++) {
        const shell = shells.current[i];
        if (shell && shell.offsetTop <= line) page = i + 1;
      }
      const shell = shells.current[page - 1];
      if (shell)
        place.current = {
          page,
          offset: (root.scrollTop - shell.offsetTop) / Math.max(1, shell.offsetHeight),
        };
      latest.current.onPage(page);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [scroller]);

  if (!doc)
    return <p className="p-6 text-[13px] text-muted-foreground">Opening the PDF…</p>;
  return (
    <div className="pdf-pages">
      {sizes.map((size, i) => (
        <div
          key={i}
          ref={(element) => {
            shells.current[i] = element;
          }}
          className="pdf-page"
          data-page={i + 1}
          aria-label={`Page ${i + 1}`}
          style={
            {
              width: `${Math.floor(size.width * scale)}px`,
              height: `${Math.floor(size.height * scale)}px`,
              "--total-scale-factor": scale,
              "--scale-round-x": "1px",
              "--scale-round-y": "1px",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A kept web page, as text to read. */
function HtmlSource(props: SourceProps) {
  const { bytes, zoom, highlights, finding, request } = props;
  const done = useRef(0);
  const page = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const kept = useMemo(() => keptArticle(new TextDecoder().decode(bytes)), [bytes]);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useLayoutEffect(() => {
    if (article.current) article.current.innerHTML = kept.html;
    latest.current.onPages(1);
    latest.current.onPage(1);
  }, [kept]);

  useEffect(() => {
    const shell = page.current;
    const text = article.current;
    if (!shell || !text) return;
    const paint = () => {
      paintMarks(shell, text, latest.current.highlights, latest.current.finding, null);
      const wanted = latest.current.request;
      if (wanted && wanted.id !== done.current && reach(shell, wanted))
        done.current = wanted.id;
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(text);
    return () => observer.disconnect();
  }, [kept, highlights, finding, zoom, request]);

  return (
    <div ref={page} className="html-page" style={{ fontSize: `${16 * zoom}px` }}>
      {kept.url && (
        <p className="html-source">
          Kept from{" "}
          <a
            href={kept.url}
            onClick={(event) => {
              event.preventDefault();
              openExternal(kept.url);
            }}
          >
            {kept.url.replace(/^https?:\/\//, "")}
          </a>
        </p>
      )}
      <article
        ref={article}
        className="html-article"
        onClick={(event) => {
          const link = (event.target as Element).closest("a[href]");
          if (!link) return;
          event.preventDefault();
          const href = link.getAttribute("href");
          if (href && window.getSelection()?.isCollapsed) openExternal(href);
        }}
      />
    </div>
  );
}

/** A highlight the assistant proposes: keep it, or dismiss it. */
function ProposedCard({
  highlight,
  onOpen,
  onKeep,
  onDismiss,
}: {
  highlight: Highlight;
  onOpen: () => void;
  onKeep: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className={cn("highlight-card proposed-card", `card-${highlight.category}`)}>
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <span className={cn("category-dot", `dot-${highlight.category}`)} />
        <span className="px-1">{categoryLabel(highlight.category)}</span>
        {highlight.page && <span className="tabular-nums">p. {highlight.page}</span>}
        <span className="flex-1" />
        <button
          type="button"
          className="card-button"
          aria-label="Keep highlight"
          title="Keep highlight"
          onClick={onKeep}
        >
          <Check className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="card-button"
          aria-label="Dismiss highlight"
          title="Dismiss highlight"
          onClick={onDismiss}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <button type="button" className="highlight-text" onClick={onOpen}>
        {highlight.text}
      </button>
    </li>
  );
}

/** One highlight in the side panel: drag it into the notes, or add it there. */
function HighlightCard({
  highlight,
  onOpen,
  onCategory,
  onRemove,
  onAddToNotes,
  dragData,
}: {
  highlight: Highlight;
  onOpen: () => void;
  onCategory: (category: Category) => void;
  onRemove: () => void;
  onAddToNotes: () => void;
  dragData: () => { html: string; text: string };
}) {
  return (
    <li
      className={cn("highlight-card", `card-${highlight.category}`)}
      draggable
      onDragStart={(event) => {
        const data = dragData();
        event.dataTransfer.setData("text/html", data.html);
        event.dataTransfer.setData("text/plain", data.text);
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <GripVertical className="drag-grip size-3 flex-none" aria-hidden />
        <span className={cn("category-dot", `dot-${highlight.category}`)} />
        <select
          className="category-select"
          aria-label="Category"
          value={highlight.category}
          onChange={(event) => onCategory(event.target.value as Category)}
        >
          {CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        {highlight.page && <span className="tabular-nums">p. {highlight.page}</span>}
        <span className="flex-1" />
        <button
          type="button"
          className="card-button"
          aria-label="Add to notes"
          title="Add to notes"
          onClick={onAddToNotes}
        >
          <TextQuote className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="card-button hover:text-destructive"
          aria-label="Delete highlight"
          title="Delete highlight"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
      <button type="button" className="highlight-text" onClick={onOpen}>
        {highlight.text}
      </button>
    </li>
  );
}

export interface ReaderProps {
  title: string;
  /** The source file, as a path in the binder. */
  file: string;
  readBytes: (path: string) => Promise<ArrayBuffer | null>;
  highlights: Highlight[];
  /** Highlights the assistant proposes, to keep or dismiss. */
  proposed: Highlight[];
  onKeepProposed: (ids: string[] | "all") => void;
  onDismissProposed: (id: string) => void;
  onAddHighlight: (highlight: Omit<Highlight, "id">) => void;
  onChangeHighlight: (id: string, category: Category) => void;
  onRemoveHighlight: (id: string) => void;
  /** A highlight as a quote with a link back, for the notes. */
  quoteOf: (highlight: Highlight) => { html: string; text: string };
  onAddToNotes: (highlight: Highlight) => void;
  target: ReaderTarget | null;
  onBack: () => void;
  backLabel: string;
  /** The notes on the item, shown next to the source. */
  notes: React.ReactNode;
}

/** A source to read and highlight, with the highlights and notes next to it. */
export function Reader(props: ReaderProps) {
  const { file, readBytes, highlights, proposed, target } = props;
  // The passage a link from the assistant's writing opened, marked until another is.
  const [passage, setPassage] = useState<{ page: number | null; text: string } | null>(
    null,
  );
  const marks = useMemo<Marked[]>(
    () => [
      ...highlights,
      ...proposed.map((h) => ({
        ...h,
        id: PROPOSED + h.id,
        className: `hl-mark hl-proposed hl-${h.category}`,
      })),
      ...(passage
        ? [
            {
              id: PASSAGE,
              category: "quote" as const,
              page: passage.page,
              text: passage.text,
              className: "hl-mark hl-passage",
            },
          ]
        : []),
    ],
    [highlights, proposed, passage],
  );
  const [bytes, setBytes] = useState<{ file: string; data: ArrayBuffer | null } | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [query, setQuery] = useState(target?.find ?? "");
  const [texts, setTexts] = useState<string[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    text: string;
    page: number | null;
  } | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const pdf = isPdf(file);

  useEffect(() => {
    let current = true;
    readBytes(file).then(
      (data) => current && setBytes({ file, data }),
      () => current && setBytes({ file, data: null }),
    );
    return () => {
      current = false;
    };
  }, [file, readBytes]);
  const data = bytes?.file === file ? bytes.data : undefined;

  // The text of every page, for finding: read once, when first asked for.
  useEffect(() => {
    if (!query.trim() || texts || !data) return;
    let cancelled = false;
    void (async () => {
      if (!pdf) {
        if (!cancelled) setTexts(htmlPages(new TextDecoder().decode(data)));
        return;
      }
      const doc = await openPdf(data);
      const found: string[] = [];
      for (let n = 1; n <= doc.numPages && !cancelled; n++)
        found.push(await pageText(doc, n));
      void doc.loadingTask.destroy();
      if (!cancelled) setTexts(found);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query, texts, data, pdf]);

  const matches = useMemo(() => {
    if (!texts || !query.trim()) return [];
    return texts.flatMap((text, i) =>
      matchesIn(text, query).map((_, nth) => ({ page: pdf ? i + 1 : null, nth })),
    );
  }, [texts, query, pdf]);
  const shownMatch = matches.length ? Math.min(current, matches.length - 1) : -1;
  const finding = useMemo<Finding | null>(
    () =>
      query.trim()
        ? {
            query: query.trim(),
            page: shownMatch >= 0 ? matches[shownMatch].page : null,
            nth: shownMatch >= 0 ? matches[shownMatch].nth : -1,
          }
        : null,
    [query, matches, shownMatch],
  );

  const go = (next: Pending) =>
    setRequest((current) => ({ ...next, id: (current?.id ?? 0) + 1 }));

  // A place asked for from outside: a link in a note, or a search result.
  const [seenTarget, setSeenTarget] = useState<number | null>(null);
  if (target && target.nonce !== seenTarget) {
    setSeenTarget(target.nonce);
    if (target.find) {
      setQuery(target.find);
      setCurrent(0);
    }
    if (target.passage) setPassage({ page: target.page, text: target.passage });
    go({
      page: target.page,
      highlight:
        target.highlight && highlights.some((h) => h.id === target.highlight)
          ? target.highlight
          : target.passage
            ? PASSAGE
            : null,
      find: Boolean(target.find),
    });
  }

  const showMatch = (index: number) => {
    if (!matches.length) return;
    const at = (index + matches.length) % matches.length;
    setCurrent(at);
    go({ page: matches[at].page, highlight: null, find: true });
  };
  // The first match is shown once the pages' text is read.
  const matchKey = matches.length ? `${query}|${matches.length}` : "";
  const [shownKey, setShownKey] = useState("");
  if (matchKey && matchKey !== shownKey) {
    setShownKey(matchKey);
    go({ page: matches[0].page, highlight: null, find: true });
  }

  // Cmd/Ctrl + F finds in the source.
  useEffect(() => {
    const focus = () => {
      findInput.current?.focus();
      findInput.current?.select();
    };
    window.addEventListener("binder:find-in-source", focus);
    return () => window.removeEventListener("binder:find-in-source", focus);
  }, []);

  // A selection in the source offers the categories.
  const offer = () => {
    const selection = window.getSelection();
    const root = scroller.current;
    if (!selection || selection.isCollapsed || !root || !selection.rangeCount) {
      setMenu(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const text = oneLine(selection.toString());
    if (text.length < 2) return;
    const start =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const shell = start?.closest<HTMLElement>("[data-page]");
    const rect = range.getBoundingClientRect();
    setMenu({
      x: Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140),
      y: rect.top,
      text,
      page: pdf && shell ? Number(shell.dataset.page) : null,
    });
  };

  const highlight = (category: Category) => {
    if (!menu) return;
    props.onAddHighlight({ category, page: menu.page, text: menu.text });
    window.getSelection()?.removeAllRanges();
    setMenu(null);
  };

  const sorted = useMemo(
    () =>
      highlights
        .map((h, order) => ({ h, order }))
        .sort((a, b) => (a.h.page ?? 0) - (b.h.page ?? 0) || a.order - b.order)
        .map(({ h }) => h),
    [highlights],
  );

  const zoomBy = (step: number) => {
    const at = ZOOMS.findIndex((z) => z >= zoom - 0.001);
    setZoom(ZOOMS[Math.min(Math.max((at < 0 ? 4 : at) + step, 0), ZOOMS.length - 1)]);
    setMenu(null);
  };

  return (
    <div className="reader">
      <div className="reader-bar" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="grid size-6 flex-none place-items-center rounded-md hover:bg-muted hover:text-foreground"
          aria-label={props.backLabel}
          title={props.backLabel}
          onClick={props.onBack}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {props.title}
        </span>
        <div className="reader-find">
          <Search className="size-3.5 flex-none text-muted-foreground" aria-hidden />
          <input
            ref={findInput}
            value={query}
            placeholder="Find in source"
            aria-label="Find in source"
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrent(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                showMatch(shownMatch + (event.shiftKey ? -1 : 1));
              } else if (event.key === "Escape") {
                setQuery("");
              }
            }}
          />
          {query.trim() && (
            <>
              <span className="flex-none text-2xs text-muted-foreground tabular-nums">
                {!texts
                  ? "…"
                  : matches.length
                    ? `${shownMatch + 1} of ${matches.length}`
                    : "None"}
              </span>
              <button
                type="button"
                className="card-button"
                aria-label="Previous match"
                disabled={!matches.length}
                onClick={() => showMatch(shownMatch - 1)}
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="card-button"
                aria-label="Next match"
                disabled={!matches.length}
                onClick={() => showMatch(shownMatch + 1)}
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="card-button"
                aria-label="Stop finding"
                onClick={() => setQuery("")}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
        {pdf && pages > 0 && (
          <span className="flex-none tabular-nums" aria-live="polite">
            p. {page} of {pages}
          </span>
        )}
        <div className="flex flex-none items-center">
          <button
            type="button"
            className="card-button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoom <= ZOOMS[0]}
            onClick={() => zoomBy(-1)}
          >
            <ZoomOut className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            className="w-10 text-center tabular-nums hover:text-foreground"
            title="Fit the width"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="card-button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= ZOOMS[ZOOMS.length - 1]}
            onClick={() => zoomBy(1)}
          >
            <ZoomIn className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <div className="reader-body">
        <div
          ref={scroller}
          className="reader-source"
          onPointerUp={() => setTimeout(offer)}
          onKeyUp={(event) => event.shiftKey && offer()}
          onScroll={() => menu && setMenu(null)}
        >
          {problem ? (
            <p className="p-6 text-[13px] text-muted-foreground">{problem}</p>
          ) : data === undefined ? (
            <p className="p-6 text-[13px] text-muted-foreground">Opening the source…</p>
          ) : data === null ? (
            <p className="p-6 text-[13px] text-muted-foreground">
              The file can't be read. It may have been moved or deleted.
            </p>
          ) : pdf ? (
            <PdfSource
              bytes={data}
              zoom={zoom}
              highlights={marks}
              finding={finding}
              request={request}
              scroller={scroller}
              onPage={setPage}
              onPages={setPages}
              onError={setProblem}
            />
          ) : (
            <HtmlSource
              bytes={data}
              zoom={zoom}
              highlights={marks}
              finding={finding}
              request={request}
              scroller={scroller}
              onPage={setPage}
              onPages={setPages}
              onError={setProblem}
            />
          )}
        </div>
        <aside className="reader-panel" aria-label="Highlights and notes">
          <section className="reader-highlights" aria-label="Highlights">
            <h2 className="panel-heading">
              Highlights
              {highlights.length > 0 && (
                <span className="font-normal text-muted-foreground tabular-nums">
                  {highlights.length}
                </span>
              )}
            </h2>
            {sorted.length ? (
              <ul className="highlight-list">
                {sorted.map((h) => (
                  <HighlightCard
                    key={h.id}
                    highlight={h}
                    onOpen={() => go({ page: h.page, highlight: h.id, find: false })}
                    onCategory={(category) => props.onChangeHighlight(h.id, category)}
                    onRemove={() => props.onRemoveHighlight(h.id)}
                    onAddToNotes={() => props.onAddToNotes(h)}
                    dragData={() => props.quoteOf(h)}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-3 text-xs text-muted-foreground">
                Select text in the source to highlight it as a claim, definition,
                method, finding or quote.
              </p>
            )}
          </section>
          {proposed.length > 0 && (
            <section className="reader-proposed" aria-label="Proposed highlights">
              <h2 className="panel-heading">
                <Sparkles className="size-3 text-tint" aria-hidden />
                Proposed by the assistant
                <span className="flex-1" />
                <button
                  type="button"
                  className="h-6 rounded-[5px] px-1.5 text-xs font-medium text-tint-foreground hover:bg-tint-soft"
                  onClick={() => props.onKeepProposed("all")}
                >
                  Keep all
                </button>
              </h2>
              <ul className="highlight-list">
                {[...proposed]
                  .sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
                  .map((h) => (
                    <ProposedCard
                      key={h.id}
                      highlight={h}
                      onOpen={() =>
                        go({ page: h.page, highlight: PROPOSED + h.id, find: false })
                      }
                      onKeep={() => props.onKeepProposed([h.id])}
                      onDismiss={() => props.onDismissProposed(h.id)}
                    />
                  ))}
              </ul>
            </section>
          )}
          <section className="reader-notes" aria-label="Notes">
            <h2 className="panel-heading">
              Notes
              {sorted.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  Drag a highlight here to quote it
                </span>
              )}
            </h2>
            {props.notes}
          </section>
        </aside>
      </div>
      {menu && (
        <div
          className="highlight-menu"
          role="toolbar"
          aria-label="Highlight as"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.preventDefault()}
        >
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => highlight(category.id)}
            >
              <span className={cn("category-dot", `dot-${category.id}`)} />
              {categoryLabel(category.id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
