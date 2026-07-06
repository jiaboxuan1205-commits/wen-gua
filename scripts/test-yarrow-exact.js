/**
 * 大衍筮法：精确枚举「均匀分二」模型的真实概率，
 * 与蒙特卡洛、教科书 1/3/5/7(÷16) 三方对照，定位偏差来源。
 */

// 一次变：从 S 根出发，挂一(取自右堆)、左右各揲四、归奇
function removedFor(S, L) {
  const R = S - L;
  const hung = 1;
  const rightAfter = R - hung;
  const leftRem = L % 4 === 0 ? 4 : L % 4;
  const rightRem = rightAfter % 4 === 0 ? 4 : rightAfter % 4;
  return hung + leftRem + rightRem;
}

// 精确枚举：dist 为 Map<剩余根数, 概率>
function stepExact(dist) {
  const next = new Map();
  for (const [S, p] of dist) {
    const splits = S - 1; // L ∈ [1, S-1] 均匀
    for (let L = 1; L <= S - 1; L++) {
      const rem = S - removedFor(S, L);
      next.set(rem, (next.get(rem) || 0) + p / splits);
    }
  }
  return next;
}

let dist = new Map([[49, 1]]);
dist = stepExact(dist); // 一变
const afterFirst = new Map(dist);
dist = stepExact(dist); // 二变
dist = stepExact(dist); // 三变

// 汇总到 6/7/8/9
const exact = { 6: 0, 7: 0, 8: 0, 9: 0 };
for (const [S, p] of dist) exact[S / 4] += p;

console.log('== 一变后 剩余根数分布（均匀分二模型）==');
for (const [S, p] of [...afterFirst].sort((a, b) => a[0] - b[0])) {
  console.log(`  剩 ${S}（去 ${49 - S}）: ${(p * 100).toFixed(3)}%`);
}

const textbook = { 6: 1 / 16, 7: 5 / 16, 8: 7 / 16, 9: 3 / 16 };
const label = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' };
console.log('\n== 三变后 终值概率 ==');
console.log('  爻     精确(均匀分二)   教科书(1/3/5/7)');
for (const k of [6, 7, 8, 9]) {
  console.log(
    `  ${label[k]}   ${(exact[k] * 100).toFixed(3)}%          ${(textbook[k] * 100).toFixed(3)}%`
  );
}
console.log('\n精确概率(分数近似):');
for (const k of [6, 7, 8, 9]) console.log(`  ${label[k]}: ${exact[k].toFixed(5)}`);
