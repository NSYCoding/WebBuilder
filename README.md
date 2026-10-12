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
- Autosaves to local storage

## Layout

- `main.js` / `preload.js` – Electron main process and the small, sandboxed IPC bridge
- `index.html`, `css/app.css`, `js/editor.js` – editor UI
- `js/schema.js` – section definitions (drive the forms)
- `js/presets.js` – templates
- `js/renderer.js` – project → standalone HTML
