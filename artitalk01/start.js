require('./patch.js');
const express = require('express');
const path = require('path');
const walineFactory = require('@waline/vercel');
const walineHandler = walineFactory();
const app = express();

app.post(['/upload', '/api/upload'], (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || '500fan/img';
  const basePath = process.env.GITHUB_PATH || 'artitalk01';
  if (!token) return res.json({ errno: 1, errmsg: 'No token' });
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const buffer = Buffer.concat(chunks);
      const ct = req.headers['content-type'] || '';
      const bm = ct.match(/boundary=(.+)/);
      if (!bm) return res.json({ errno: 1, errmsg: 'No boundary' });
      const parts = buffer.toString('binary').split('--' + bm[1]);
      let fileData = null, filename = 'image.png';
      for (const part of parts) {
        if (part.includes('Content-Disposition')) {
          const fm = part.match(/filename="([^"]+)"/);
          if (fm) { filename = fm[1]; const h = part.indexOf('\r\n\r\n') + 4; fileData = Buffer.from(part.substring(h), 'binary'); }
        }
      }
      if (!fileData || !fileData.length) return res.json({ errno: 1, errmsg: 'No file' });
      const ext = path.extname(filename) || '.png';
      const bn = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const name = Date.now() + '-' + bn + ext;
      const fp = basePath + '/' + name;
      const resp = await fetch('https://api.github.com/repos/' + repo + '/contents/' + encodeURIComponent(fp), {
        method: 'PUT',
        headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Upload: ' + name, content: fileData.toString('base64') }),
      });
      if (resp.ok) {
        res.json({ errno: 0, data: ['https://raw.githubusercontent.com/' + repo + '/main/' + encodeURI(fp)] });
      } else {
        const e = await resp.json();
        res.json({ errno: 1, errmsg: 'GitHub: ' + (e.message || 'unknown') });
      }
    } catch (e) { res.json({ errno: 1, errmsg: e.message }); }
  });
});

app.get('/migrate', async (req, res) => {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || '500fan/img';
  const basePath = process.env.GITHUB_PATH || 'artitalk01';
  if (req.query.secret !== (process.env.MIGRATE_SECRET || 'waline2026')) return res.status(403).json({ error: 'Invalid secret' });
  try {
    const csvUrl = 'https://raw.githubusercontent.com/' + repo + '/main/' + basePath + '/Comment.csv';
    let updated = await (await fetch(csvUrl)).text();
    let count = 0;
    if (req.query.action === 'fix') {
      updated = updated.replace(/(https:\/\/raw\.githubusercontent\.com\/[^\s"<>]+\.(?:jpg|jpeg|png|gif|webp|svg))/gi, m => { count++; return '![](' + m + ')'; });
    } else {
      const seen = {};
      for (const m of [...updated.matchAll(/!\[([^\]]*)\]\(data:image\/([^;]+);base64,([A-Za-z0-9+/=\n\s]+)\)/g)]) {
        const [full, alt, ext, b64raw] = m;
        const b64 = b64raw.replace(/[\n\s]/g, '');
        const hash = require('crypto').createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex').slice(0, 8);
        if (seen[hash]) { updated = updated.replace(full, '![' + (alt||'img') + '](' + seen[hash] + ')'); count++; continue; }
        const fn = 'migrated_' + hash + '.' + ext;
        const fp2 = basePath + '/' + fn;
        const r = await fetch('https://api.github.com/repos/' + repo + '/contents/' + encodeURIComponent(fp2), {
          method: 'PUT', headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Migrate: ' + fn, content: b64 }),
        });
        if (r.ok) { const u = 'https://raw.githubusercontent.com/' + repo + '/main/' + encodeURI(fp2); updated = updated.replace(full, '![' + (alt||'img') + '](' + u + ')'); seen[hash] = u; count++; }
        else { updated = updated.replace(full, '[图片上传失败]'); count++; }
      }
    }
    const shaResp = await fetch('https://api.github.com/repos/' + repo + '/contents/' + basePath + '/Comment.csv', { headers: { 'Authorization': 'token ' + token } });
    const shaData = await shaResp.json();
    const cResp = await fetch('https://api.github.com/repos/' + repo + '/contents/' + basePath + '/Comment.csv', {
      method: 'PUT', headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Migrate (' + count + ')', content: Buffer.from(updated).toString('base64'), sha: shaData.sha }),
    });
    res.json(cResp.ok ? { success: true, count } : { error: 'Commit failed' });
  } catch (e) { res.json({ error: e.message }); }
});

app.use((req, res) => {
  walineHandler(req, res).catch(err => { console.error('[waline]', err); res.status(500).send('Error'); });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log('[waline] Server on port', PORT); });
