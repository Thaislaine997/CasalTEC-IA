// Sliding window rate limiter — Redis (Upstash) quando configurado, in-memory como fallback.
// Async: todos os callers devem usar `await rateLimit(...)`.
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// In-memory fallback
const store = new Map();
const MAX_STORE = 5000;

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
}

function memoryCheck(storeKey, limit, windowMs) {
  const now = Date.now();
  const timestamps = (store.get(storeKey) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= limit) {
    return { limited: true, retryAfter: Math.ceil((timestamps[0] + windowMs - now) / 1000), remaining: 0 };
  }
  timestamps.push(now);
  store.set(storeKey, timestamps);
  if (store.size > MAX_STORE) store.delete(store.keys().next().value);
  return { limited: false, remaining: limit - timestamps.length };
}

async function redisCheck(storeKey, limit, windowMs) {
  const now  = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const ttlSec = Math.ceil(windowMs / 1000);

  const pipeline = [
    ['ZADD',              storeKey, String(now), member],
    ['ZREMRANGEBYSCORE',  storeKey, '0', String(now - windowMs)],
    ['ZCARD',             storeKey],
    ['EXPIRE',            storeKey, String(ttlSec)]
  ];

  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pipeline)
  });

  const data = await res.json();
  const count = data[2]?.result ?? 0;
  return count > limit
    ? { limited: true, retryAfter: ttlSec, remaining: 0 }
    : { limited: false, remaining: limit - count };
}

/**
 * Returns true (and sends 429) if rate-limited; false if allowed.
 * Must be awaited by callers.
 */
module.exports = async function rateLimit(req, res, { limit = 10, windowMs = 60_000, key }) {
  const ip       = getIp(req);
  const storeKey = `rl:${key}:${ip}`;

  let result;
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      result = await redisCheck(storeKey, limit, windowMs);
    } catch (e) {
      console.error('[rateLimit] Redis fallback to memory:', e.message);
      result = memoryCheck(storeKey, limit, windowMs);
    }
  } else {
    result = memoryCheck(storeKey, limit, windowMs);
  }

  res.setHeader('X-RateLimit-Limit',     String(limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));

  if (result.limited) {
    if (result.retryAfter) res.setHeader('Retry-After', String(result.retryAfter));
    res.status(429).json({ error: 'Muitas requisições. Tente novamente em alguns segundos.' });
    return true;
  }
  return false;
};
