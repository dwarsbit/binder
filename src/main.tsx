import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Desktop } from "./components/Desktop";
import { isDesktop } from "@cursive/editor/lib/platform";
import { SAMPLE_BINDER, SAMPLE_FILES } from "./lib/sample";
import { browserStore } from "./lib/store";
import "./index.css";

// The theme follows the system until the app has its own setting.
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () =>
  document.documentElement.classList.toggle("dark", dark.matches);
applyTheme();
dark.addEventListener("change", applyTheme);

// The desktop app has its own menus: the webview's (Reload, Inspect
// Element) shows only in fields, for spelling and copy and paste, and
// in development.
if (isDesktop && import.meta.env.PROD) {
  window.addEventListener("contextmenu", (event) => {
    const target = event.target as Element | null;
    if (!target?.closest?.("input, textarea, [contenteditable='true'], .cm-editor")) {
      event.preventDefault();
    }
  });
}

// The desktop app keeps a binder as a folder on disk. In a browser,
// `pnpm dev` opens the demo, which keeps a sample binder in the
// browser's own storage.
const app = isDesktop ? (
  <Desktop />
) : (
  <App store={browserStore(SAMPLE_BINDER, SAMPLE_FILES)} />
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{app}</React.StrictMode>,
);
