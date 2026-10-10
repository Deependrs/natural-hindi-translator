
// content.js - Main page translation logic
(function() {
  const utils = window.HindiTranslatorUtils;
  const chunker = window.HindiTranslatorChunker;
  if (!utils || !chunker) {
    console.error('Hindi Translator utils not loaded');
    return;
  }

  let state = {
    isTranslated: false,
    originalMap: new WeakMap(), // textNode -> original text
    translatedNodes: new Set(),
    style: 'natural',
    observer: null,
    isTranslating: false,
    cache: new Map()
  };

  // UI Elements
  let overlay = null;
  let selectionPopup = null;

  function createOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'ht-overlay';
    overlay.innerHTML = `
      <div class="ht-overlay-content">
        <div class="ht-spinner"></div>
        <div class="ht-overlay-text">हिंदी में अनुवाद हो रहा है...</div>
        <div class="ht-overlay-progress"><span id="ht-progress">0%</span></div>
        <button id="ht-cancel" class="ht-btn-secondary">रद्द करें</button>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    document.getElementById('ht-cancel')?.addEventListener('click', () => {
      state.isTranslating = false;
      hideOverlay();
    });
    return overlay;
  }

  function showOverlay() {
    const ov = createOverlay();
    ov.classList.add('visible');
  }
  function hideOverlay() {
    if (overlay) overlay.classList.remove('visible');
  }
  function updateProgress(pct, text) {
    const el = document.getElementById('ht-progress');
    if (el) el.textContent = `${pct}% ${text || ''}`;
    const txtEl = overlay?.querySelector('.ht-overlay-text');
    if (txtEl && text) txtEl.textContent = text;
  }

  function createSelectionPopup() {
    if (selectionPopup) return selectionPopup;
    const host = document.createElement('div');
    host.id = 'ht-selection-host';
    const shadow = host.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .popup {
        position: absolute;
        z-index: 2147483647;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05);
        width: 380px;
        max-width: 90vw;
        font-family: 'Noto Sans Devanagari', system-ui, -apple-system, sans-serif;
        overflow: hidden;
        border: 1px solid #e5e7eb;
        animation: slideIn 0.2s ease;
      }
      @keyframes slideIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
      .header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb;
      }
      .header-title { font-weight: 600; font-size: 13px; color: #111827; }
      .header-actions { display: flex; gap: 6px; }
      .icon-btn {
        width: 28px; height: 28px; border-radius: 6px; border: 1px solid #e5e7eb;
        background: white; cursor: pointer; display:flex; align-items:center; justify-content:center;
        font-size: 14px;
      }
      .icon-btn:hover { background: #f3f4f6; }
      .style-row { display:flex; gap:6px; padding: 8px 12px; background: #fff; border-bottom: 1px solid #f3f4f6; flex-wrap: wrap; }
      .style-chip {
        font-size: 11px; padding: 4px 8px; border-radius: 20px; border:1px solid #d1d5db;
        cursor:pointer; background: white; color:#374151;
      }
      .style-chip.active { background:#111827; color:white; border-color:#111827; }
      .content { padding: 14px 16px; max-height: 320px; overflow-y: auto; }
      .translated { font-size: 15px; line-height: 1.6; color: #111827; white-space: pre-wrap; }
      .original { font-size: 12px; color: #6b7280; margin-top: 10px; padding-top:10px; border-top:1px dashed #e5e7eb; display:none; }
      .original.visible { display:block; }
      .footer { padding: 10px 12px; display:flex; gap:8px; background:#f9fafb; border-top:1px solid #e5e7eb; }
      .btn { flex:1; padding:8px 10px; border-radius:8px; font-size:12px; font-weight:500; cursor:pointer; border:1px solid; }
      .btn-primary { background:#2563eb; color:white; border-color:#2563eb; }
      .btn-primary:hover { background:#1d4ed8; }
      .btn-secondary { background:white; color:#374151; border-color:#d1d5db; }
      .btn-secondary:hover { background:#f3f4f6; }
      .loading { text-align:center; padding:20px; color:#6b7280; font-size:13px; }
    `;
    shadow.appendChild(style);
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
      <div class="header">
        <span class="header-title">हिंदी अनुवाद</span>
        <div class="header-actions">
          <button class="icon-btn" data-action="toggleOrig" title="मूल दिखाएँ">Aa</button>
          <button class="icon-btn" data-action="close" title="बंद">✕</button>
        </div>
      </div>
      <div class="style-row">
        <button class="style-chip active" data-style="natural">Natural</button>
        <button class="style-chip" data-style="simple">Simple</button>
        <button class="style-chip" data-style="technical">Technical</button>
        <button class="style-chip" data-style="literal">Literal</button>
      </div>
      <div class="content">
        <div class="translated loading">अनुवाद हो रहा है...</div>
        <div class="original"></div>
      </div>
      <div class="footer">
        <button class="btn btn-secondary" data-action="copy">Copy</button>
        <button class="btn btn-primary" data-action="expand">Page में बदलें</button>
      </div>
    `;
    shadow.appendChild(popup);

    // events
    popup.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const act = t.dataset.action;
      if (act === 'close') host.remove();
      if (act === 'copy') {
        const txt = shadow.querySelector('.translated').textContent;
        navigator.clipboard.writeText(txt).then(()=>{
          t.textContent='Copied!'; setTimeout(()=>t.textContent='Copy',1200);
        });
      }
      if (act === 'toggleOrig') {
        shadow.querySelector('.original').classList.toggle('visible');
      }
      if (act === 'expand') {
        // Replace selection in page if possible
        if (currentSelectionRange) {
          // For demo, we keep popup; actual page replacement handled via page translation
          host.remove();
        }
      }
    });
    popup.querySelectorAll('.style-chip').forEach(chip => {
      chip.addEventListener('click', async () => {
        popup.querySelectorAll('.style-chip').forEach(c=>c.classList.remove('active'));
        chip.classList.add('active');
        const newStyle = chip.dataset.style;
        // retranslate
        const original = shadow.querySelector('.original').dataset.fullOriginal || '';
        if (original) {
          shadow.querySelector('.translated').textContent = 'अनुवाद हो रहा है...';
          const result = await requestTranslation([original], newStyle, [{before:'', after:''}]);
          if (result && result[0]) shadow.querySelector('.translated').textContent = result[0];
        }
      });
    });

    document.documentElement.appendChild(host);
    selectionPopup = host;
    return host;
  }

  let currentSelectionRange = null;

  async function requestTranslation(texts, style, contexts) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'TRANSLATE_BATCH', texts, style, contexts }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (!resp || !resp.ok) {
          reject(new Error('Translation failed'));
          return;
        }
        resolve(resp.translations);
      });
    });
  }

  async function translateSelection(text) {
    const host = createSelectionPopup();
    const shadow = host.shadowRoot;
    const sel = window.getSelection();
    let rect = null;
    if (sel && sel.rangeCount>0) {
      currentSelectionRange = sel.getRangeAt(0).cloneRange();
      rect = currentSelectionRange.getBoundingClientRect();
    }
    const popupEl = shadow.querySelector('.popup');
    // position
    const top = (rect ? rect.bottom + window.scrollY + 10 : window.scrollY + 100);
    const left = rect ? Math.min(rect.left + window.scrollX, window.innerWidth - 400) : 20;
    popupEl.style.top = Math.max(10, top) + 'px';
    popupEl.style.left = Math.max(10, left) + 'px';

    const translatedEl = shadow.querySelector('.translated');
    const originalEl = shadow.querySelector('.original');
    originalEl.textContent = text;
    originalEl.dataset.fullOriginal = text;

    try {
      const config = await new Promise(res=>{
        chrome.runtime.sendMessage({type:'GET_CONFIG'}, r=> res(r?.config||{}));
      });
      const style = config.defaultStyle || 'natural';
      // set active chip
      shadow.querySelectorAll('.style-chip').forEach(c=>{
        c.classList.toggle('active', c.dataset.style===style);
      });
      const translations = await requestTranslation([text], style, [{before:'', after:''}]);
      if (translations && translations[0]) {
        translatedEl.textContent = translations[0];
        translatedEl.classList.remove('loading');
      } else {
        translatedEl.textContent = 'अनुवाद विफल। पुनः प्रयास करें।';
      }
    } catch (e) {
      console.error(e);
      translatedEl.textContent = 'Error: ' + e.message + '\n\nTip: Options में Provider सेट करें।';
    }
  }

  async function translatePage(requestedStyle) {
    if (state.isTranslating) return;
    state.isTranslating = true;
    showOverlay();
    try {
      const config = await new Promise(res=>{
        chrome.runtime.sendMessage({type:'GET_CONFIG'}, r=> res(r?.config||{}));
      });
      const style = requestedStyle || config.defaultStyle || 'natural';
      state.style = style;

      const root = utils.getReadableRoot();
      let nodes = utils.collectTextNodes(root);
      
      // filter already translated
      nodes = nodes.filter(n => !state.originalMap.has(n));
      
      if (nodes.length === 0) {
        updateProgress(100, 'कोई नया टेक्स्ट नहीं मिला');
        setTimeout(hideOverlay, 800);
        state.isTranslating = false;
        return;
      }

      const chunks = chunker.groupNodes(nodes);
      const texts = chunks.map(c=>c.text);
      const contexts = chunks.map(c=>({before:c.contextBefore, after:c.contextAfter}));

      updateProgress(5, `${chunks.length} भाग मिले, अनुवाद शुरू...`);
      // batch in groups of 5 for progress
      const batchSize = 5;
      let translatedCount = 0;
      for (let i=0; i<chunks.length; i+=batchSize) {
        if (!state.isTranslating) break; // cancelled
        const batchTexts = texts.slice(i, i+batchSize);
        const batchCtx = contexts.slice(i, i+batchSize);
        const batchChunks = chunks.slice(i, i+batchSize);
        
        const translations = await requestTranslation(batchTexts, style, batchCtx);
        
        // Apply
        batchChunks.forEach((chunk, idx) => {
          const translated = translations[idx];
          if (!translated) return;
          // For simplicity, distribute translated text back to nodes proportionally
          // Better: if chunk has 1 node, direct; if multiple, split by sentences
          if (chunk.nodes.length === 1) {
            const node = chunk.nodes[0];
            if (!state.originalMap.has(node)) {
              state.originalMap.set(node, node.nodeValue);
            }
            node.nodeValue = translated;
            state.translatedNodes.add(node);
          } else {
            // Split translated into parts by sentence count match
            const originalParts = chunk.nodes.map(n=>n.nodeValue);
            // Heuristic: join translations and split roughly
            // For MVP: if counts match after splitting translated by \n\n, use that
            const transParts = translated.split(/\n\n/).length >= chunk.nodes.length ? translated.split(/\n\n/) : null;
            if (transParts && transParts.length >= chunk.nodes.length) {
              chunk.nodes.forEach((node, ni) => {
                if (!state.originalMap.has(node)) state.originalMap.set(node, node.nodeValue);
                node.nodeValue = transParts[ni] || transParts[0];
                state.translatedNodes.add(node);
              });
            } else {
              // fallback: put whole translation in first node, clear others? No, better distribute sentences
              const sentences = translated.split(/(?<=[।.!?])\s+/);
              // distribute sentences round-robin to nodes
              let sIdx = 0;
              chunk.nodes.forEach(node => {
                if (!state.originalMap.has(node)) state.originalMap.set(node, node.nodeValue);
                const take = Math.max(1, Math.floor(sentences.length / chunk.nodes.length));
                const slice = sentences.slice(sIdx, sIdx+take).join(' ');
                node.nodeValue = slice || translated;
                state.translatedNodes.add(node);
                sIdx += take;
              });
            }
          }
        });

        translatedCount += batchTexts.length;
        const pct = Math.round((translatedCount / chunks.length)*100);
        updateProgress(pct, `${translatedCount}/${chunks.length} अनुवादित`);
        // small delay to keep UI responsive
        await new Promise(r=>setTimeout(r, 50));
      }

      state.isTranslated = true;
      updateProgress(100, 'पूरा हुआ! ✓');
      setTimeout(hideOverlay, 1200);
      
      // start observer for dynamic content
      startObserver(style);

      // Notify popup
      chrome.runtime.sendMessage({ type: 'PAGE_TRANSLATION_DONE', count: state.translatedNodes.size });

    } catch (e) {
      console.error('Page translation failed', e);
      updateProgress(0, 'त्रुटि: ' + e.message);
      setTimeout(hideOverlay, 3000);
    } finally {
      state.isTranslating = false;
    }
  }

  function revertPage() {
    let reverted = 0;
    for (const node of state.translatedNodes) {
      const orig = state.originalMap.get(node);
      if (orig !== undefined) {
        try { node.nodeValue = orig; reverted++; } catch(e){}
      }
    }
    state.translatedNodes.clear();
    state.originalMap = new WeakMap();
    state.isTranslated = false;
    stopObserver();
    return reverted;
  }

  function togglePage() {
    if (state.isTranslated) {
      revertPage();
    } else {
      translatePage(state.style);
    }
  }

  let dynamicDebounce = null;
  function startObserver(style) {
    stopObserver();
    const root = utils.getReadableRoot();
    state.observer = new MutationObserver((mutations) => {
      if (!state.isTranslated) return;
      clearTimeout(dynamicDebounce);
      dynamicDebounce = setTimeout(async () => {
        const newNodes = [];
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
              if (utils.isEnglish(node.nodeValue) && !state.originalMap.has(node)) newNodes.push(node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const collected = utils.collectTextNodes(node);
              for (const cn of collected) {
                if (!state.originalMap.has(cn)) newNodes.push(cn);
              }
            }
          }
        }
        if (newNodes.length>0) {
          const chunks = chunker.groupNodes(newNodes);
          const texts = chunks.map(c=>c.text);
          const ctx = chunks.map(c=>({before:c.contextBefore, after:c.contextAfter}));
          try {
            const translations = await requestTranslation(texts, style, ctx);
            chunks.forEach((chunk, idx)=>{
              const tr = translations[idx];
              if (!tr) return;
              chunk.nodes.forEach(n=>{
                if (!state.originalMap.has(n)) state.originalMap.set(n, n.nodeValue);
                n.nodeValue = tr.split(/\n\n/)[0] || tr;
                state.translatedNodes.add(n);
              });
            });
          } catch(e){ console.warn('Dynamic translate failed', e); }
        }
      }, 1000);
    });
    state.observer.observe(root, { childList: true, subtree: true, characterData: false });
  }
  function stopObserver() {
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
  }

  // Listen messages
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (msg.type === 'TRANSLATE_PAGE') {
        await translatePage(msg.style);
        sendResponse({ ok:true, isTranslated: state.isTranslated });
      } else if (msg.type === 'REVERT_PAGE') {
        const count = revertPage();
        sendResponse({ ok:true, reverted: count, isTranslated: false });
      } else if (msg.type === 'TOGGLE_PAGE') {
        if (state.isTranslated) {
          revertPage();
          sendResponse({ ok:true, isTranslated:false });
        } else {
          await translatePage(msg.style);
          sendResponse({ ok:true, isTranslated: state.isTranslated });
        }
      } else if (msg.type === 'GET_PAGE_STATE') {
        sendResponse({ ok:true, isTranslated: state.isTranslated, style: state.style, count: state.translatedNodes.size, isTranslating: state.isTranslating });
      } else if (msg.type === 'TRANSLATE_SELECTION') {
        await translateSelection(msg.text);
        sendResponse({ ok:true });
      } else if (msg.type === 'TRIGGER_PAGE_TRANSLATE') {
        await translatePage();
        sendResponse({ ok:true });
      }
    })();
    return true;
  });

  // Double-click translation shortcut
  document.addEventListener('dblclick', () => {
    setTimeout(()=>{
      const sel = window.getSelection().toString().trim();
      if (sel && sel.length>2 && sel.length<500 && utils.isEnglish(sel)) {
        // optional auto? We leave to context menu to avoid annoyance
      }
    }, 200);
  });

  console.log('[Hindi Translator] Content script ready');
})();
