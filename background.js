
// background.js - Service worker, translation provider, context menu

const STYLE_PROMPTS = {
  natural: `You are an expert English to Hindi translator. Translate meaning, not word-by-word. Output must be natural, fluent Hindi as if originally written in Hindi. Preserve technical terms, names, numbers, dates, formulas, code identifiers. Use commonly understood Hindi, not overly Sanskritized. Keep tone. Do NOT add explanations. Translate ONLY the provided text.`,
  simple: `You are an expert translator for beginners. Translate English to very simple, easy Hindi using short sentences and common words. Preserve meaning but simplify complex idioms. Keep names, numbers, technical terms in English if needed for clarity. Output only translation.`,
  technical: `You are a technical translator. Translate English technical content to Hindi accurately. Retain standard English technical terms (API, function, variable, class, loop, server, database, AI, machine learning, React, JavaScript etc.) where Hindi translation would reduce clarity. Explain concepts in Hindi but keep code, formulas, and identifiers unchanged. Keep consistency.`,
  literal: `Provide a close literal translation from English to Hindi, staying as close as possible to original wording and structure while still being grammatically correct.`
};

const DEFAULT_CONFIG = {
  provider: 'mymemory', // mymemory | libre | custom_llm
  apiUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini',
  defaultStyle: 'natural',
  enableCache: true,
  preserveCode: true
};

let translationCache = new Map();

async function getConfig() {
  const stored = await chrome.storage.local.get(['translatorConfig']);
  return { ...DEFAULT_CONFIG, ...(stored.translatorConfig || {}) };
}

async function saveConfig(cfg) {
  await chrome.storage.local.set({ translatorConfig: cfg });
}

// Provider implementations
async function translateWithMyMemory(text, config) {
  // MyMemory free API - no key, limited to ~500 chars per request
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|hi`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory error ${res.status}`);
  const data = await res.json();
  if (data.responseStatus !== 200 && data.responseData?.translatedText) {
    // still return
  }
  let translated = data.responseData?.translatedText || '';
  // MyMemory sometimes returns same text on failure
  return translated;
}

async function translateWithLibre(text, config) {
  if (!config.apiUrl) throw new Error('LibreTranslate URL not configured. Set it in Options.');
  const res = await fetch(config.apiUrl.replace(/\/$/,'') + '/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'en', target: 'hi', format: 'text' })
  });
  if (!res.ok) throw new Error(`LibreTranslate error ${res.status}`);
  const data = await res.json();
  return data.translatedText;
}

async function translateWithLLM(text, style, contextBefore, contextAfter, config) {
  if (!config.apiUrl) throw new Error('Custom LLM API URL not configured. Set it in Options page.');
  const systemPrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.natural;
  let userPrompt = '';
  if (contextBefore || contextAfter) {
    userPrompt += `Context before: "${contextBefore.slice(0,200)}"\nContext after: "${contextAfter.slice(0,200)}"\n\n`;
  }
  userPrompt += `Translate this to Hindi:\n\n${text}\n\nReturn ONLY Hindi translation, no explanation.`;

  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  // OpenAI compatible chat completions
  const body = {
    model: config.model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3
  };

  const res = await fetch(config.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText.slice(0,200)}`);
  }
  const data = await res.json();
  const translated = data.choices?.[0]?.message?.content?.trim() || data.choices?.[0]?.text?.trim() || '';
  if (!translated) throw new Error('Empty translation from LLM');
  return translated;
}

async function translateBatch(texts, style, contexts, config) {
  const results = [];
  const concurrency = 3;
  let index = 0;

  async function worker() {
    while (index < texts.length) {
      const i = index++;
      const text = texts[i];
      const ctx = contexts[i] || { before: '', after: '' };
      const cacheKey = `${style}::${text}`;
      if (config.enableCache && translationCache.has(cacheKey)) {
        results[i] = translationCache.get(cacheKey);
        continue;
      }
      try {
        let translated = '';
        if (config.provider === 'custom_llm') {
          translated = await translateWithLLM(text, style, ctx.before, ctx.after, config);
        } else if (config.provider === 'libre') {
          // libre handles longer texts, split if needed
          if (text.length > 1000) {
            const parts = text.split(/\n\n/);
            const tParts = [];
            for (const p of parts) {
              tParts.push(await translateWithLibre(p, config));
            }
            translated = tParts.join('\n\n');
          } else {
            translated = await translateWithLibre(text, config);
          }
        } else {
          // mymemory demo - handle long text by sentence split
          if (text.length > 450) {
            const sentences = text.split(/(?<=[.!?])\s+/);
            let acc = '';
            let cur = '';
            for (const s of sentences) {
              if ((cur + ' ' + s).length > 400) {
                if (cur) acc += (acc ? ' ' : '') + await translateWithMyMemory(cur, config);
                cur = s;
              } else {
                cur += (cur ? ' ' : '') + s;
              }
            }
            if (cur) acc += (acc ? ' ' : '') + await translateWithMyMemory(cur, config);
            translated = acc;
          } else {
            translated = await translateWithMyMemory(text, config);
          }
        }
        if (config.enableCache) translationCache.set(cacheKey, translated);
        results[i] = translated;
      } catch (e) {
        console.error('Translation error for chunk', i, e);
        results[i] = null; // signal failure
      }
    }
  }

  const workers = Array(Math.min(concurrency, texts.length)).fill(0).map(() => worker());
  await Promise.all(workers);
  return results;
}

// Message handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'TRANSLATE_BATCH') {
      const config = await getConfig();
      const style = msg.style || config.defaultStyle || 'natural';
      const texts = msg.texts || [];
      const contexts = msg.contexts || [];
      const translations = await translateBatch(texts, style, contexts, config);
      sendResponse({ ok: true, translations, style });
    } else if (msg.type === 'GET_CONFIG') {
      const config = await getConfig();
      sendResponse({ ok: true, config });
    } else if (msg.type === 'SAVE_CONFIG') {
      await saveConfig(msg.config);
      sendResponse({ ok: true });
    } else if (msg.type === 'GET_STATUS') {
      // forwarded to content script via tabs? For popup we need to query content
      sendResponse({ ok: true });
    } else if (msg.type === 'CLEAR_CACHE') {
      translationCache.clear();
      sendResponse({ ok: true });
    }
  })();
  return true; // async
});

// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'translate-to-hindi',
      title: 'Translate to Hindi',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'translate-page-to-hindi',
      title: 'Translate page to Hindi',
      contexts: ['page']
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'translate-to-hindi' && info.selectionText) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'TRANSLATE_SELECTION',
        text: info.selectionText
      });
    } catch (e) {
      console.warn('No content script ready', e);
    }
  } else if (info.menuItemId === 'translate-page-to-hindi') {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_PAGE_TRANSLATE' });
    } catch(e) {}
  }
});

// LRU cache limit
setInterval(() => {
  if (translationCache.size > 500) {
    const keys = Array.from(translationCache.keys()).slice(0, 200);
    keys.forEach(k => translationCache.delete(k));
  }
}, 60000);
