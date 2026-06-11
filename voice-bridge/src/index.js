import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { config } from './config.js';
import { webhooks } from './routes/webhooks.js';
import { dispatcher } from './routes/dispatcher.js';
import { promptAudio, PROMPTS } from './providers/tts/prompts.js';

export function createApp() {
  const app = new Hono({ strict: false }); // /dispatcher and /dispatcher/ both match

  app.get('/health', (c) => c.json({ ok: true, service: 'rundey-voice-bridge' }));

  // Cached static Yoruba prompts (pre-generated MP3s, never synthesized per call).
  app.get('/prompts/:name{[a-z]+\\.mp3}', (c) => {
    const name = c.req.param('name').replace(/\.mp3$/, '');
    if (!PROMPTS[name]) return c.json({ error: 'unknown prompt' }, 404);
    const audio = promptAudio(name);
    if (!audio) {
      return c.json({ error: `prompt '${name}' not generated yet — run scripts/generate-prompts.js` }, 503);
    }
    c.header('content-type', 'audio/mpeg');
    c.header('cache-control', 'public, max-age=86400');
    return c.body(audio);
  });

  app.route('/webhooks', webhooks);
  app.route('/dispatcher', dispatcher);

  app.onError((err, c) => {
    console.error('[unhandled]', err);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  serve({ fetch: app.fetch, port: config.port });
  console.log(`rundey-voice-bridge listening on :${config.port}`);
}
