// TTSProvider interface:
//   async synthesize({ text, voice? }) -> { audio: Buffer, mimeType: string }
//
// Static prompts (greeting/closing) are NEVER synthesized per call — they are
// pre-generated into assets/prompts/ by scripts/generate-prompts.js and
// served from disk (see prompts.js).

import { config } from '../../config.js';
import { SpitchTTS } from './spitch.js';
import { YarnGptTTS } from './yarngpt.js';

export function createTTS(name = config.ttsProvider) {
  switch (name) {
    case 'spitch': return new SpitchTTS();
    case 'yarngpt': return new YarnGptTTS();
    default: throw new Error(`Unknown TTS provider: ${name}`);
  }
}

// Spitch primary, YarnGPT fallback.
export async function synthesizeWithFallback(text) {
  try {
    return await createTTS('spitch').synthesize({ text });
  } catch (primaryErr) {
    try {
      return await createTTS('yarngpt').synthesize({ text });
    } catch (fallbackErr) {
      fallbackErr.cause = primaryErr;
      throw fallbackErr;
    }
  }
}
