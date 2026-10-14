#!/usr/bin/env node
// Termux File Explorer: browse/edit files, serve any folder on a localhost port,
// and run scripts. Zero dependencies; needs only `pkg install nodejs`.
//
//   node server.js [rootDir] [--port 8080]
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const pi = args.indexOf('--port');
const PORT = pi >= 0 ? Number(args.splice(pi, 2)[1]) : 8080;
const ROOT = path.resolve(args[0] || process.env.HOME || process.cwd());
const TOKEN = crypto.randomBytes(12).toString('hex');
const PUBLIC = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain', '.md': 'text/plain',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.wasm': 'application/wasm',
};
const mime = (f) => (MIME[path.extname(f).toLowerCase()] || 'application/octet-stream');

// Interpreter chosen by extension for the "Run" button.
const RUNNERS = {
  '.js': ['node'], '.mjs': ['node'], '.py': ['python'], '.sh': ['bash'],
  '.rb': ['ruby'], '.php': ['php'], '.pl': ['perl'], '.lua': ['lua'],
};

// Resolve a client path (relative to ROOT) and refuse anything that escapes it.
function safe(rel) {
  const full = path.resolve(ROOT, '.' + path.sep + (rel || ''));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) throw httpErr(403, 'Outside root');
  return full;
}
function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }
const toRel = (full) => path.relative(ROOT, full).split(path.sep).join('/');

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = (req, limit = 512 * 1024 * 1024) => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > limit) { no(httpErr(413, 'Too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', no);
});
const readJson = async (req) => { const b = await readBody(req, 1e6); return b.length ? JSON.parse(b) : {}; };

// ---------- Static servers (one per served folder/port) ----------
const servers = new Map(); // port -> { port, dir, server }

