export const config = {
  port: Number(process.env.PORT || 8787),
  databaseUrl: process.env.DATABASE_URL || '',

  // spitch | stub        (stub maps fixture audio hashes to canned transcripts)
  asrProvider: process.env.ASR_PROVIDER || 'stub',
  // haiku | lexicon      (lexicon is the deterministic offline parser)
  intentProvider: process.env.INTENT_PROVIDER || 'lexicon',
  // spitch | yarngpt
  ttsProvider: process.env.TTS_PROVIDER || 'spitch',
  // local | supabase
  archiveDriver: process.env.ARCHIVE_DRIVER || 'local',

  spitchApiKey: process.env.SPITCH_API_KEY || '',
  spitchBaseUrl: process.env.SPITCH_BASE_URL || 'https://api.spi-tch.com',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  haikuModel: process.env.HAIKU_MODEL || 'claude-haiku-4-5-20251001',

  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  archiveBucket: process.env.ARCHIVE_BUCKET || 'voice-audio',
  archiveLocalDir: process.env.ARCHIVE_LOCAL_DIR || 'var/archive',

  // Where approved orders are POSTed. Empty = stub mode (logged, fake id).
  rundeyIntakeUrl: process.env.RUNDEY_INTAKE_URL || '',
  rundeyIntakeToken: process.env.RUNDEY_INTAKE_TOKEN || '',

  // Shared secret for the dispatcher dashboard.
  dispatcherToken: process.env.DISPATCHER_TOKEN || '',

  // Base URL this service is reachable at (for AT callback URLs + prompt audio).
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:8787',

  fixturesManifest: process.env.FIXTURES_MANIFEST || new URL('../fixtures/manifest.json', import.meta.url).pathname,
};
