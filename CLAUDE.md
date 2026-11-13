# Notes for agents

- Every piece of user-facing text (interface strings, errors, docs, README, changelog) follows [CONTENT.md](CONTENT.md). It is Polemic's content style, copied from polemic; where it says Polemic, read Binder.
- The interface follows the Polemic UI kit, as Cursive does: the editor package's tokens (mauve grays), with petrol teal `#0f5b62` as Binder's one tint (`src/index.css`), 28px rows, sentence case.
- What Binder writes is specified in [docs/format.md](docs/format.md). Change the format there first, in the same pull request, and keep older binders opening: a new version needs a migration.
- The block editor is Cursive's package `@cursive/editor` (dwarsbit/cursive, `packages/editor`), pinned to a commit in `package.json`. Change the editor in the cursive repo, then move the pin. A module the package newly imports goes into `EDITOR_DEPS` in `vite.config.ts`.
- Every change, feature or bug fix adds its line to the `## X.Y.Z (unreleased)` section at the top of [CHANGELOG.md](CHANGELOG.md), in the same pull request. Changes the reader doesn't see (CI, refactors, tests) get no line.
- Releases are cut from that section by the Release workflow; see [docs/releasing.md](docs/releasing.md).
- Before you push: `pnpm lint`, `pnpm test` and `pnpm build`, and `cargo test` in `src-tauri` when you changed the desktop app.
