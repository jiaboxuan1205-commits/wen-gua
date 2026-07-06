/**
 * 问卦 · 零依赖 Node 服务
 *  - 静态托管 public/
 *  - POST /api/interpret  以 SSE 流式转发智谱 GLM 解卦请求
 *  - GET  /api/config     告知前端服务端是否已配置 API Key 及默认模型
 *
 * 启动: node server.js   (默认 http://localhost:3000)
 * 配置: 项目根目录 .env 文件或环境变量
 *   GLM_API_KEY=xxx
 *   GLM_MODEL=glm-5.2
 *   GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
 *   PORT=3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---- 读取 .env（不引第三方库）----
const ENV_FILE = path.join(__dirname, '.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT) || 3000;
const GLM_BASE_URL = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
const DEFAULT_MODEL = process.env.GLM_MODEL || 'glm-5.2';
const SERVER_KEY = process.env.GLM_API_KEY || '';

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, urlPath);
  // 防目录穿越
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJSON(res, 403, { error: 'forbidden' });
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

async function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** SSE 流式转发到智谱 GLM */
async function handleInterpret(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJSON(res, 400, { error: '请求体不是有效 JSON' });
  }

  const apiKey = (body.apiKey || '').trim() || SERVER_KEY;
  if (!apiKey) {
    return sendJSON(res, 401, { error: '未配置 API Key：请在页面「设置」中填入，或在服务端 .env 写入 GLM_API_KEY。' });
  }
  const model = (body.model || '').trim() || DEFAULT_MODEL;
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    return sendJSON(res, 400, { error: '缺少 messages' });
  }

  let upstream;
  try {
    upstream = await fetch(`${GLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });
  } catch (e) {
    return sendJSON(res, 502, { error: `无法连接智谱 API：${e.message}` });
  }

  if (!upstream.ok) {
    let detail = '';
    try {
      detail = await upstream.text();
    } catch {}
    let msg = `上游返回 ${upstream.status}`;
    try {
      const j = JSON.parse(detail);
      msg = j.error?.message || j.msg || msg;
    } catch {}
    return sendJSON(res, upstream.status, { error: msg, detail });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    for await (const chunk of upstream.body) {
      res.write(chunk);
      if (res.flush) res.flush();
    }
  } catch {
    // 客户端中断或上游断流，直接收尾
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJSON(res, 200, { hasServerKey: Boolean(SERVER_KEY), defaultModel: DEFAULT_MODEL });
  }
  if (pathname === '/api/interpret' && req.method === 'POST') {
    try {
      return await handleInterpret(req, res);
    } catch (e) {
      if (!res.headersSent) return sendJSON(res, 500, { error: e.message });
      return res.end();
    }
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  sendJSON(res, 405, { error: 'method not allowed' });
});

server.listen(PORT, () => {
  console.log(`问卦 · http://localhost:${PORT}`);
  console.log(`API Key: ${SERVER_KEY ? '已从环境读取' : '未配置（可在页面「设置」中填写）'} · 默认模型: ${DEFAULT_MODEL}`);
});
