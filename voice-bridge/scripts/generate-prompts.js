// Pre-generates the static Yoruba prompts as MP3s (greeting, closing,
// consent) so calls NEVER wait on TTS synthesis. Requires SPITCH_API_KEY
// (YarnGPT fallback if YARNGPT_BASE_URL is set). Re-run whenever prompt
// wording changes — especially the consent script after §7 review.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PROMPTS, promptPath } from '../src/providers/tts/prompts.js';
import { synthesizeWithFallback } from '../src/providers/tts/index.js';

for (const [name, prompt] of Object.entries(PROMPTS)) {
  const path = promptPath(name);
  process.stdout.write(`${name}: "${prompt.text_yo}" -> ${path}\n`);
  const { audio } = await synthesizeWithFallback(prompt.text_yo);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, audio);
}
console.log('done — commit nothing; prompts are deploy artifacts');
