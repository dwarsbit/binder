/** Small things this window remembers; the app works without them. */
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is full or off.
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function forget(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is off.
  }
}

/** The binder folder the desktop app had open last. */
export const loadFolder = () => recall("binder.folder");
export const saveFolder = (path: string) => remember("binder.folder", path);
export const forgetFolder = () => forget("binder.folder");

/** The view a binder opened last: a list, or an item by its path. */
export const loadView = () => recall("binder.view");
export const saveView = (view: string) => remember("binder.view", view);

/** How the reading list shows: as a list or as a board. */
export const loadLayout = (): "list" | "board" =>
  recall("binder.layout") === "list" ? "list" : "board";
export const saveLayout = (layout: "list" | "board") =>
  remember("binder.layout", layout);

const SIDEBAR_WIDTH = 248;
export function loadSidebarWidth(): number {
  const width = Number(recall("binder.sidebar-width"));
  return Number.isFinite(width) && width > 0 ? width : SIDEBAR_WIDTH;
}
export const saveSidebarWidth = (width: number) =>
  remember("binder.sidebar-width", String(Math.round(width)));