function startStatic(dir, port) {
  return new Promise((ok, no) => {
    if (servers.has(port) || port === PORT) return no(httpErr(409, `Port ${port} already in use`));
    const srv = http.createServer(async (req, res) => {
      try {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let full = path.resolve(dir, '.' + path.sep + p);
        if (full !== dir && !full.startsWith(dir + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
        let st = await fsp.stat(full).catch(() => null);
        if (st && st.isDirectory()) {
          const idx = path.join(full, 'index.html');
          if (await fsp.stat(idx).catch(() => null)) { full = idx; st = await fsp.stat(idx); }
          else {
            const names = (await fsp.readdir(full)).sort();
            const base = p.endsWith('/') ? p : p + '/';
            const html = '<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px sans-serif"><h3>Index of ' + escapeHtml(p) + '</h3>' +
              names.map((n) => `<div><a href="${encodeURI(base + n)}">${escapeHtml(n)}</a></div>`).join('');
            res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(html);
          }
        }
        if (!st) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': mime(full), 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
        fs.createReadStream(full).pipe(res);
      } catch { res.writeHead(500); res.end('Error'); }
    });
    srv.once('error', (e) => no(httpErr(400, e.code === 'EADDRINUSE' ? `Port ${port} is busy` : e.message)));
    srv.listen(port, '127.0.0.1', () => { servers.set(port, { port, dir, server: srv }); ok(); });
  });
}
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Processes (the Run button) ----------
const procs = new Map(); // id -> { id, cmd, file, log, running, code, child }
let procSeq = 0;

function runFile(full) {
  const ext = path.extname(full).toLowerCase();
  const runner = RUNNERS[ext];
  if (!runner) throw httpErr(400, `No runner for "${ext}" files`);
  const id = ++procSeq;
  const child = spawn(runner[0], [...runner.slice(1), full], { cwd: path.dirname(full), env: process.env });
  const p = { id, file: toRel(full), cmd: `${runner[0]} ${path.basename(full)}`, log: '', running: true, code: null, child };
  const add = (d) => { p.log = (p.log + d).slice(-100000); };
  child.stdout.on('data', add); child.stderr.on('data', add);
  child.on('error', (e) => { add(`\n[${e.code === 'ENOENT' ? runner[0] + ' not installed (pkg install …)' : e.message}]\n`); p.running = false; });
  child.on('close', (c) => { p.running = false; p.code = c; add(`\n[exited ${c}]\n`); });
  procs.set(id, p);
  return p;
}
const pubProc = ({ child, ...p }) => p;

// ---------- API ----------
async function api(req, res, url) {
  const q = url.searchParams;
  const route = `${req.method} ${url.pathname}`;
  switch (route) {
    case 'GET /api/info':
      return send(res, 200, { root: ROOT, port: PORT, runners: Object.keys(RUNNERS) });

    case 'GET /api/list': {
      const dir = safe(q.get('path'));
      const names = await fsp.readdir(dir);
      const items = (await Promise.all(names.map(async (name) => {
        try {
          const st = await fsp.stat(path.join(dir, name));
          return { name, dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
        } catch { return null; }
      }))).filter(Boolean);
      items.sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
      return send(res, 200, { path: toRel(dir), items });
    }

    case 'GET /api/file': { // raw bytes: view inline or ?dl=1 to download
      const f = safe(q.get('path'));
      const st = await fsp.stat(f);
      if (st.isDirectory()) throw httpErr(400, 'Is a directory');
      res.writeHead(200, {
        'Content-Type': q.get('text') ? 'text/plain; charset=utf-8' : mime(f),
        'Content-Length': st.size,
        ...(q.get('dl') ? { 'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(f))}"` } : {}),
      });
      return fs.createReadStream(f).pipe(res);
    }

    case 'PUT /api/file': {
      const f = safe(q.get('path'));
      await fsp.writeFile(f, await readBody(req));
      return send(res, 200, { ok: true });
    }

    case 'POST /api/upload': { // raw body, ?path=dir&name=file
      const name = path.basename(q.get('name') || '');
      if (!name) throw httpErr(400, 'Missing name');
      const f = path.join(safe(q.get('path')), name);
      await new Promise((ok, no) => { const w = fs.createWriteStream(f); req.pipe(w); w.on('finish', ok); w.on('error', no); req.on('error', no); });
      return send(res, 200, { ok: true });
    }

    case 'POST /api/mkdir': {
      const b = await readJson(req);
      await fsp.mkdir(path.join(safe(b.path), path.basename(b.name)), { recursive: true });
      return send(res, 200, { ok: true });
    }
    case 'POST /api/newfile': {
      const b = await readJson(req);
      await fsp.writeFile(path.join(safe(b.path), path.basename(b.name)), '', { flag: 'wx' });
      return send(res, 200, { ok: true });
    }
    case 'POST /api/rename': {
      const b = await readJson(req);
      const from = safe(b.path);
      const to = path.join(path.dirname(from), path.basename(b.name));
      if (from === ROOT) throw httpErr(400, 'Cannot rename root');
      await fsp.rename(from, to);
      return send(res, 200, { ok: true });
    }
    case 'POST /api/delete': {
      const b = await readJson(req);
      const f = safe(b.path);
      if (f === ROOT) throw httpErr(400, 'Cannot delete root');
      await fsp.rm(f, { recursive: true, force: true });
      return send(res, 200, { ok: true });
    }

    case 'GET /api/servers':
      return send(res, 200, [...servers.values()].map((s) => ({ port: s.port, path: toRel(s.dir) })));
    case 'POST /api/serve': {
      const b = await readJson(req);
      const dir = safe(b.path);
      if (!(await fsp.stat(dir)).isDirectory()) throw httpErr(400, 'Not a folder');
      const port = Number(b.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw httpErr(400, 'Port must be 1024–65535');
      await startStatic(dir, port);
      return send(res, 200, { ok: true, url: `http://localhost:${port}/` });
    }
    case 'POST /api/stop': {
      const b = await readJson(req);
      const s = servers.get(Number(b.port));
      if (s) { s.server.close(); s.server.closeAllConnections?.(); servers.delete(s.port); }
      return send(res, 200, { ok: true });
    }

    case 'GET /api/procs':
      return send(res, 200, [...procs.values()].map(pubProc));
    case 'POST /api/run': {
      const b = await readJson(req);
      return send(res, 200, pubProc(runFile(safe(b.path))));
    }
    case 'POST /api/kill': {
      const b = await readJson(req);
      procs.get(Number(b.id))?.child.kill();
      return send(res, 200, { ok: true });
    }
  }
  throw httpErr(404, 'Unknown endpoint');
}

// ---------- Explorer server ----------
const cookieOf = (req) => /(?:^|; )wbtoken=([^;]+)/.exec(req.headers.cookie || '')?.[1];

const main = http.createServer(async (req, res) => {
  try {
    // Defend against DNS rebinding: only accept loopback Host headers.
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return send(res, 403, { error: 'Bad host' });
    const url = new URL(req.url, 'http://localhost');

    if (url.searchParams.get('token') === TOKEN) { // first visit: set cookie, strip token from URL
      res.writeHead(302, { 'Set-Cookie': `wbtoken=${TOKEN}; HttpOnly; SameSite=Strict; Path=/`, Location: '/' });
      return res.end();
    }
    if (cookieOf(req) !== TOKEN) return send(res, 401, 'Open the full URL printed in Termux (includes ?token=…).', 'text/plain');

    if (url.pathname.startsWith('/api/')) return await api(req, res, url);

    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const full = path.resolve(PUBLIC, file);
    if (!full.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    const data = await fsp.readFile(full).catch(() => null);
    if (!data) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, mime(full));
  } catch (e) {
    const status = e.status || (e.code === 'ENOENT' ? 404 : e.code === 'EEXIST' ? 409 : 500);
    if (!res.headersSent) send(res, status, { error: e.message });
    else res.destroy();
  }
});

main.listen(PORT, '127.0.0.1', () => {
  console.log(`Termux File Explorer\n  root: ${ROOT}\n  open: http://localhost:${PORT}/?token=${TOKEN}\n`);
});
main.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} busy; try --port N` : e.message); process.exit(1); });
process.on('SIGINT', () => { procs.forEach((p) => p.child.kill()); process.exit(0); });
