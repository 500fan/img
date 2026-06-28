const fs = require('fs');
const path = require('path');

// GitHub 图片上传中间件
async function uploadToGitHub(file) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || '500fan/img';
  const basePath = process.env.GITHUB_PATH || 'artitalk01';
  
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  // 生成唯一文件名
  const ext = path.extname(file.originalname || '.png');
  const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;
  const filePath = `${basePath}/uploads/${filename}`;
  
  // 读取文件内容
  const content = file.buffer.toString('base64');
  
  // 上传到 GitHub
  const response = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Waline-Upload',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: `Upload image: ${filename}`,
        content: content,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GitHub upload failed: ${error.message}`);
  }

  const result = await response.json();
  
  // 返回图片 URL
  return `https://raw.githubusercontent.com/${repo}/main/${filePath}`;
}

// Express 中间件
function uploadMiddleware(req, res, next) {
  if (req.method !== 'POST' || !req.url.includes('/upload')) {
    return next();
  }

  // 解析 multipart/form-data
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const buffer = Buffer.concat(chunks);
      const boundary = req.headers['content-type'].split('boundary=')[1];
      
      // 简单解析 multipart 数据
      const parts = buffer.toString('binary').split('--' + boundary);
      let fileData = null;
      let filename = 'image.png';
      
      for (const part of parts) {
        if (part.includes('Content-Disposition')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          const filenameMatch = part.match(/filename="([^"]+)"/);
          
          if (filenameMatch) {
            filename = filenameMatch[1];
            const headerEnd = part.indexOf('\r\n\r\n') + 4;
            fileData = Buffer.from(part.substring(headerEnd), 'binary');
          }
        }
      }

      if (!fileData) {
        return res.status(400).json({ errno: 1, errmsg: 'No file uploaded' });
      }

      // 上传到 GitHub
      const url = await uploadToGitHub({
        originalname: filename,
        buffer: fileData,
      });

      res.json({ errno: 0, data: url });
    } catch (error) {
      console.error('[upload]', error);
      res.status(500).json({ errno: 1, errmsg: error.message });
    }
  });
}

module.exports = uploadMiddleware;
