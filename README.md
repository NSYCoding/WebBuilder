# WebBuilder

A desktop website builder for restaurants, built with Electron. Front-end only for now: no backend, everything is saved locally.

## Run

```
npm install
npm start
```

## Features

- Live preview with desktop / tablet / mobile widths
- Sections: Hero, About, Menu (categories + dishes), Gallery, Reviews, Hours, Reservations form, Contact
- Reorder, hide, add and delete sections; per-section editing
- Design tab: colours, heading/body fonts, corner radius
- 3 starter templates (Classic Bistro, Modern Sushi Bar, Rustic Pizzeria)
- Native file dialogs: **Export HTML** (single standalone file), **Save / Open project** (`.wbproj`), preview in the system browser
- Autosaves to IndexedDB (restored on next launch)

## Code layout

Plain browser scripts (no bundler); each file attaches to a shared `window.WB` namespace and the load order is in `index.html`.

| File | Responsibility |
| --- | --- |
| `main.js` | Electron main process: window, native file dialogs |
| `preload.js` | Sandboxed IPC bridge exposed as `window.desktop` |
| `js/schema.js` | Section definitions; drive the forms and defaults for new sections |
| `js/presets.js` | Starter templates |
| `js/site-assets.js` | CSS and scripts embedded into every generated site |
| `js/renderer.js` | Project -> standalone HTML (all user content is escaped/sanitised here) |
| `js/dom.js` | `h()` element helper |
| `js/db.js` | Promise wrapper around IndexedDB |
| `js/store.js` | Current project, change notifications, IndexedDB autosave |
| `js/preview.js` | Live preview iframe and its postMessage protocol |
| `js/fields.js` | Schema-driven form controls (text, image, list, ...) |
| `js/panels.js` | Sections / Design / Site tabs |
| `js/app.js` | Wires toolbar, templates and device switcher together |

To add a section type: add its schema in `schema.js` and a renderer in `renderer.js`.
