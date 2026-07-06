/**
 * 问卦 · 主应用
 */
import { HEXAGRAMS } from './data/hexagrams.js';
import { TEXTS } from './data/texts.js';
import {
  castCoinLine,
  castYarrowLine,
  deriveHexagrams,
  divinationRule,
  citeText,
  LINE_KIND,
  LINE_NAMES,
} from './divination.js';
import { buildMessages } from './prompt.js';
import { getSettings, saveSettings, fetchServerConfig, streamInterpret } from './api.js';
import { renderMarkdown, escapeHtml } from './markdown.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ==========================================================================
   主题
   ========================================================================== */

function initTheme() {
  const saved = getSettings().theme;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    saveSettings({ theme: next });
  });
}

/* ==========================================================================
   卦画组件
   values: 6/7/8/9 数组（可短于 6，余下画虚线）；或 array: 0/1 数组
   ========================================================================== */

function hexagramEl({ values = null, array = null, small = false, marks = true } = {}) {
  const wrap = el(`<div class="hexagram${small ? ' small' : ''}"></div>`);
  for (let i = 0; i < 6; i++) {
    let line;
    if (values) {
      if (i >= values.length) {
        line = el('<div class="hex-line pending"></div>');
      } else {
        const k = LINE_KIND[values[i]];
        line = el(`<div class="hex-line ${k.yang ? 'yang' : 'yin'}"></div>`);
        line.style.animationDelay = '0.05s';
        if (marks && k.moving) line.appendChild(el(`<span class="mark">${k.mark}</span>`));
      }
    } else {
      line = el(`<div class="hex-line ${array[i] ? 'yang' : 'yin'}"></div>`);
    }
    wrap.appendChild(line);
  }
  return wrap;
}

/* ==========================================================================
   路由
   ========================================================================== */

const VIEWS = ['divine', 'canon', 'zhuan', 'settings'];
const ROUTES = { '': 'divine', canon: 'canon', zhuan: 'zhuan', settings: 'settings' };
const rendered = new Set();

function router() {
  const hash = location.hash.replace(/^#\/?/, '');
  const name = ROUTES[hash.split('/')[0]] || 'divine';
  for (const v of VIEWS) {
    const sec = $(`#view-${v}`);
    const on = v === name;
    if (on && sec.hidden) {
      sec.hidden = false;
      sec.style.animation = 'none';
      void sec.offsetWidth; // 重触发入场动画
      sec.style.animation = '';
    } else if (!on) sec.hidden = true;
  }
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.view === name);
  });
  if (!rendered.has(name)) {
    rendered.add(name);
    if (name === 'divine') renderAsk();
    if (name === 'canon') renderCanon();
    if (name === 'zhuan') renderZhuan();
  }
  if (name === 'settings') renderSettings(); // 每次进入刷新状态
  window.scrollTo({ top: 0 });
}

/* ==========================================================================
   问卦 · ① 起问
   ========================================================================== */

const METHODS = {
  coins: {
    name: '三钱法',
    note: '三枚铜钱掷六次，自下而上成卦 —— 火珠林法，民间最通行。',
  },
  yarrow: {
    name: '大衍筮法',
    note: '五十根蓍草虚一不用，分二、挂一、揲四、归奇，十八变而成卦 —— 《系辞》古法。',
  },
};

let divine = null; // { question, method, values, aiStarted }

function renderAsk() {
  divine = null;
  const root = $('#view-divine');
  root.innerHTML = `
    <div class="ask-hero fade-in">
      <p class="ask-motto">无有远近幽深 · 遂知来物</p>
      <h1 class="ask-title">所问何事</h1>
      <div class="ask-divider"></div>
    </div>
    <form class="ask-form">
      <textarea id="askInput" class="ask-input" rows="1" maxlength="120"
        placeholder="静心凝神，把所问之事写在这里"></textarea>
      <div class="method-row" role="radiogroup" aria-label="起卦方式">
        <button type="button" class="method-pill active" data-method="coins">三钱法</button>
        <button type="button" class="method-pill" data-method="yarrow">大衍筮法</button>
      </div>
      <p class="method-note">${METHODS.coins.note}</p>
      <button type="submit" class="btn-primary">起卦</button>
    </form>`;

  let method = 'coins';
  const input = $('#askInput', root);
  const autosize = () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      root.querySelector('form').requestSubmit();
    }
  });

  root.querySelectorAll('.method-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      method = btn.dataset.method;
      root.querySelectorAll('.method-pill').forEach((b) => b.classList.toggle('active', b === btn));
      $('.method-note', root).textContent = METHODS[method].note;
    });
  });

  root.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question) {
      input.focus();
      input.placeholder = '先写下所问之事，方可起卦';
      return;
    }
    divine = { question, method, values: [], aiStarted: false };
    renderCast();
  });

  setTimeout(() => input.focus(), 300);
}

