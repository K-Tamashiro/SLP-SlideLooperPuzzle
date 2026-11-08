// Local preview and browser regression runner; no npm dependencies.
// node tools/serve.js [--baseline ABSOLUTE_DIRECTORY]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const baselineArg = process.argv.indexOf('--baseline');
const baseline = baselineArg >= 0 ? path.resolve(process.argv[baselineArg + 1]) : null;
const port = Number(process.env.PORT || 8012);
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.ico':'image/x-icon' };
http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    const isBaseline = pathname.startsWith('/baseline/');
    if (isBaseline && !baseline) { res.writeHead(404).end('No baseline configured'); return; }
    const base = isBaseline ? baseline : root;
    if (isBaseline) pathname = pathname.slice('/baseline'.length);
    const file = path.resolve(base, '.' + pathname, pathname.endsWith('/') ? 'index.html' : '');
    const relative = path.relative(base, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
    // In comparison mode, isolate visual tests from old PWA caches. Production sw.js is unchanged.
    if (baseline && path.basename(file) === 'sw.js') {
        res.writeHead(200, { 'Content-Type':'text/javascript', 'Cache-Control':'no-store' });
        res.end('// Comparison preview: no fetch interception or persistent caches.');
        return;
    }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404).end('Not found'); return; }
        res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
        res.end(data);
    });
}).listen(port, '127.0.0.1', () => {
    console.log(`Game: http://127.0.0.1:${port}/`);
    if (baseline) console.log(`Compare: http://127.0.0.1:${port}/tests/browser-regression.html`);
});
