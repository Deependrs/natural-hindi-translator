# Testing Checklist

## Setup
- [ ] Load unpacked in chrome://extensions
- [ ] Check service worker logs: Extensions → Service Worker → inspect
- [ ] Open Options → verify default provider MyMemory works

## Functional Tests

### 1. Articles
- Open https://en.wikipedia.org/wiki/Artificial_intelligence
- Click Translate Page → should show overlay, progress to 100%, content becomes Hindi, headings/lists preserved
- Toggle Original/Translated → reverts and re-translates
- Switch style to Simple → retranslate → should be simpler

### 2. Technical Docs
- Open https://developer.mozilla.org/en-US/docs/Web/JavaScript
- Translate with Technical style → verify terms like "function", "API", "variable" remain English
- Ensure <code> blocks not translated

### 3. Blog with dynamic content
- Open a Medium blog, scroll down to load more, translate → new content should auto-translate via observer

### 4. Selected Text
- Select a paragraph → right-click → Translate to Hindi → popup appears near selection
- Popup: copy button works, toggle original, switch style retriggers translation

### 5. Popup UI
- Open toolbar popup → status shows English ready
- Select style → active visual feedback
- After page translated, status dot green, count shown

### 6. Options & Providers
- Options page saves settings
- Test Translation box works for each provider
- Clear Cache works
- Reset works

### 7. Error Handling
- Disconnect internet → translate → should show error, not crash, original preserved
- Set invalid API URL → should show error message with tip

### 8. Privacy
- Verify no network request before clicking Translate (check DevTools Network)
- After translate, only translation requests seen

### 9. Performance
- Long page (5000+ words) → translates in batches, UI stays responsive, no infinite loop

### 10. Edge Cases
- Page already in Hindi (e.g., Hindi Wikipedia) → should detect and skip most nodes
- Page with code snippet → code not translated
- Navigation menu stays English (excluded selector)

## Known Issues to Watch
- Some sites use shadow DOM – content script may not reach inside (acceptable for MVP)
- Sites with CSP blocking inline styles – our Shadow DOM styles isolated, overlay may need adjustment
- MyMemory rate limit 1000 chars/day IP? Switch to LLM for heavy testing
