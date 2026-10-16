/**
 * GET /api/board — public leaderboard for the Pratikriti out-house referral drive.
 *
 *  - Reads the Restricted referral sheet as a Google service account (env vars only).
 *  - Responds with names, institutions and counts only: no phone numbers, emails or codes.
 *  - Cached for 60 s in the function and on Vercel's CDN; per-IP rate limit; the last good
 *    copy is served if Google is unreachable.
 */
import { credentials, sheetId, readRanges } from '../lib/sheets.js';
import { buildBoard, TABS, RANGES } from '../lib/board.js';

const CACHE_TTL_MS = 60_000;
const LIMIT = { max: 120, windowMs: 60_000 };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

let lastGood = { body: null, at: 0 };
let inflight = null;
const hits = new Map();

export async function GET(request) {
  if (!allow(clientIp(request))) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });

  let creds = null;
  try { creds = credentials(); } catch { creds = null; }
  const id = sheetId(process.env.REFERRAL_SHEET);
  if (!creds || !id) return json({ error: 'not_configured' }, 503);

  if (lastGood.body && Date.now() - lastGood.at < CACHE_TTL_MS) return respond(lastGood.body, 'HIT');
  try {
    inflight ??= load(creds, id).finally(() => (inflight = null));
    const body = await inflight;
    lastGood = { body, at: Date.now() };
    return respond(body, 'MISS');
  } catch (err) {
    console.error('board failed:', err && err.message);
    if (lastGood.body) return respond(lastGood.body, 'STALE');
    return json({ error: 'upstream_unavailable' }, 502, { 'Retry-After': '30' });
  }
}

async function load(creds, id) {
  const values = await readRanges(creds, id, RANGES);
  const tabs = Object.fromEntries(TABS.map((t, i) => [t, values[i] || []]));
  const board = buildBoard(tabs);
  for (const w of board.warnings) console.warn('sheet:', w);
  delete board.warnings; // details stay in the logs
  return JSON.stringify(board);
}

function clientIp(request) {
  const h = request.headers;
  return (h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();
}

function allow(ip) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const e = hits.get(ip);
  if (!e || e.reset < now) { hits.set(ip, { count: 1, reset: now + LIMIT.windowMs }); return true; }
  e.count += 1;
  return e.count <= LIMIT.max;
}

function respond(body, status) {
  return new Response(body, {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=30',
      'CDN-Cache-Control': status === 'STALE' ? 'public, s-maxage=15' : 'public, s-maxage=60, stale-while-revalidate=600',
      'X-Data-Cache': status,
    },
  });
}

function json(obj, status, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
