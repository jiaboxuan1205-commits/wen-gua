/** 设置存取与 GLM 流式调用 */

const LS_KEY = 'wengua.settings';

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveSettings(patch) {
  const s = { ...getSettings(), ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  return s;
}

let serverConfig = null;
export async function fetchServerConfig() {
  if (serverConfig) return serverConfig;
  try {
    const r = await fetch('/api/config');
    serverConfig = await r.json();
  } catch {
    serverConfig = { hasServerKey: false, defaultModel: 'glm-5.2' };
  }
  return serverConfig;
}

/**
 * 流式解卦。onReasoning 在模型输出思考内容时回调（GLM 推理模型）。
 * 返回 abort 函数。
 */
export function streamInterpret({ messages, onDelta, onReasoning, onDone, onError }) {
  const controller = new AbortController();
  const settings = getSettings();

  (async () => {
    let resp;
    try {
      resp = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          apiKey: settings.apiKey || '',
          model: settings.model || '',
        }),
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name !== 'AbortError') onError(`网络错误：${e.message}`);
      return;
    }

    if (!resp.ok) {
      let msg = `请求失败（${resp.status}）`;
      try {
        const j = await resp.json();
        msg = j.error || msg;
      } catch {}
      onError(msg, resp.status);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let gotContent = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop(); // 余留半行
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta || {};
            if (delta.reasoning_content && onReasoning) onReasoning(delta.reasoning_content);
            if (delta.content) {
              gotContent = true;
              onDelta(delta.content);
            }
          } catch {
            /* 跳过无法解析的行 */
          }
        }
      }
      onDone(gotContent);
    } catch (e) {
      if (e.name !== 'AbortError') onError(`读取流失败：${e.message}`);
    }
  })();

  return () => controller.abort();
}
