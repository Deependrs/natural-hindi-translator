
// Secure backend proxy - keeps API keys out of extension source
// Deploy to Render, Fly.io, Railway, Vercel, etc.
// Extension sets API URL to https://your-backend.com/translate

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors({ origin: '*' })); // In production, restrict to chrome-extension://*
app.use(express.json({ limit: '100kb' }));

const PORT = process.env.PORT || 3000;
const LLM_API_URL = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY; // your secret
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

const STYLE_PROMPTS = {
  natural: `You are an expert English to Hindi translator. Translate meaning, not word-by-word. Output must be natural, fluent Hindi as if originally written in Hindi. Preserve technical terms, names, numbers, dates, formulas, code identifiers. Use commonly understood Hindi, not overly Sanskritized. Keep tone. Do NOT add explanations. Translate ONLY the provided text.`,
  simple: `You are an expert translator for beginners. Translate English to very simple, easy Hindi using short sentences and common words. Preserve meaning but simplify complex idioms. Keep names, numbers, technical terms in English if needed. Output only translation.`,
  technical: `You are a technical translator. Translate English technical content to Hindi accurately. Retain standard English technical terms (API, function, variable, class, loop, server, database, AI, machine learning, React, JavaScript etc.) where Hindi translation would reduce clarity. Explain concepts in Hindi but keep code, formulas, and identifiers unchanged. Keep consistency.`,
  literal: `Provide a close literal translation from English to Hindi, staying as close as possible to original wording and structure while still being grammatically correct.`
};

app.get('/', (req,res)=>{
  res.json({ ok:true, message:'Hindi Translator Backend - POST /translate', model: LLM_MODEL });
});

app.post('/translate', async (req,res)=>{
  const { text, texts, style = 'natural', contextBefore='', contextAfter='' } = req.body;

  const inputTexts = texts || (text ? [text] : []);
  if (inputTexts.length===0) return res.status(400).json({ error:'No text provided' });

  if (!LLM_API_KEY) return res.status(500).json({ error:'LLM_API_KEY not set on server' });

  try {
    const translations = [];
    for (const t of inputTexts) {
      const systemPrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.natural;
      let userPrompt = '';
      if (contextBefore || contextAfter) {
        userPrompt += `Context before: "${String(contextBefore).slice(0,200)}"\nContext after: "${String(contextAfter).slice(0,200)}"\n\n`;
      }
      userPrompt += `Translate this to Hindi:\n\n${t}\n\nReturn ONLY Hindi translation, no explanation.`;

      const llmRes = await fetch(LLM_API_URL, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization': `Bearer ${LLM_API_KEY}`
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          messages:[
            { role:'system', content: systemPrompt },
            { role:'user', content: userPrompt }
          ],
          temperature: 0.3
        })
      });
      if (!llmRes.ok) {
        const err = await llmRes.text();
        throw new Error(`LLM error ${llmRes.status}: ${err.slice(0,500)}`);
      }
      const data = await llmRes.json();
      const translated = data.choices?.[0]?.message?.content?.trim() || '';
      translations.push(translated);
    }

    // If single text requested, return simple shape
    if (text && !texts) return res.json({ translation: translations[0], translations });

    res.json({ translations });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Compatibility for extension's expected OpenAI shape if extension points directly to /v1/chat/completions via backend
app.post('/v1/chat/completions', async (req,res)=>{
  // Proxy through same logic but accept OpenAI shape
  // This endpoint allows extension to use this backend as if it's OpenAI
  if (!LLM_API_KEY) return res.status(500).json({ error:'LLM_API_KEY not set' });
  try {
    const r = await fetch(LLM_API_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch(e) {
    res.status(500).json({ error:e.message });
  }
});

app.listen(PORT, ()=> console.log(`Backend running on http://localhost:${PORT} - model ${LLM_MODEL}`));
