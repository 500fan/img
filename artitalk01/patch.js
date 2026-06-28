const fs = require('fs');
const path = require('path');

// Patch 1: Fix Buffer.from(undefined) in github.js (safe, no objectId changes)
const githubPath = path.join(__dirname, 'node_modules/@waline/vercel/src/service/storage/github.js');
if (fs.existsSync(githubPath)) {
  let code = fs.readFileSync(githubPath, 'utf-8');
  if (code.includes("Buffer.from(resp.content, 'base64')")) {
    code = code.replace("Buffer.from(resp.content, 'base64').toString('utf-8')", "(resp.content ? Buffer.from(resp.content, 'base64').toString('utf-8') : '')");
  }
  if (code.includes('this.basePath = GITHUB_PATH;')) {
    code = code.replace('this.basePath = GITHUB_PATH;', "this.basePath = GITHUB_PATH || '';");
  }
  fs.writeFileSync(githubPath, code);
  console.log('[patch] github.js patched (Buffer.from only)');
}

// Patch 2: Add imageUploader to homepage
const controllerPath = path.join(__dirname, 'node_modules/@waline/vercel/src/controller/index.js');
if (fs.existsSync(controllerPath)) {
  let code = fs.readFileSync(controllerPath, 'utf-8');
  if (!code.includes('imageUploader')) {
    code = code.replace(
      "serverURL: location.protocol + '//' + location.host + location.pathname.replace(/\\\\/+$/, ''),",
      "serverURL: location.protocol + '//' + location.host + location.pathname.replace(/\\\\/+$/, ''),\n          imageUploader: async (file) => {\n            const fd = new FormData();\n            fd.append('file', file);\n            const r = await fetch('/api/upload', { method: 'POST', body: fd });\n            const j = await r.json();\n            if (j.errno !== 0) throw new Error(j.errmsg || 'fail');\n            return j.data[0];\n          },"
    );
    fs.writeFileSync(controllerPath, code);
    console.log('[patch] imageUploader added');
  }
}

// Patch 3: site name
const siteName = process.env.SITE_NAME;
if (siteName && fs.existsSync(controllerPath)) {
  let code = fs.readFileSync(controllerPath, 'utf-8');
  if (code.includes('Waline Example')) {
    code = code.replace(/Waline Example/g, siteName);
    fs.writeFileSync(controllerPath, code);
    console.log('[patch] Site name:', siteName);
  }
}

console.log('[patch] Done');
