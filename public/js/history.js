/**
 * 问卦录：卦象与 AI 解读的本地存档（localStorage）。
 * 只存重建所需的最小数据：问题、起卦方式、六爻数值、AI 解读文本。
 * 本卦/变爻/之卦均可由 values 经 deriveHexagrams 确定性重建，无需另存。
 */

const LS_KEY = 'wengua.history';
const MAX = 50; // 上限：只保留最近 50 卦，防止无限增长

export function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(LS_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** 写入并封顶；若超出浏览器配额则逐步丢弃最旧记录后重试 */
function persist(list) {
  let arr = list.slice(0, MAX);
  for (;;) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
      return arr;
    } catch {
      if (arr.length <= 1) return arr; // 实在写不下就放弃
      arr = arr.slice(0, Math.max(1, Math.floor(arr.length / 2)));
    }
  }
}

/** 新增一条（置于最前），返回记录 id */
export function addRecord(rec) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const list = loadHistory();
  list.unshift({ id, ts: Date.now(), ...rec });
  persist(list);
  return id;
}

/** 按 id 局部更新（如卦成后补上 AI 解读） */
export function updateRecord(id, patch) {
  const list = loadHistory();
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], ...patch };
  persist(list);
}

export function deleteRecord(id) {
  const list = loadHistory().filter((r) => r.id !== id);
  persist(list);
  return list;
}

export function clearHistory() {
  localStorage.removeItem(LS_KEY);
}

export const HISTORY_MAX = MAX;