/* ==========================================================================
   问卦 · ② 起卦
   ========================================================================== */

function castStageSkeleton(extraHtml) {
  const root = $('#view-divine');
  root.innerHTML = `
    <div class="cast-stage">
      <p class="cast-question">所问：<em>${escapeHtml(divine.question)}</em></p>
      <p class="cast-progress" id="castProgress"></p>
      ${extraHtml}
      <div class="cast-readout" id="castReadout"></div>
      <div class="cast-hex-wrap"><div id="castHex"></div></div>
      <div class="cast-actions" id="castActions"></div>
    </div>`;
  return root;
}

const CN_NUM = ['一', '二', '三', '四', '五', '六'];

function updateCastCommon() {
  $('#castProgress').textContent =
    divine.values.length >= 6
      ? '六爻既备 · 卦成'
      : `第 ${CN_NUM[divine.values.length]} 爻 · 凡六爻`;
  const hexWrap = $('#castHex');
  hexWrap.innerHTML = '';
  hexWrap.appendChild(hexagramEl({ values: divine.values }));
}

function describeLine(v) {
  const k = LINE_KIND[v];
  return `<strong>${k.label}${k.mark ? ' ' + k.mark : ''}</strong>${k.moving ? ' · 变爻' : ''}`;
}

async function finishCastIfDone() {
  if (divine.values.length < 6) return false;
  updateCastCommon();
  await sleep(1200);
  renderResult();
  return true;
}

/* ---- 三钱法 ---- */

function renderCast() {
  if (divine.method === 'yarrow') return renderCastYarrow();

  castStageSkeleton(`
    <div class="coins-row" id="coinsRow">
      ${[0, 1, 2]
        .map(
          () => `
        <div class="coin">
          <div class="coin-face front">
            <span class="coin-hole"></span>
            <span class="coin-char top">乾</span><span class="coin-char bottom">隆</span>
            <span class="coin-char right">通</span><span class="coin-char left">宝</span>
          </div>
          <div class="coin-face back">
            <span class="coin-back-mark"></span>
            <span class="coin-hole"></span>
          </div>
        </div>`
        )
        .join('')}
    </div>`);

  $('#castActions').innerHTML = `
    <button class="btn-primary" id="btnCast">掷　钱</button>
    <button class="btn-ghost" id="btnAuto">一气呵成</button>`;
  updateCastCommon();

  const coins = Array.from(document.querySelectorAll('#coinsRow .coin'));
  let busy = false;

  async function castOnce() {
    if (busy || divine.values.length >= 6) return;
    busy = true;
    $('#btnCast').disabled = true;
    $('#castReadout').innerHTML = '&nbsp;';
    coins.forEach((c) => {
      c.classList.remove('reveal', 'show-back');
      c.classList.add('spin');
    });
    await sleep(760);

    const { value, coins: faces } = castCoinLine();
    coins.forEach((c, i) => {
      setTimeout(() => {
        c.classList.remove('spin');
        if (faces[i] === 3) c.classList.add('show-back');
        c.classList.add('reveal');
      }, i * 130);
    });
    await sleep(130 * 2 + 560);

    const backs = faces.filter((f) => f === 3).length;
    const desc = ['三字', '一背两字', '两背一字', '三背'][backs];
    $('#castReadout').innerHTML = `${desc} · ${describeLine(value)}`;
    divine.values.push(value);
    updateCastCommon();

    if (!(await finishCastIfDone())) {
      $('#btnCast').disabled = false;
      busy = false;
    }
  }

  $('#btnCast').addEventListener('click', castOnce);
  $('#btnAuto').addEventListener('click', async () => {
    if (busy) return;
    $('#btnAuto').disabled = true;
    while (divine.values.length < 6) {
      // eslint-disable-next-line no-await-in-loop
      await castOnce();
      // eslint-disable-next-line no-await-in-loop
      await sleep(420);
    }
  });
}

/* ---- 大衍筮法 ---- */

