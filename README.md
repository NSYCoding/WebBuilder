# WebBuilder

A desktop website builder for restaurants, built with Electron. Front-end only for now: no backend, everything is saved locally.

## Run

```
npm install
npm start
```

Run it as a normal user. Electron refuses to start as root ("Running as root without --no-sandbox is not supported"). If you must run as root (for example in a container), use `npm run start:no-sandbox`, which turns off Chromium's sandbox.

## Features

**Visual editor**
- Click any text in the live preview to edit it in place
- Hover a section for a toolbar: move up/down, hide, delete, or edit with AI; click a section to select it and open its settings
- Sections: Hero, About, Menu (categories + dishes), Gallery, Reviews, Hours, Reservations form, Contact
- Design tab (colours, fonts, corners), 3 starter templates, desktop / tablet / mobile preview widths
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z) for structural and AI changes
- Autosaves to IndexedDB; Export HTML (one standalone file), Save / Open project (`.wbproj`)

**AI assistant** (✨ AI tab, runs locally with [Ollama](https://ollama.com))
- Chat: "make the menu more appetizing", "switch to a dark look", "add a reservations section"
- Generate a whole site from a restaurant name and cuisine
- Select a section in the preview, then tell the assistant what to change about it
- Two local models: an **LLM** that writes the edits and an **embedding model** that finds the parts of your site relevant to each request (retrieval keeps the prompt small enough for local models). Nothing leaves your machine.
- Every AI change is one undoable step, and the model never touches the project directly (see below)

### Setting up the assistant

```
ollama serve                    # if Ollama is not already running
ollama pull llama3.1:8b         # language model (any chat model works; larger = better)
ollama pull nomic-embed-text    # embedding model
```

The AI tab detects installed models and lets you pick one of each, or point to a different Ollama address.

## How the AI edits work

1. The project is split into small addressable chunks (site details, each section, each dish / review / hours row).
2. The embedding model ranks the chunks against your request; the best ones (plus an outline of all sections and the selected section) go into the prompt. Chunk embeddings are cached, so only changed text is re-embedded.
3. The LLM replies with JSON: a short message and a list of operations (`set`, `add_section`, `set_theme`, ...).
4. The editor applies the operations to a **copy** of the project through `js/ai-ops.js`, which treats the output as untrusted: unknown operations, bad ids, invalid colours/fonts and unknown fields are dropped and reported, and images are never set by AI. Only if something valid remains is it committed as one undoable step.

## Code layout

Plain browser scripts (no bundler); each file attaches to a shared `window.WB` namespace and the load order is in `index.html`.

| File | Responsibility |
| --- | --- |
| `main.js` | Electron main process: window, native file dialogs |
| `preload.js` | Sandboxed IPC bridge exposed as `window.desktop` |
| `js/schema.js` | Section definitions; drive the forms and defaults for new sections |
| `js/presets.js` | Starter templates |
| `ai.js` | Main process: Ollama client, embedding retrieval, prompt, streaming |
| `js/site-assets.js` | CSS and scripts embedded into every generated site |
| `js/canvas-assets.js` | Editor-only CSS/script injected into the preview (inline editing, toolbar, selection) |
| `js/content.js` | Schema-validated reads/writes of section content; chunking for retrieval |
| `js/ai-ops.js` | Validates and applies the operations the model returns |
| `js/ai-panel.js` | The AI tab: chat, generator, Ollama setup and model settings |
| `js/renderer.js` | Project -> standalone HTML (all user content is escaped/sanitised here) |
| `js/dom.js` | `h()` element helper |
| `js/db.js` | Promise wrapper around IndexedDB |
| `js/store.js` | Current project, change notifications, undo/redo, section operations, IndexedDB autosave |
| `js/preview.js` | Preview iframe, canvas message bridge, inline-edit application |
| `js/fields.js` | Schema-driven form controls (text, image, list, ...) |
| `js/panels.js` | AI / Sections / Design / Site tabs |
| `js/app.js` | Wires toolbar, templates and device switcher together |

To add a section type: add its schema in `schema.js` and a renderer in `renderer.js`.
