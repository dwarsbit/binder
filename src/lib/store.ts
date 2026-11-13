import { invoke } from "@tauri-apps/api/core";
import { mediaType } from "@cursive/editor/lib/file-types";
import type { Project } from "@cursive/editor/lib/paths";

/**
 * Where a binder is kept: a folder on disk in the desktop app, or this
 * browser's own storage for the demo.
 */
export interface BinderStore {
  /** Where the binder is kept, for the status bar and the delete question. */
  place: "disk" | "browser";
  load(): Promise<Project>;
  writePage(path: string, source: string): Promise<void>;
  createFolder(path: string): Promise<void>;
  /** Moves a page or a file, or a folder with everything in it. */
  rename(from: string, to: string): Promise<void>;
  /** Deletes a page or a file, or a folder with everything in it. */
  remove(path: string): Promise<void>;
  /** Adds a file that isn't a page, such as a PDF, or replaces it. */
  writeFile(path: string, data: Blob): Promise<void>;
  /** An address the window can show a file at; null when the file can't be read. */
  fileUrl(path: string): Promise<string | null>;
  /** Opens a file in the app your computer opens it with, or saves it. */
  openFile(path: string): Promise<void>;
  /** A file's bytes; null when it can't be read. Also reads `.binder/`. */
  readBytes(path: string): Promise<ArrayBuffer | null>;
  /** The checksum of every file, by path; absent where files have none. */
  fileHashes?(): Promise<Record<string, string>>;
  /** Fetches a web address: a page with its HTML, or anything else with its type. Desktop only. */
  fetchWeb?(url: string): Promise<{ url: string; contentType: string; html: string }>;
  /** Saves the file behind a web address into the binder. Desktop only. */
  download?(url: string, path: string): Promise<void>;
}

/** The binder with a page, file or folder moved; a folder takes its contents along. */
export function renameIn(project: Project, from: string, to: string): Project {
  if (from === to) return project;
  const move = (path: string) =>
    path === from
      ? to
      : path.startsWith(`${from}/`)
        ? to + path.slice(from.length)
        : path;
  return {
    ...project,
    folders: project.folders.map(move),
    pages: Object.fromEntries(
      Object.entries(project.pages).map(([path, source]) => [move(path), source]),
    ),
    files: (project.files ?? []).map(move),
  };
}

/** The binder without a page, file or folder; a folder takes its contents along. */
export function removeFrom(project: Project, path: string): Project {
  const gone = (p: string) => p === path || p.startsWith(`${path}/`);
  return {
    ...project,
    folders: project.folders.filter((f) => !gone(f)),
    pages: Object.fromEntries(Object.entries(project.pages).filter(([p]) => !gone(p))),
    files: (project.files ?? []).filter((f) => !gone(f)),
  };
}

/** How long typing rests before a page is written to disk. */
const WRITE_DELAY = 400;

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : String(error));
};

/**
 * A binder as a folder on disk. Pages are written a moment after the
 * last change, and always before anything that moves or deletes them.
 * As Cursive keeps a project (dwarsbit/cursive, src/lib/desktop-store.ts).
 */
export function desktopStore(
  dir: string,
): BinderStore & { flush: () => Promise<void> } {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
  // Changes run one after another, in the order they were made.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    const writes = [...pending];
    const waiters = waiting;
    pending.clear();
    waiting = [];
    return enqueue(async () => {
      try {
        for (const [path, source] of writes) {
          await invoke("project_write_page", { dir, path, source });
        }
        waiters.forEach((waiter) => waiter.resolve());
      } catch (error) {
        waiters.forEach((waiter) => waiter.reject(error));
        throw error;
      }
    });
  };

  // Files shown in the window, by path: read from disk once, until they change.
  const urls = new Map<string, Promise<string | null>>();
  const forget = (path: string) => {
    for (const [key, url] of [...urls]) {
      if (key !== path && !key.startsWith(`${path}/`)) continue;
      urls.delete(key);
      void url.then((found) => found && URL.revokeObjectURL(found));
    }
  };

  return {
    place: "disk",
    flush,
    load: () => invoke<Project>("project_load", { dir }).catch(fail),
    writePage: (path, source) => {
      pending.set(path, source);
      clearTimeout(timer);
      timer = setTimeout(() => void flush().catch(() => {}), WRITE_DELAY);
      return new Promise<void>((resolve, reject) =>
        waiting.push({ resolve, reject }),
      ).catch(fail);
    },
    createFolder: (path) =>
      enqueue(() => invoke<void>("project_create_folder", { dir, path })).catch(fail),
    writeFile: (path, data) =>
      enqueue(async () => {
        const bytes = new Uint8Array(await data.arrayBuffer());
        await invoke("project_write_file", bytes, {
          headers: { dir: encodeURIComponent(dir), path: encodeURIComponent(path) },
        });
        forget(path);
      }).catch(fail),
    fileUrl: (path) => {
      let url = urls.get(path);
      if (!url) {
        url = invoke<ArrayBuffer>("project_read_file", { dir, path }).then(
          (bytes) => URL.createObjectURL(new Blob([bytes], { type: mediaType(path) })),
          () => null,
        );
        urls.set(path, url);
      }
      return url;
    },
    openFile: (path) => invoke<void>("project_open_file", { dir, path }).catch(fail),
    readBytes: (path) =>
      invoke<ArrayBuffer>("project_read_file", { dir, path }).catch(() => null),
    fileHashes: async () => {
      const files = await invoke<Record<string, { hash: string }>>("project_files", {
        dir,
      }).catch(fail);
      return Object.fromEntries(
        Object.entries(files).map(([path, info]) => [path, info.hash]),
      );
    },
    fetchWeb: (url) =>
      invoke<{ url: string; contentType: string; html: string }>("web_fetch", {
        url,
      }).catch(fail),
    download: (url, path) =>
      enqueue(async () => {
        await invoke<void>("web_download", { dir, url, path });
        forget(path);
      }).catch(fail),
    rename: async (from, to) => {
      forget(from);
      await flush().catch(() => {});
      return enqueue(() => invoke<void>("project_rename", { dir, from, to })).catch(
        fail,
      );
    },
    remove: async (path) => {
      forget(path);
      // A page about to be deleted needs no last write.
      for (const key of [...pending.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) pending.delete(key);
      }
      await flush().catch(() => {});
      return enqueue(() => invoke<void>("project_remove", { dir, path })).catch(fail);
    },
  };
}

