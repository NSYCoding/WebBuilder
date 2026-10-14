# Termux Explorer

A web file explorer for Termux. It runs a local server on your phone, and you use it from the browser.
From the browser you can browse, edit, upload and download files, serve any folder on a localhost port,
and run scripts. It has no dependencies.

## Setup

```
pkg install nodejs git        # python/ruby/php only if you want to run those scripts
git clone <this repo> && cd WebBuilder/termux-explorer
node server.js                # optional: node server.js ~/projects --port 9000
```

It prints a URL like `http://localhost:8080/?token=…`. Open that in your phone browser. The token sets a
cookie on the first visit.

## Features

- Browse folders, view and edit text files (Ctrl+S saves), preview images, download files
- New file or folder, rename, delete, upload
- **Serve**: click *Serve this folder* (or *Serve* on a folder row), pick a port (1024–65535), and the folder is
  served as a static site at `http://localhost:<port>/`. It uses `index.html` if present, otherwise a directory listing.
  Servers can be stopped from the ⚙ panel.
- **Run**: `.js .py .sh .rb .php .pl .lua` files get a Run button. Output streams into the ⚙ panel, and you can kill the process.

## Security

- Binds to `127.0.0.1` only and rejects non-loopback `Host` headers
- A random token is required (printed at startup, regenerated each run)
- All paths are confined to the root directory (default `$HOME`)
- Run executes real code with your Termux permissions, so don't expose the port with a tunnel or proxy
