/**
 * 随机性检验：原样复刻 public/js/divination.js 里的随机逻辑，
 * 跑大样本，比对经验频率与理论概率，并做卡方检验。
 * 用法: node scripts/test-randomness.js [次数]
 */

// —— 与 divination.js 完全一致的实现 ——
function rand() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf); // Node 20+ 内置 Web Crypto；浏览器同源
  return buf[0] / 2 ** 32;
}
function randInt(n) {
  return 1 + Math.floor(rand() * n);
}
function castCoinLine() {
  const coins = [randInt(2) + 1, randInt(2) + 1, randInt(2) + 1];
  return coins[0] + coins[1] + coins[2];
}
function castYarrowLine() {
  let stalks = 49;
  for (let i = 0; i < 3; i++) {
    const left = randInt(stalks - 1);
    const right = stalks - left;
    const hung = 1;
    const rightAfter = right - hung;
    const leftRem = left % 4 === 0 ? 4 : left % 4;
    const rightRem = rightAfter % 4 === 0 ? 4 : rightAfter % 4;
    stalks -= hung + leftRem + rightRem;
  }
  return stalks / 4;
}

const N = Number(process.argv[2]) || 2_000_000;

function tally(fn) {
  const c = { 6: 0, 7: 0, 8: 0, 9: 0 };
  for (let i = 0; i < N; i++) c[fn()]++;
  return c;
}
function chiSquare(counts, probs) {
  let x2 = 0;
  for (const k of [6, 7, 8, 9]) {
    const exp = N * probs[k];
    x2 += (counts[k] - exp) ** 2 / exp;
  }
  return x2;
}
function report(title, counts, probs) {
  const label = { 6: '老阴 ×', 7: '少阳  ', 8: '少阴  ', 9: '老阳 ○' };
  console.log(`\n【${title}】样本 ${N.toLocaleString()}`);
  console.log('  爻       实测频率      理论概率      偏差');
  for (const k of [6, 7, 8, 9]) {
    const emp = counts[k] / N;
    const th = probs[k];
    const dev = ((emp - th) / th) * 100;
    console.log(
      `  ${label[k]}  ${(emp * 100).toFixed(3)}%      ${(th * 100).toFixed(3)}%      ${dev >= 0 ? '+' : ''}${dev.toFixed(2)}%`
    );
  }
  const x2 = chiSquare(counts, probs);
  // 自由度 3，α=0.05 临界值 7.815
  console.log(`  卡方 χ² = ${x2.toFixed(3)}  (自由度3，临界7.815，${x2 < 7.815 ? '通过：不能拒绝均匀假设' : '偏离'})`);
}

// 先验证单枚硬币是否公平
let heads = 0;
for (let i = 0; i < N; i++) if (randInt(2) === 1) heads++;
console.log(`单枚硬币 randInt(2)=1 频率: ${((heads / N) * 100).toFixed(3)}%  (理论 50%)`);

report('三钱法', tally(castCoinLine), { 6: 1 / 8, 7: 3 / 8, 8: 3 / 8, 9: 1 / 8 });
report('大衍筮法', tally(castYarrowLine), { 6: 1 / 16, 7: 5 / 16, 8: 7 / 16, 9: 3 / 16 });

console.log('\n熵源：crypto.getRandomValues —— 操作系统 CSPRNG（Windows: BCryptGenRandom）。');
console.log('非 Math.random，无固定种子；未使用时间/声音/网速等自定义熵。');