function renderCastYarrow() {
  castStageSkeleton(`<div class="yarrow-log" id="yarrowLog"></div>`);
  $('#castActions').innerHTML = `
    <button class="btn-primary" id="btnCast">揲　蓍</button>
    <button class="btn-ghost" id="btnAuto">一气呵成</button>`;
  updateCastCommon();

  let busy = false;

  async function castOnce() {
    if (busy || divine.values.length >= 6) return;
    busy = true;
    $('#btnCast').disabled = true;
    const log = $('#yarrowLog');
    log.innerHTML = '';

    const { value, changes } = castYarrowLine();
    for (let i = 0; i < 3; i++) {
      const c = changes[i];
      log.appendChild(
        el(
          `<div>第${CN_NUM[i]}变 · 分二 左${c.left} 右${c.right} · 挂一揲四，归奇去 ${c.removed}，余 ${c.remain}</div>`
        )
      );
      // eslint-disable-next-line no-await-in-loop
      await sleep(520);
    }
    log.appendChild(el(`<div class="yarrow-sum">${changes[2].remain} ÷ 4 = ${value}</div>`));
    await sleep(300);

    $('#castReadout').innerHTML = describeLine(value);
    divine.values.push(value);
    updateCastCommon();

    if (!(await finishCastIfDone())) {
      $('#btnCast').disabled = false;
      busy = false;
    }
  }

  $('#btnCast').addEventListener('click', castOnce);
  $('#btnAuto').addEventListener('click', async () => {
    if (busy) return;
    $('#btnAuto').disabled = true;
    while (divine.values.length < 6) {
      // eslint-disable-next-line no-await-in-loop
      await castOnce();
      // eslint-disable-next-line no-await-in-loop
      await sleep(260);
    }
  });
}

/* ==========================================================================
   问卦 · ③ 卦成
   ========================================================================== */

function judgmentHtml(h) {
  return `<span class="gua-name">${h.name}</span>：${escapeHtml(h.judgment)}`;
}

function scriptureBlocks(h, movingIdx = [], { withLines = true } = {}) {
  let html = `
    <div class="text-block"><span class="tag">卦辞</span>${escapeHtml(h.judgment)}</div>
    <div class="text-block"><span class="tag">彖曰</span>${escapeHtml(h.tuan)}</div>
    <div class="text-block"><span class="tag">象曰</span>${escapeHtml(h.xiang)}</div>`;
  if (withLines) {
    html += h.lines
      .slice(0, 6)
      .map((l, i) => {
        const moving = movingIdx.includes(i);
        return `<div class="text-block${moving ? ' line-moving' : ''}">
          <span class="tag">${l.name}</span>${escapeHtml(l.text)}
          <span class="line-xiang">象曰：${escapeHtml(l.xiang)}</span>
        </div>`;
      })
      .join('');
    if (h.lines[6]) {
      const ex = h.lines[6];
      html += `<div class="text-block">
        <span class="tag">${ex.name}</span>${escapeHtml(ex.text)}
        <span class="line-xiang">象曰：${escapeHtml(ex.xiang)}</span>
      </div>`;
    }
  }
  return html;
}

function renderResult() {
  const result = deriveHexagrams(divine.values);
  divine.result = result;
  const { origin, changed, movingIdx } = result;
  const rule = divinationRule(result);

  const citesHtml = rule.cites
    .map((c) => {
      const t = citeText(c);
      return `<div class="cite"><span class="cite-title">${t.title}</span>${escapeHtml(
        t.text
      )}${c.note ? `<span class="cite-note">（${c.note}）</span>` : ''}</div>`;
    })
    .join('');

  const root = $('#view-divine');
  root.innerHTML = `
    <div class="result-head fade-in">
      <p class="result-eyebrow">${METHODS[divine.method].name} · ${
    movingIdx.length ? `${CN_NUM[movingIdx.length - 1]}爻动` : '六爻安静'
  }</p>
      <div class="result-main">
        <div class="result-hex-block">
          <div id="originHex"></div>
          <div class="result-hex-name">${origin.fullName}</div>
          <div class="result-hex-sub">本卦 · ${origin.upperSymbol}${origin.upper}上 ${
    origin.lowerSymbol
  }${origin.lower}下</div>
        </div>
        ${
          changed
            ? `<div class="result-arrow">→</div>
        <div class="result-hex-block">
          <div id="changedHex"></div>
          <div class="result-hex-name">${changed.fullName}</div>
          <div class="result-hex-sub">之卦 · ${changed.upperSymbol}${changed.upper}上 ${changed.lowerSymbol}${changed.lower}下</div>
        </div>`
            : ''
        }
      </div>
      <p class="result-judgment">${judgmentHtml(origin)}</p>
    </div>

    <div class="rule-card">
      <h4>当占之辞</h4>
      <p class="rule-text">${rule.rule}</p>
      ${citesHtml}
    </div>

    <div class="result-cta">
      <button class="btn-primary" id="btnAI">请 AI 解卦</button>
      <button class="btn-ghost" id="btnAgain">再问一卦</button>
    </div>

    <div id="aiPanel"></div>

    <div class="scripture-section">
      <div class="section-label">本卦 · ${origin.fullName}</div>
      ${scriptureBlocks(origin, movingIdx)}
      ${
        changed
          ? `<div class="section-label">之卦 · ${changed.fullName}</div>${scriptureBlocks(
              changed,
              [],
              { withLines: false }
            )}`
          : ''
      }
    </div>`;

  $('#originHex').appendChild(hexagramEl({ values: divine.values }));
  if (changed) $('#changedHex').appendChild(hexagramEl({ array: changed.array, small: false, marks: false }));

  $('#btnAgain').addEventListener('click', renderAsk);
  $('#btnAI').addEventListener('click', startAI);
}

