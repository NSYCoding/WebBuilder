# WebBuilder

A desktop website builder for restaurants, built with Electron. Front-end only for now: no backend, everything is saved locally.

## Run

```
npm install
npm start
```

## Features

**Visual editor**
- Click any text in the live preview to edit it in place
- Hover a section for a toolbar: move up/down, hide, delete, or edit with AI; click a section to select it and open its settings
- Sections: Hero, About, Menu (categories + dishes), Gallery, Reviews, Hours, Reservations form, Contact
- Design tab (colours, fonts, corners), 3 starter templates, desktop / tablet / mobile preview widths
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z) for structural and AI changes
- Autosaves to IndexedDB; Export HTML (one standalone file), Save / Open project (`.wbproj`)

**AI assistant** (✨ AI tab)
- Chat: "make the menu more appetizing", "switch to a dark look", "add a reservations section"
- Generate a whole site from a restaurant name and cuisine
- Select a section in the preview, then tell the assistant what to change about it
- Bring your own Anthropic API key (stored encrypted via Electron `safeStorage`, used only in the main process). Pick Claude Opus / Sonnet / Haiku 5.5 in the AI tab.
- Every AI change is one undoable step, and the model never touches the project directly (see below)

## How the AI edits are kept safe

Claude answers by calling one tool, `edit_site`, with a list of operations (`set`, `add_section`, `set_theme`, ...). The editor applies them to a **copy** of the project through `js/ai-ops.js`, which treats the output as untrusted: unknown operations, bad ids, invalid colours/fonts and unknown fields are dropped and reported, and images are never set by AI. Only if something valid remains is it committed as one undoable step.

## Code layout

Plain browser scripts (no bundler); each file attaches to a shared `window.WB` namespace and the load order is in `index.html`.

| File | Responsibility |
| --- | --- |
| `main.js` | Electron main process: window, native file dialogs |
| `preload.js` | Sandboxed IPC bridge exposed as `window.desktop` |
| `js/schema.js` | Section definitions; drive the forms and defaults for new sections |
| `js/presets.js` | Starter templates |
| `ai.js` | Main process: API key storage, the Claude request, the `edit_site` tool |
| `js/site-assets.js` | CSS and scripts embedded into every generated site |
| `js/canvas-assets.js` | Editor-only CSS/script injected into the preview (inline editing, toolbar, selection) |
| `js/content.js` | Schema-validated reads/writes of section content (shared by canvas edits and AI) |
| `js/ai-ops.js` | Validates and applies the operations the model returns |
| `js/ai-panel.js` | The AI tab: chat, generator, key and model settings |
| `js/renderer.js` | Project -> standalone HTML (all user content is escaped/sanitised here) |
| `js/dom.js` | `h()` element helper |
| `js/db.js` | Promise wrapper around IndexedDB |
| `js/store.js` | Current project, change notifications, undo/redo, section operations, IndexedDB autosave |
| `js/preview.js` | Preview iframe, canvas message bridge, inline-edit application |
| `js/fields.js` | Schema-driven form controls (text, image, list, ...) |
| `js/panels.js` | AI / Sections / Design / Site tabs |
| `js/app.js` | Wires toolbar, templates and device switcher together |

To add a section type: add its schema in `schema.js` and a renderer in `renderer.js`.
