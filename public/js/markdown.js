/** 轻量 Markdown 渲染（标题/粗斜体/引用/列表/段落），用于 AI 输出 */

export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join('<br/>'))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = escapeHtml(raw.trimEnd());
    const t = line.trim();

    if (!t) {
      flushPara();
      closeList();
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara();
      closeList();
      const lv = Math.min(h[1].length + 2, 5); // # → h3 起，视觉统一
      out.push(`<h3>${inline(h[2].replace(/^#+\s*/, ''))}</h3>`);
      continue;
    }
    if (/^&gt;\s?/.test(t)) {
      flushPara();
      closeList();
      out.push(`<blockquote><p>${inline(t.replace(/^&gt;\s?/, ''))}</p></blockquote>`);
      continue;
    }
    const ul = t.match(/^[-*·]\s+(.*)$/);
    const ol = t.match(/^\d+[.、）)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want = ul ? 'ul' : 'ol';
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }
    if (/^[-—－]{3,}$/.test(t)) {
      flushPara();
      closeList();
      continue; // 分隔线不渲染，留白即可
    }
    closeList();
    para.push(t);
  }
  flushPara();
  closeList();
  return out.join('\n');
}
