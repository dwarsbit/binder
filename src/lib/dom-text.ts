import { normalize } from "./text";

/**
 * Finding text on screen: in a PDF page's text layer or a kept web
 * page, as search and highlights compare it (see `normalize`).
 */

const SAME: Record<string, string> = {
  "“": '"',
  "”": '"',
  "„": '"',
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "–": "-",
  "—": "-",
};

interface TextMap {
  /** The text, normalized and in lower case. */
  text: string;
  /** For each character of `text`, the node and offset it came from. */
  at: Array<{ node: Text; offset: number }>;
}

/** The text under `root`, normalized, with where each character came from. */
export function textMap(root: Element): TextMap {
  let text = "";
  const at: TextMap["at"] = [];
  let space = true;
  let last: { node: Text; offset: number } | null = null;
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 1) {
      const name = (node as Element).tagName;
      if (
        (name === "BR" ||
          /^(P|LI|H\d|BLOCKQUOTE|TR|TD|TH|DT|DD|FIGCAPTION|PRE)$/.test(name)) &&
        !space &&
        last
      ) {
        text += " ";
        at.push(last);
        space = true;
      }
      continue;
    }
    const value = (node as Text).data;
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (char === "­") continue;
      if (/\s/.test(char)) {
        if (space) continue;
        text += " ";
        at.push({ node: node as Text, offset: i });
        space = true;
        continue;
      }
      const lower = (SAME[char] ?? char).toLowerCase();
      // A letter whose lower case is longer keeps its own length.
      text += lower.length === 1 ? lower : char;
      at.push({ node: node as Text, offset: i });
      space = false;
    }
    if (value.length) last = { node: node as Text, offset: value.length - 1 };
  }
  return { text, at };
}

/** The range of the `nth` match of `quote` under `root`, or null. */
export function rangeOf(
  root: Element,
  quote: string,
  nth = 0,
  map = textMap(root),
): Range | null {
  const needle = normalize(quote).toLowerCase();
  if (!needle) return null;
  let found = -1;
  for (let n = 0, from = 0; n <= nth; n++) {
    found = map.text.indexOf(needle, from);
    if (found < 0) return null;
    from = found + needle.length;
  }
  const start = map.at[found];
  const end = map.at[found + needle.length - 1];
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The boxes a range covers, relative to `container`, one per line piece. */
export function boxesOf(range: Range, container: Element): Box[] {
  const origin = container.getBoundingClientRect();
  const boxes: Box[] = [];
  for (const rect of range.getClientRects()) {
    if (rect.width < 1 || rect.height < 1) continue;
    const box = {
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
    };
    // Pieces on the same line become one box.
    const same = boxes.find(
      (other) =>
        Math.abs(other.top - box.top) < box.height / 2 &&
        box.left <= other.left + other.width + 4 &&
        other.left <= box.left + box.width + 4,
    );
    if (same) {
      const right = Math.max(same.left + same.width, box.left + box.width);
      const bottom = Math.max(same.top + same.height, box.top + box.height);
      same.left = Math.min(same.left, box.left);
      same.top = Math.min(same.top, box.top);
      same.width = right - same.left;
      same.height = bottom - same.top;
    } else {
      boxes.push(box);
    }
  }
  return boxes;
}
