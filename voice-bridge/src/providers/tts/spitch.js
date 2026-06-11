// Spitch Yoruba TTS. UNTESTED until SPITCH_API_KEY is provisioned (§7 open
// item) — verify endpoint/voice names against current Spitch docs.
import { config } from '../../config.js';

export class SpitchTTS {
  provider = 'spitch';

  async synthesize({ text, voice = 'sade' }) {
    if (!config.spitchApiKey) throw new Error('SPITCH_API_KEY not configured');
    const res = await fetch(`${config.spitchBaseUrl}/v1/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.spitchApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ language: 'yo', text, voice }),
    });
    if (!res.ok) throw new Error(`Spitch TTS failed: HTTP ${res.status}`);
    return { audio: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
  }
}
