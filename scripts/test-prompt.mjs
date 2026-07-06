/**
 * 解卦 prompt 实测：绕开浏览器，直接构造消息并调用 GLM，打印结果。
 * 用法: node scripts/test-prompt.mjs
 * 需在项目根目录 .env 配置 GLM_API_KEY。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveHexagrams } from '../public/js/divination.js';
import { buildMessages } from '../public/js/prompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 读 .env
const env = {};
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const KEY = env.GLM_API_KEY || process.env.GLM_API_KEY;
const MODEL = env.GLM_MODEL || 'glm-5.2';
const BASE = (env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
if (!KEY) { console.error('缺少 GLM_API_KEY'); process.exit(1); }

// 场景：谦卦九三独变（劳谦君子，有终，吉），问工作机会
const question = process.argv[2] || '我该不该接受这个新的工作机会？';
const values = [8, 8, 9, 8, 8, 8]; // 自下而上；仅九三(老阳)变
const result = deriveHexagrams(values);
console.log(`本卦：${result.origin.fullName}　之卦：${result.changed ? result.changed.fullName : '（无）'}　变爻数：${result.movingIdx.length}`);

const messages = buildMessages({ question, methodName: '三钱法', result });
console.log('\n===== system prompt 字数：', messages[0].content.length, '=====');
console.log('===== user  prompt 字数：', messages[1].content.length, '=====\n');

const resp = await fetch(`${BASE}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 4096 }),
});
if (!resp.ok) { console.error('请求失败', resp.status, await resp.text()); process.exit(1); }
const data = await resp.json();
console.log('========== 解卦输出 ==========\n');
console.log(data.choices?.[0]?.message?.content || '(空)');
console.log('\n========== 用量：', JSON.stringify(data.usage), '==========');
