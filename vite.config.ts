import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

/** What the editor package imports. Add a module here when it imports a new one. */
const EDITOR_DEPS = [
  "@codemirror/commands",
  "@codemirror/lang-markdown",
  "@codemirror/lang-yaml",
  "@codemirror/language",
  "@codemirror/state",
  "@codemirror/view",
  "@floating-ui/dom",
  "@lezer/highlight",
  "@tiptap/core",
  "@tiptap/extension-code-block-lowlight",
  "@tiptap/extension-details",
  "@tiptap/extension-drag-handle-react",
  "@tiptap/extension-highlight",
  "@tiptap/extension-list",
  "@tiptap/extension-mathematics",
  "@tiptap/extension-table",
  "@tiptap/extensions",
  "@tiptap/markdown",
  "@tiptap/pm/model",
  "@tiptap/pm/state",
  "@tiptap/pm/view",
  "@tiptap/react",
  "@tiptap/starter-kit",
  "@tiptap/suggestion",
  "katex",
  "lowlight",
  "lucide-react",
  "yaml",
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
    // The editor package and the app share one copy of each of these.
    dedupe: ["react", "react-dom", "@tiptap/core", "@tiptap/pm", "@tiptap/react"],
  },
  // The editor package ships its TypeScript sources and is served as
  // they are, like the app's own. Vite bundles only the dependencies of
  // the app's own files for the browser, so the package's are named
  // here: each one then exists once, and the CommonJS ones load.
  optimizeDeps: {
    exclude: ["@cursive/editor"],
    include: EDITOR_DEPS.map((dep) => `@cursive/editor > ${dep}`),
  },
  // The desktop app loads the dev server from a fixed port, next to
  // Cursive's 1430, and its Rust errors stay on screen.
  clearScreen: false,
  server: {
    port: 1440,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
