/**
 * 构造 AI 解卦的对话消息
 */
import { LINE_KIND, LINE_NAMES, divinationRule, citeText } from './divination.js';

const SYSTEM_PROMPT = `你是一位精通《周易》的解卦先生，学养深厚、言辞温润。你依据通行本《周易》经传（卦辞、爻辞、彖传、象传）与朱熹《易学启蒙》的变占法则为人解卦。

解卦要求：
1. 依经据典：论断须扎根于所给卦爻辞与彖、象原文，引用原文时用引号标出；不得杜撰经文。
2. 遵循变占法则：用户消息中已注明本次「当占之辞」，以此为论断核心，兼顾卦象整体（上下卦之象、卦变之势）。
3. 就事论事：紧扣所问之事展开，把卦象含义落到问事的具体情境上，不泛泛而谈。
4. 给出明确倾向：吉凶悔吝要有判断，但留有分寸；给出两到三条切实可行的建议。
5. 语气克制温和，文风雅正简练，白话为主、引文为辅，总长度六百字以内。
6. 结尾以一句「卦语」收束——一句凝练如箴言的话。

请按以下小节组织输出（使用 Markdown，小节标题用三级标题）：
### 卦象
### 断辞
### 建议
### 卦语

最后请附一句简短说明：占卜是古人观照进退的一种方式，结果仅供参考，事在人为。`;

/** 六爻记录文本，如「初爻：老阳 ○（变） / 二爻：少阴 …」 */
function linesRecord(values) {
  return values
    .map((v, i) => {
      const k = LINE_KIND[v];
      return `${LINE_NAMES[i]}爻：${v} · ${k.label}${k.moving ? '（变爻）' : ''}`;
    })
    .join('\n');
}

function hexSummary(h, movingIdx = []) {
  const lines = h.lines
    .slice(0, 6)
    .map((l, i) => `  ${l.name}：${l.text}${movingIdx.includes(i) ? '　←（变爻）' : ''}`)
    .join('\n');
  const extra = h.lines[6] ? `  ${h.lines[6].name}：${h.lines[6].text}\n` : '';
  return `《${h.fullName}》（第 ${h.id} 卦，${h.upperSymbol}${h.upper}上 ${h.lowerSymbol}${h.lower}下）
卦辞：${h.judgment}
彖曰：${h.tuan}
象曰：${h.xiang}
爻辞：
${lines}
${extra}`;
}

export function buildMessages({ question, methodName, result }) {
  const { values, origin, changed, movingIdx } = result;
  const rule = divinationRule(result);
  const cites = rule.cites.map((c) => {
    const t = citeText(c);
    return `- ${t.title}${c.note ? `（${c.note}）` : ''}：${t.text}`;
  });

  let content = `【所问之事】
${question}

【起卦方式】${methodName}

【六爻记录】（自下而上）
${linesRecord(values)}

【本卦】
${hexSummary(origin, movingIdx)}`;

  if (changed) {
    content += `
【之卦】（${movingIdx.length} 爻变，${origin.name}之${changed.name}）
${hexSummary(changed)}`;
  } else {
    content += `
【之卦】六爻安静，无之卦。`;
  }

  content += `
【变占法则】${rule.rule}
【当占之辞】
${cites.join('\n')}

请依上述卦象为我解卦。`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content },
  ];
}
