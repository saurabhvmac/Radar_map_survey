/**
 * Optional: try the app on your own computer before deploying, with no Netlify account.
 *   ADMIN_PASSWORD=admin npm run local   →  http://localhost:8888/entry
 * Data is kept in memory and disappears when you stop it. On Netlify, Netlify Blobs is used instead.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handle } from '../netlify/lib/app.mjs';

process.env.ADMIN_PASSWORD ||= 'admin';
const mem = new Map();
const store = {
  async get(k) { return mem.has(k) ? JSON.parse(mem.get(k)) : null; },
  async setJSON(k, v) { mem.set(k, JSON.stringify(v)); },
  async delete(k) { mem.delete(k); },
  async list({ prefix = '' } = {}) { return { blobs: [...mem.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
};
const root = path.resolve('public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const pages = { '/': null, '/entry': 'index.html', '/exit': 'index.html', '/admin': 'admin.html' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), store);
    res.writeHead(r.status, Object.fromEntries(r.headers)); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  if (url.pathname === '/') { res.writeHead(301, { Location: '/entry' }); return res.end(); }
  const file = path.join(root, pages[url.pathname] || url.pathname);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(8888, () => console.log('Local preview: http://localhost:8888/entry  /exit  /admin (password: ' + process.env.ADMIN_PASSWORD + ')'));
