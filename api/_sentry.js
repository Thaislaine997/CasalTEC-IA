// Lazy Sentry init — no-op quando SENTRY_DSN não está configurado.
let sentry = null;

function ensureInit() {
  if (sentry !== null) return;
  if (!process.env.SENTRY_DSN) { sentry = false; return; }
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 0.1
    });
    sentry = Sentry;
  } catch (e) {
    console.error('[sentry] init failed:', e.message);
    sentry = false;
  }
}

function captureException(err) {
  ensureInit();
  if (sentry) sentry.captureException(err);
}

async function flushSentry() {
  if (sentry) await sentry.flush(2000).catch(() => {});
}

/**
 * Wraps a Vercel serverless handler with top-level Sentry error capture.
 * Pass config as second arg to attach it to the exported function (stripe-webhook pattern).
 */
function wrap(handler, config) {
  const wrapped = async (req, res) => {
    ensureInit();
    try {
      return await handler(req, res);
    } catch (err) {
      captureException(err);
      await flushSentry();
      console.error('[unhandled]', err);
      if (!res.headersSent) res.status(500).json({ error: 'Erro interno do servidor' });
    }
  };
  if (config) wrapped.config = config;
  return wrapped;
}

module.exports = { wrap, captureException };
