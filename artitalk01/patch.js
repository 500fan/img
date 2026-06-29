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

// Patch 4: Replace comment controller to fix "cmt is not defined" error
const commentCtrlPath = path.join(__dirname, 'node_modules/@waline/vercel/src/controller/comment.js');
if (fs.existsSync(commentCtrlPath)) {
  const simplifiedComment = `const BaseRest = require('./rest.js');

module.exports = class extends BaseRest {
  constructor(ctx) {
    super(ctx);
    this.modelInstance = this.getModel('Comment');
  }

  async getAction() {
    const { path: url, page, pageSize, sortBy } = this.get();
    const where = { url };
    const count = await this.modelInstance.count(where);
    const totalPages = Math.ceil(count / pageSize);
    const spamCount = await this.modelInstance.count({ ...where, status: 'spam' });
    const waitingCount = await this.modelInstance.count({ ...where, status: 'waiting' });
    const comments = await this.modelInstance.select(where, {
      desc: sortBy === 'time' ? 'insertedAt' : 'like',
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return this.json({
      errno: 0, errmsg: '',
      data: {
        page, totalPages, pageSize,
        count: count - spamCount - waitingCount,
        data: comments.map(c => {
          c.time = new Date(c.insertedAt).getTime();
          delete c.insertedAt; delete c.createdAt; delete c.updatedAt;
          c.like = Number(c.like) || 0;
          c.children = [];
          return c;
        }),
      },
    });
  }

  async postAction() {
    const { comment, link, mail, nick, pid, rid, ua, url } = this.post();
    const data = {
      link, mail, nick, pid, rid, ua, url, comment,
      ip: this.ctx.ip,
      insertedAt: new Date(),
      user_id: '',
      status: 'approved',
    };
    const { userInfo } = this.ctx.state;
    if (userInfo && userInfo.objectId) data.user_id = userInfo.objectId;
    try {
      const resp = await this.modelInstance.add(data);
      return this.json({ errno: 0, errmsg: '', data: resp });
    } catch (err) {
      console.error('[SIMPLE_POST] Error:', err.message);
      return this.json({ errno: 1, errmsg: err.message });
    }
  }

  async deleteAction() {
    const { userInfo } = this.ctx.state;
    if (!userInfo || userInfo.type !== 'administrator') return this.fail(403);
    await this.modelInstance.delete({ objectId: this.id });
    return this.success();
  }

  async putAction() {
    const { userInfo } = this.ctx.state;
    if (!userInfo || userInfo.type !== 'administrator') return this.fail(403);
    const data = this.post();
    await this.modelInstance.update(data, { objectId: this.id });
    return this.success();
  }
};
`;
  fs.writeFileSync(commentCtrlPath, simplifiedComment);
  console.log('[patch] comment.js replaced with simplified version (fix cmt error)');
}

console.log('[patch] Done');
