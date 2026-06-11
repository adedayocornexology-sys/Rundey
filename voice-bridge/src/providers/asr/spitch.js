// Spitch Yoruba ASR. UNTESTED until SPITCH_API_KEY is provisioned (§7 open
// item) — verify the endpoint/payload against current Spitch docs on first
// real call. Kept behind the ASRProvider interface so YarnGPT or a Whisper
// fine-tune can replace it without touching the pipeline.
import { config } from '../../config.js';
import { AsrError } from './index.js';

export class SpitchASR {
  provider = 'spitch';

  async transcribe({ audio, mimeType = 'audio/wav' }) {
    if (!config.spitchApiKey) {
      throw new AsrError('SPITCH_API_KEY not configured', { provider: this.provider });
    }
    const form = new FormData();
    form.append('language', 'yo');
    form.append('content', new Blob([audio], { type: mimeType }), 'audio.wav');

    const res = await fetch(`${config.spitchBaseUrl}/v1/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.spitchApiKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new AsrError(`Spitch ASR failed: HTTP ${res.status}`, {
        status: res.status, provider: this.provider,
      });
    }
    const data = await res.json();
    return {
      transcript: (data.text ?? '').trim(),
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
      provider: this.provider,
    };
  }
}
