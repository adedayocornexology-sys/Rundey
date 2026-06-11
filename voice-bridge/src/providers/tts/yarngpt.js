// YarnGPT fallback TTS. Placeholder client — YarnGPT is self-hosted; point
// YARNGPT_BASE_URL at the deployment when it exists. Until then this throws,
// which the fallback chain reports with the Spitch failure as `cause`.
export class YarnGptTTS {
  provider = 'yarngpt';

  async synthesize({ text, voice = 'idera' }) {
    const baseUrl = process.env.YARNGPT_BASE_URL;
    if (!baseUrl) throw new Error('YARNGPT_BASE_URL not configured');
    const res = await fetch(`${baseUrl}/v1/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voice, language: 'yo' }),
    });
    if (!res.ok) throw new Error(`YarnGPT TTS failed: HTTP ${res.status}`);
    return { audio: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
  }
}
