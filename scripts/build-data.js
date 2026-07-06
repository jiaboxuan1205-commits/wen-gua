/**
 * 数据构建脚本：将 data/raw 下的原始 JSON/Markdown 合并为前端 ES module 数据文件。
 * 用法: node scripts/build-data.js
 */
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const OUT = path.join(__dirname, '..', 'public', 'js', 'data');

const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
const readText = (f) => fs.readFileSync(path.join(RAW, f), 'utf8');

// 已知讹误校正（逐字比对维基文库/通行本后集中订正，原始数据保持原样）
function fix(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/见龙再田/g, '见龙在田') // 乾九二爻辞/象传：再 → 在
    .replace(/懮/g, '忧') // 系辞上 4 处：懮 系 憂(忧) 之讹
    .replace(/效法之为坤/g, '效法之谓坤') // 系辞上：为 → 谓（与「成象之谓乾」对文）
    .replace(/尚其占。以君子将有为也/g, '尚其占。是以君子将有为也') // 系辞上：脱「是」
    .replace(/先号啕而后笑/g, '先号咷而后笑') // 系辞上：啕 → 咷（同人九五作咷）
    .replace(/履校灭趾无咎/g, '屦校灭趾无咎') // 系辞下：履 → 屦（噬嗑初九作屦）
    .replace(/自天佑之/g, '自天祐之') // 系辞：佑 → 祐（大有上九爻辞作祐）
    .replace(/佑者，助也/g, '祐者，助也') // 系辞：同上
    .replace(/为甲胃/g, '为甲胄') // 说卦离卦：胃 → 胄（甲胄，与「为戈兵」相类）
    .replace(/君子行此四者/g, '君子行此四德者'); // 文言乾：脱「德」（君子行此四德）
}

const iching = readJSON('iching_iching.json');
const tuan = readJSON('ichuan_tuan.json');
const xiang = readJSON('ichuan_xiang.json');
const wen = readJSON('ichuan_wen.json');
const xu = readJSON('ichuan_xu.json');

// 数据源缺漏补正（依据通行本）
tuan['iching__32'] =
  '恒，久也。刚上而柔下，雷风相与，巽而动，刚柔皆应，恒。恒“亨，无咎，利贞”，久于其道也。天地之道，恒久而不已也。“利有攸往”，终则有始也。日月得天而能久照，四时变化而能久成，圣人久于其道而天下化成。观其所恒，而天地万物之情可见矣！';

// 八卦取象
const TRIGRAM_IMAGE = { 乾: '天', 坤: '地', 震: '雷', 巽: '风', 坎: '水', 离: '火', 艮: '山', 兑: '泽' };
const TRIGRAM_SYMBOL = { 乾: '☰', 坤: '☷', 震: '☳', 巽: '☴', 坎: '☵', 离: '☲', 艮: '☶', 兑: '☱' };

const hexagrams = iching.map((g) => {
  const [lower, upper] = g.combination;
  const fullName =
    lower === upper
      ? `${g.name}为${TRIGRAM_IMAGE[upper]}`
      : `${TRIGRAM_IMAGE[upper]}${TRIGRAM_IMAGE[lower]}${g.name}`;

  const lines = g.lines.map((l, i) => ({
    name: l.name,
    type: l.type,
    text: fix(l.scripture),
    xiang: fix(xiang[`iching__${g.id}_${i + 1}`] || ''),
  }));

  return {
    id: g.id,
    name: g.name,
    fullName,
    symbol: g.symbol,
    array: g.array, // 自下而上：初爻 → 上爻，1 阳 0 阴
    lower,
    upper,
    lowerSymbol: TRIGRAM_SYMBOL[lower],
    upperSymbol: TRIGRAM_SYMBOL[upper],
    judgment: fix(g.scripture),
    tuan: fix(tuan[`iching__${g.id}`] || ''),
    xiang: fix(xiang[`iching__${g.id}`] || ''),
    lines,
    xugua: fix(xu[`iching__${g.id}`] || ''),
    wenyan: fix(wen[`iching__${g.id}`] || ''),
  };
});

// —— 校验 ——
if (hexagrams.length !== 64) throw new Error('卦数不是 64');
for (const h of hexagrams) {
  const expect = h.id === 1 || h.id === 2 ? 7 : 6;
  if (h.lines.length !== expect) throw new Error(`第 ${h.id} 卦 ${h.name} 爻数异常: ${h.lines.length}`);
  if (!h.tuan || !h.xiang || !h.judgment) throw new Error(`第 ${h.id} 卦 ${h.name} 缺少彖/象/卦辞`);
  for (const l of h.lines) {
    if (!l.text || !l.xiang) throw new Error(`第 ${h.id} 卦 ${h.name} ${l.name} 缺文本`);
  }
}
// 卦画 → 卦 id 映射（key 为自下而上的二进制字符串）
const byArray = {};
for (const h of hexagrams) byArray[h.array.join('')] = h.id;
if (Object.keys(byArray).length !== 64) throw new Error('卦画映射不足 64');

// —— 十翼阅读文本 ——
function mdToSections(md) {
  // 解析 "# 标题 / ## 子标题 / 段落" 结构
  const lines = md.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('## ')) {
      current = { title: t.slice(3).trim(), paragraphs: [] };
      sections.push(current);
    } else if (t.startsWith('# ')) {
      continue; // 顶级标题由调用方提供
    } else {
      if (!current) {
        current = { title: '', paragraphs: [] };
        sections.push(current);
      }
      current.paragraphs.push(fix(t));
    }
  }
  return sections;
}

const texts = [
  { id: 'xici', title: '系辞传', sections: mdToSections(readText('md_系辞.md')).map((s) => ({ ...s, title: s.title ? `系辞${s.title}` : '' })) },
  { id: 'shuogua', title: '说卦传', sections: mdToSections(readText('md_说卦.md')) },
  { id: 'xugua', title: '序卦传', sections: mdToSections(readText('md_序卦.md')) },
  { id: 'zagua', title: '杂卦传', sections: mdToSections(readText('md_杂卦.md')) },
  { id: 'wenyan', title: '文言传', sections: mdToSections(readText('md_文言.md')).map((s) => ({ ...s, title: s.title ? `文言·${s.title}` : '' })) },
];

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'hexagrams.js'),
  `// 《周易》六十四卦经传数据（通行本）。由 scripts/build-data.js 生成，勿手改。\n` +
    `export const HEXAGRAMS = ${JSON.stringify(hexagrams, null, 1)};\n\n` +
    `// 卦画（自下而上二进制串）→ 卦序\nexport const HEX_BY_ARRAY = ${JSON.stringify(byArray, null, 1)};\n`,
  'utf8'
);
fs.writeFileSync(
  path.join(OUT, 'texts.js'),
  `// 《易传》阅读文本。由 scripts/build-data.js 生成，勿手改。\nexport const TEXTS = ${JSON.stringify(texts, null, 1)};\n`,
  'utf8'
);

console.log(`OK: ${hexagrams.length} 卦, ${texts.length} 篇易传`);
console.log('hexagrams.js:', fs.statSync(path.join(OUT, 'hexagrams.js')).size, 'bytes');
console.log('texts.js:', fs.statSync(path.join(OUT, 'texts.js')).size, 'bytes');
