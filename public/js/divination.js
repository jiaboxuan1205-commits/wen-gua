/**
 * 起卦核心逻辑
 *  - 三钱法（金钱卦）：三枚铜钱，背面记 3、字面记 2，三枚之和
 *      6 老阴（变）  7 少阳  8 少阴  9 老阳（变）
 *      概率 1/8 · 3/8 · 3/8 · 1/8
 *  - 大衍筮法：五十根蓍草虚一不用，四营十八变；真实模拟「分二、挂一、揲四、归奇」
 *      概率（理论值）老阳 3/16 · 少阴 7/16 · 少阳 5/16 · 老阴 1/16
 *  - 变卦与朱熹《易学启蒙》变占规则
 */
import { HEXAGRAMS, HEX_BY_ARRAY } from './data/hexagrams.js';

/** 加密安全随机数 [0,1) —— 占筮以诚，不用伪随机 */
export function rand() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** 随机整数 [1, n] */
function randInt(n) {
  return 1 + Math.floor(rand() * n);
}

export const LINE_NAMES = ['初', '二', '三', '四', '五', '上'];

export const LINE_KIND = {
  6: { label: '老阴', mark: '×', yang: false, moving: true },
  7: { label: '少阳', mark: '', yang: true, moving: false },
  8: { label: '少阴', mark: '', yang: false, moving: false },
  9: { label: '老阳', mark: '○', yang: true, moving: true },
};

/** 掷一次三枚铜钱 → 一爻。coins: 每枚 2(字)或 3(背) */
export function castCoinLine() {
  const coins = [randInt(2) + 1, randInt(2) + 1, randInt(2) + 1];
  const value = coins[0] + coins[1] + coins[2];
  return { value, coins };
}

/**
 * 大衍筮法成一爻：三变。
 * 每变：分二（左右两簇）→ 挂一 → 左右各揲四 → 归奇（挂一与两簇余数取出）
 * 第一变去 5 或 9；二、三变去 4 或 8。三变后余数除以 4 即 6/7/8/9。
 */
export function castYarrowLine() {
  let stalks = 49;
  const changes = [];
  for (let i = 0; i < 3; i++) {
    const left = randInt(stalks - 1); // 分二，两边各至少一根
    const right = stalks - left;
    const hung = 1; // 挂一（取自右簇）
    const rightAfter = right - hung;
    const leftRem = left % 4 === 0 ? 4 : left % 4;
    const rightRem = rightAfter % 4 === 0 ? 4 : rightAfter % 4;
    const removed = hung + leftRem + rightRem;
    stalks -= removed;
    changes.push({ left, right, removed, remain: stalks });
  }
  return { value: stalks / 4, changes };
}

/** 由六爻数值（自下而上，6/7/8/9）推演本卦、变爻、之卦 */
export function deriveHexagrams(values) {
  const originArray = values.map((v) => (LINE_KIND[v].yang ? 1 : 0));
  const movingIdx = values.map((v, i) => (LINE_KIND[v].moving ? i : -1)).filter((i) => i >= 0);
  const origin = HEXAGRAMS[HEX_BY_ARRAY[originArray.join('')] - 1];

  let changed = null;
  if (movingIdx.length > 0) {
    const changedArray = originArray.map((b, i) => (movingIdx.includes(i) ? 1 - b : b));
    changed = HEXAGRAMS[HEX_BY_ARRAY[changedArray.join('')] - 1];
  }
  return { values, origin, changed, movingIdx };
}

/** 爻题，如 初九 / 六二 / 上六 */
export function lineTitle(index, yang) {
  const n = yang ? '九' : '六';
  if (index === 0) return `初${n}`;
  if (index === 5) return `上${n}`;
  return `${n}${LINE_NAMES[index]}`;
}

/**
 * 朱熹《易学启蒙》变占法则。
 * 返回 { rule, cites }：rule 为规则说明；cites 为「当占之辞」列表
 *   cite: { hex, kind: 'judgment'|'line'|'extra', lineIndex?, note? }
 */
export function divinationRule({ origin, changed, movingIdx }) {
  const n = movingIdx.length;
  const sorted = [...movingIdx].sort((a, b) => a - b);

  if (n === 0) {
    return {
      rule: '六爻不变，以本卦卦辞占。',
      cites: [{ hex: origin, kind: 'judgment' }],
    };
  }
  if (n === 1) {
    return {
      rule: '一爻变，以本卦变爻之辞占。',
      cites: [{ hex: origin, kind: 'line', lineIndex: sorted[0] }],
    };
  }
  if (n === 2) {
    return {
      rule: '二爻变，以本卦两变爻之辞占，以上爻为主。',
      cites: [
        { hex: origin, kind: 'line', lineIndex: sorted[1], note: '为主' },
        { hex: origin, kind: 'line', lineIndex: sorted[0] },
      ],
    };
  }
  if (n === 3) {
    return {
      rule: '三爻变，占本卦与之卦卦辞，以本卦为贞（体）、之卦为悔（用）。',
      cites: [
        { hex: origin, kind: 'judgment', note: '贞' },
        { hex: changed, kind: 'judgment', note: '悔' },
      ],
    };
  }
  if (n === 4) {
    const still = [0, 1, 2, 3, 4, 5].filter((i) => !sorted.includes(i));
    return {
      rule: '四爻变，以之卦两不变爻之辞占，以下爻为主。',
      cites: [
        { hex: changed, kind: 'line', lineIndex: still[0], note: '为主' },
        { hex: changed, kind: 'line', lineIndex: still[1] },
      ],
    };
  }
  if (n === 5) {
    const still = [0, 1, 2, 3, 4, 5].find((i) => !sorted.includes(i));
    return {
      rule: '五爻变，以之卦不变爻之辞占。',
      cites: [{ hex: changed, kind: 'line', lineIndex: still }],
    };
  }
  // 六爻皆变
  if (origin.id === 1) {
    return {
      rule: '乾卦六爻皆变，以「用九」占。',
      cites: [{ hex: origin, kind: 'extra' }],
    };
  }
  if (origin.id === 2) {
    return {
      rule: '坤卦六爻皆变，以「用六」占。',
      cites: [{ hex: origin, kind: 'extra' }],
    };
  }
  return {
    rule: '六爻皆变，以之卦卦辞占。',
    cites: [{ hex: changed, kind: 'judgment' }],
  };
}

/** 取「当占之辞」的原文，供展示与 AI prompt */
export function citeText(cite) {
  const h = cite.hex;
  if (cite.kind === 'judgment') {
    return { title: `${h.name}卦卦辞`, text: `${h.name}：${h.judgment}` };
  }
  if (cite.kind === 'extra') {
    const extra = h.lines[6];
    return { title: `${h.name}卦${extra.name}`, text: `${extra.name}：${extra.text}` };
  }
  const l = h.lines[cite.lineIndex];
  return { title: `${h.name}卦${l.name}`, text: `${l.name}：${l.text}` };
}
