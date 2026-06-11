// Static Yoruba prompts, pre-generated as MP3s and served from disk.
// Run scripts/generate-prompts.js (needs SPITCH_API_KEY) to (re)build them.
import { existsSync, readFileSync } from 'node:fs';

export const PROMPTS = {
  greeting: {
    file: 'greeting.mp3',
    text_yo: 'Ẹ káàbọ̀ sí RUNDEY. Ẹ sọ ohun tí ẹ fẹ́ rà.',
    text_en: 'Welcome to RUNDEY. Say what you would like to buy.',
  },
  closing: {
    file: 'closing.mp3',
    text_yo: 'A ti gbọ́. A ó pè yín padà láìpẹ́.',
    text_en: 'We heard you. We will call you back shortly.',
  },
  // §7 open item: wording needs legal + cultural review before launch.
  consent: {
    file: 'consent.mp3',
    text_yo: 'À ń gbà ohùn yín sílẹ̀ kí iṣẹ́ wa lè dára sí i.',
    text_en: 'We record your voice so that our service can improve. [DRAFT — pending review]',
  },
};

const promptsDir = new URL('../../../assets/prompts/', import.meta.url);

export function promptPath(name) {
  const p = PROMPTS[name];
  if (!p) throw new Error(`Unknown prompt: ${name}`);
  return new URL(p.file, promptsDir).pathname;
}

export function promptAudio(name) {
  const path = promptPath(name);
  if (!existsSync(path)) return null; // not generated yet (no Spitch key)
  return readFileSync(path);
}
