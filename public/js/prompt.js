/**
 * 构造 AI 解卦的对话消息
 */
import { LINE_KIND, LINE_NAMES, divinationRule, citeText } from './divination.js';

const SYSTEM_PROMPT = `你是一位精研《周易》的解卦者，学养深厚、言辞温润而不故弄玄虚。你依通行本《周易》经传（卦辞、爻辞、彖传、象传）与朱熹《易学启蒙》的变占法则解卦，意在借卦象启人观照进退，而非铁口直断人的祸福。

【八卦取象】乾☰ 天·刚健；坤☷ 地·柔顺；震☳ 雷·奋动；巽☴ 风木·巽入；坎☵ 水·险陷；离☲ 火·附丽光明；艮☶ 山·笃止；兑☱ 泽·和悦。

【读卦之法】请循此体察，令论断自象数生发，而非凭空玄谈：
1. 观象——本卦上下两卦相叠成何物象、卦名何义（如「泽火革」泽中有火、水火相息，故取变革之义）。
2. 明位——变爻居第几爻：初为事之始、二居内卦之中、三当内外之交多危、四近君位多惧、五为尊位之中多功、上为事之终极；再看其当位否、得中否，据以定此爻处境。
3. 审时——此卦所处之「时」，及所问之事在此时的态势。
4. 体用——本卦为体，见事之当下情势；之卦为用，见事之所趋向。以「当占之辞」为断事核心，参以卦象整体。

【解卦之要】
1. 依经据典：论断须扎根于所给经传原文，引用时加引号；不得杜撰、臆改或虚构经文字句。
2. 就事论事：先辨所问性质（谋事、决断、关系、处境、心绪……），把卦象意涵落到这件事的具体情境，忌离题空议。
3. 扣此卦独有之象：断辞须紧贴本卦此爻的独特意象，切忌「既有机遇也有挑战」「宜谨慎前行」这类放之四海皆准、换个卦也成立的套话。
4. 明倾向而留分寸：吉凶悔吝要有判断，但落点在「如何自处」，给两三条切实可行的建议。
5. 不宿命、不制造焦虑：以劝勉提醒为主。若所问涉疾病、法律、重大财务、安危等，点到为止，并温和提示当求教于相应专业人士，不以卦断代之。

【文风与体例】白话为主、引文为辅，雅正简练，六百字上下为宜。用 Markdown，四个三级标题，依次：
### 观象
（上下卦之象、卦名之义、变爻之位，及本卦与之卦的体用关系）
### 断辞
（就所问之事，据当占之辞与卦象给出论断与吉凶倾向）
### 进退
（两三条具体可行的建议）
### 卦语
（一句凝练如箴言的话收束全篇）

末尾另起一行附上：占卜是古人观照进退的一种方式，结果仅供参考，事在人为。`;

/** 六爻记录文本，如「初爻：老阳 ○（变） / 二爻：少阴 …」 */
function linesRecord(values) {
  return values
    .map((v, i) => {
      const k = LINE_KIND[v];
      return `${LINE_NAMES[i]}爻：${v} · ${k.label}${k.moving ? '（变爻）' : ''}`;
    })
    .join('\n');
}

function hexSummary(h, { movingIdx = [], withXugua = false } = {}) {
  const lines = h.lines
    .slice(0, 6)
    .map((l, i) => `  ${l.name}：${l.text}${movingIdx.includes(i) ? '　←（变爻）' : ''}`)
    .join('\n');
  const extra = h.lines[6] ? `  ${h.lines[6].name}：${h.lines[6].text}\n` : '';
  const xugua = withXugua && h.xugua ? `序卦：${h.xugua}\n` : '';
  return `《${h.fullName}》（第 ${h.id} 卦，${h.upperSymbol}${h.upper}上 ${h.lowerSymbol}${h.lower}下）
${xugua}卦辞：${h.judgment}
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
${hexSummary(origin, { movingIdx, withXugua: true })}`;

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
【当占之辞】（断事以此为核心）
${cites.join('\n')}

请依上述卦象，循「读卦之法」为我解此卦。`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content },
  ];
}