/* ==========================================================================
   AI 解卦
   ========================================================================== */

let aiAbort = null;

function startAI() {
  if (divine.aiStarted) return;
  divine.aiStarted = true;
  $('#btnAI').disabled = true;

  const panel = $('#aiPanel');
  panel.innerHTML = `
    <div class="ai-panel">
      <p class="ai-status" id="aiStatus">敬呈卦象 · 静候解辞</p>
      <div class="ai-output" id="aiOutput" hidden></div>
    </div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const messages = buildMessages({
    question: divine.question,
    methodName: METHODS[divine.method].name,
    result: divine.result,
  });

  let text = '';
  let rafPending = false;
  const output = $('#aiOutput');

  const paint = (done = false) => {
    if (rafPending && !done) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      output.innerHTML = renderMarkdown(text) + (done ? '' : '<span class="ai-cursor"></span>');
    });
  };

  aiAbort = streamInterpret({
    messages,
    onReasoning() {
      $('#aiStatus').textContent = '推演卦象 · 凝神细思';
    },
    onDelta(chunk) {
      if (output.hidden) {
        output.hidden = false;
        $('#aiStatus').hidden = true;
      }
      text += chunk;
      paint();
    },
    onDone(gotContent) {
      if (!gotContent) {
        $('#aiStatus').textContent = '未收到解辞，请稍后再试';
        divine.aiStarted = false;
        $('#btnAI').disabled = false;
        return;
      }
      paint(true);
    },
    onError(msg, status) {
      output.hidden = true;
      $('#aiStatus').hidden = true;
      const hint =
        status === 401
          ? ' <a href="#/settings" style="color:var(--cinnabar);border-bottom:1px solid currentColor">前往设置 →</a>'
          : '';
      panel.querySelector('.ai-panel').appendChild(el(`<p class="ai-error">${escapeHtml(msg)}${hint}</p>`));
      divine.aiStarted = false;
      $('#btnAI').disabled = false;
    },
  });
}

/* ==========================================================================
   卦典
   ========================================================================== */

function renderCanon() {
  const root = $('#view-canon');
  root.innerHTML = `
    <div class="canon-head">
      <h1 class="view-title">六十四卦</h1>
      <p class="view-subtitle">《周易》通行本 · 依文王卦序</p>
    </div>
    <div class="canon-grid"></div>`;
  const grid = $('.canon-grid', root);
  for (const h of HEXAGRAMS) {
    const cell = el(`<button class="canon-cell" title="${h.fullName}">
      <span class="no">${h.id}</span>
      <span class="hexwrap"></span>
      <span class="nm">${h.name}</span>
    </button>`);
    $('.hexwrap', cell).appendChild(hexagramEl({ array: h.array, small: true }));
    cell.addEventListener('click', () => openHexModal(h));
    grid.appendChild(cell);
  }
}

function openHexModal(h) {
  const rootM = $('#modal-root');
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal-card" role="dialog" aria-label="${h.fullName}">
        <button class="modal-close" aria-label="关闭">✕</button>
        <div class="hex-detail-head">
          <div class="hexwrap"></div>
          <div class="hex-detail-title">
            <div class="fn">${h.fullName}</div>
            <div class="meta">第 ${h.id} 卦 · ${h.upperSymbol}${h.upper}上 ${h.lowerSymbol}${h.lower}下</div>
          </div>
        </div>
        ${scriptureBlocks(h, [])}
        ${
          h.xugua
            ? `<div class="text-block"><span class="tag">序卦</span>${escapeHtml(h.xugua)}</div>`
            : ''
        }
        ${
          h.wenyan
            ? `<div class="section-label">文言传</div>${h.wenyan
                .split('\n')
                .map((p) => `<div class="text-block">${escapeHtml(p)}</div>`)
                .join('')}`
            : ''
        }
      </div>
    </div>`);
  $('.hexwrap', overlay).appendChild(hexagramEl({ array: h.array }));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.modal-close')) overlay.remove();
  });
  const onKey = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
  rootM.appendChild(overlay);
}

