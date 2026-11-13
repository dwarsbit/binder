import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import App from "@/App";
import { BinderPicker } from "@/components/BinderPicker";
import { hasWindowButtons } from "@cursive/editor/lib/platform";
import { forgetFolder, loadFolder, saveFolder } from "@/lib/prefs";
import { desktopStore } from "@/lib/store";

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : String(error));
};

/**
 * The desktop app: a binder is a folder on disk, by default one in the
 * Binder folder in your home folder. Shows the binder that was open
 * last, or the binders to pick from.
 */
export function Desktop() {
  const [folder, setFolder] = useState(loadFolder);
  // The open binder's store, which writes to its folder.
  const store = useMemo(() => (folder ? desktopStore(folder) : null), [folder]);

  // The macOS window buttons sit over the app's top left corner, which
  // makes room for them. A full-screen window has none.
  useEffect(() => {
    if (!hasWindowButtons) return;
    const root = document.documentElement;
    root.classList.add("window-buttons");
    let live = true;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        const sync = () =>
          void appWindow.isFullscreen().then(
            (full) => live && root.classList.toggle("window-buttons", !full),
            () => {},
          );
        sync();
        const unlisten = await appWindow.onResized(sync);
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  // Items still waiting to be written are written before the window closes.
  useEffect(() => {
    if (!store) return;
    const onHide = () => void store.flush().catch(() => {});
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onHide);
      onHide();
    };
  }, [store]);

  /** Opens a folder as the binder, and puts it at the top of the recent ones. */
  const openBinder = useCallback(async (dir: string) => {
    const opened = await invoke<{ path: string }>("binders_opened", { dir }).catch(
      fail,
    );
    saveFolder(opened.path);
    setFolder(opened.path);
  }, []);

  // The binder that was open last comes back, unless its folder is gone.
  useEffect(() => {
    const last = loadFolder();
    if (!last) return;
    invoke<{ path: string }>("binders_opened", { dir: last }).then(
      (opened) => {
        saveFolder(opened.path);
        setFolder(opened.path);
      },
      () => {
        forgetFolder();
        setFolder(null);
      },
    );
  }, []);

  const closeBinder = () => {
    void store?.flush().catch(() => {});
    forgetFolder();
    setFolder(null);
  };

  const renameBinder = async (name: string) => {
    if (!folder || !store) return;
    await store.flush();
    const moved = await invoke<string>("binders_rename", { dir: folder, name }).catch(
      fail,
    );
    saveFolder(moved);
    setFolder(moved);
  };

  if (!folder) return <BinderPicker onOpen={openBinder} />;

  if (!store) return null;

  return (
    <App
      key={folder}
      store={store}
      onSwitchBinder={closeBinder}
      onRenameBinder={renameBinder}
    />
  );
}