/** A file as an address that holds its bytes. */
const dataUrl = (data: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(data);
  });

const KEY = "binder.demo.v2";
const FILES_KEY = "binder.demo-files.v2";

/**
 * A binder kept in this browser's storage: the demo that `pnpm dev`
 * opens. It starts as a copy of `seed`.
 */
export function browserStore(
  seed: Project,
  seedFiles: Record<string, string> = {},
): BinderStore {
  let project: Project | null = null;
  let files: Record<string, string> | null = null;

  const readFiles = (): Record<string, string> => {
    if (files) return files;
    try {
      const raw = localStorage.getItem(FILES_KEY);
      const value: unknown = raw ? JSON.parse(raw) : null;
      files =
        value && typeof value === "object"
          ? (value as Record<string, string>)
          : { ...seedFiles };
    } catch {
      files = { ...seedFiles };
    }
    return files;
  };
  const writeFiles = (next: Record<string, string>) => {
    try {
      localStorage.setItem(FILES_KEY, JSON.stringify(next));
    } catch {
      throw new Error("This browser's storage is full. Try a smaller file.");
    }
    files = next;
  };
  const moveFiles = (move: (path: string) => string | null) => {
    const next: Record<string, string> = {};
    for (const [path, url] of Object.entries(readFiles())) {
      const to = move(path);
      if (to) next[to] = url;
    }
    writeFiles(next);
  };

  const read = (): Project => {
    if (project) return project;
    try {
      const raw = localStorage.getItem(KEY);
      const value = raw ? (JSON.parse(raw) as Partial<Project>) : null;
      if (
        value &&
        typeof value.name === "string" &&
        Array.isArray(value.folders) &&
        value.pages &&
        typeof value.pages === "object"
      ) {
        project = { name: value.name, folders: value.folders, pages: value.pages };
        return project;
      }
    } catch {
      // Storage is off or holds something else: start from the seed.
    }
    project = structuredClone(seed);
    return project;
  };
  const write = (next: Project) => {
    project = { name: next.name, folders: next.folders, pages: next.pages };
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
    } catch {
      throw new Error("This browser's storage is full or turned off.");
    }
  };

  return {
    place: "browser",
    load: async () => ({ ...read(), files: Object.keys(readFiles()).sort() }),
    writePage: async (path, source) => {
      const current = read();
      write({ ...current, pages: { ...current.pages, [path]: source } });
    },
    createFolder: async (path) => {
      const current = read();
      if (!current.folders.includes(path))
        write({ ...current, folders: [...current.folders, path] });
    },
    rename: async (from, to) => {
      write(renameIn(read(), from, to));
      moveFiles((path) =>
        path === from || path.startsWith(`${from}/`)
          ? to + path.slice(from.length)
          : path,
      );
    },
    remove: async (path) => {
      write(removeFrom(read(), path));
      moveFiles((file) => (file === path || file.startsWith(`${path}/`) ? null : file));
    },
    writeFile: async (path, data) => {
      writeFiles({ ...readFiles(), [path]: await dataUrl(data) });
    },
    fileUrl: async (path) => readFiles()[path] ?? null,
    readBytes: async (path) => {
      const url = readFiles()[path];
      if (!url) return null;
      const comma = url.indexOf(",");
      try {
        const binary = atob(url.slice(comma + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      } catch {
        return null;
      }
    },
    openFile: async (path) => {
      const url = readFiles()[path];
      if (!url) return;
      const link = document.createElement("a");
      link.href = url;
      link.download = path.slice(path.lastIndexOf("/") + 1);
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
  };
}