/* ==========================================================================
   易传
   ========================================================================== */

function renderZhuan(activeId = 'xici') {
  const root = $('#view-zhuan');
  root.innerHTML = `
    <div class="canon-head">
      <h1 class="view-title">易　传</h1>
      <p class="view-subtitle">十翼 · 孔门解易之作</p>
    </div>
    <div class="zhuan-layout">
      <div class="zhuan-tabs"></div>
      <div class="zhuan-body"></div>
    </div>`;
  const tabs = $('.zhuan-tabs', root);
  const body = $('.zhuan-body', root);

  const show = (id) => {
    const t = TEXTS.find((x) => x.id === id);
    tabs.querySelectorAll('.zhuan-tab').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    body.innerHTML =
      `<h2>${t.title}</h2>` +
      t.sections
        .map(
          (s) =>
            (s.title ? `<h3>${escapeHtml(s.title)}</h3>` : '') +
            s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')
        )
        .join('');
    body.scrollTop = 0;
  };

  for (const t of TEXTS) {
    const b = el(`<button class="zhuan-tab" data-id="${t.id}">${t.title}</button>`);
    b.addEventListener('click', () => show(t.id));
    tabs.appendChild(b);
  }
  show(activeId);
}

/* ==========================================================================
   设置
   ========================================================================== */

async function renderSettings() {
  const root = $('#view-settings');
  const s = getSettings();
  const cfg = await fetchServerConfig();

  root.innerHTML = `
    <div class="canon-head">
      <h1 class="view-title">设　置</h1>
      <p class="view-subtitle">解卦所用 · 智谱 GLM 大模型</p>
    </div>
    <div class="settings-wrap">
      <div class="settings-field">
        <label for="setKey">API KEY</label>
        <input id="setKey" type="password" autocomplete="off" spellcheck="false"
          placeholder="${cfg.hasServerKey ? '服务端已配置，可留空' : '粘贴你的智谱 API Key'}"
          value="${escapeHtml(s.apiKey || '')}" />
        <p class="settings-hint">${
          cfg.hasServerKey
            ? '服务端 .env 已配置密钥，此处留空即用服务端密钥；填写则以此处为准。'
            : '在 <a href="https://open.bigmodel.cn" target="_blank" rel="noreferrer" style="border-bottom:1px dotted currentColor">open.bigmodel.cn</a> 申请。密钥只保存在你自己的浏览器（localStorage），经由本地服务转发，不会上传至他处。'
        }</p>
      </div>
      <div class="settings-field">
        <label for="setModel">模型</label>
        <input id="setModel" type="text" autocomplete="off" spellcheck="false"
          placeholder="${escapeHtml(cfg.defaultModel)}" value="${escapeHtml(s.model || '')}" />
        <p class="settings-hint">留空使用默认模型 ${escapeHtml(cfg.defaultModel)}；亦可填 glm-4.6 等。</p>
      </div>
      <p class="settings-status" id="setStatus"></p>
      <div class="settings-actions">
        <button class="btn-primary" id="btnSave">保　存</button>
        <button class="btn-ghost" id="btnTest">测试连通</button>
      </div>
    </div>`;

  const status = $('#setStatus', root);

  $('#btnSave', root).addEventListener('click', () => {
    saveSettings({ apiKey: $('#setKey').value.trim(), model: $('#setModel').value.trim() });
    status.className = 'settings-status ok';
    status.textContent = '已保存。';
  });

  $('#btnTest', root).addEventListener('click', () => {
    saveSettings({ apiKey: $('#setKey').value.trim(), model: $('#setModel').value.trim() });
    status.className = 'settings-status';
    status.textContent = '正在连通智谱……';
    let done = false;
    const abort = streamInterpret({
      messages: [{ role: 'user', content: '请只回复一个字：吉' }],
      onDelta() {
        if (done) return;
        done = true;
        status.className = 'settings-status ok';
        status.textContent = '连通正常，模型可用。';
        abort();
      },
      onDone(got) {
        if (done) return;
        done = true;
        status.className = got ? 'settings-status ok' : 'settings-status err';
        status.textContent = got ? '连通正常，模型可用。' : '已连通但未收到内容，请检查模型名。';
      },
      onError(msg) {
        if (done) return;
        done = true;
        status.className = 'settings-status err';
        status.textContent = msg;
      },
    });
  });
}

/* ==========================================================================
   启动
   ========================================================================== */

initTheme();
window.addEventListener('hashchange', router);
router();
