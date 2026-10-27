/**
 * Shared sheet loader. One batchGet reads every tab the site needs; the result is cached for
 * 60 s per function instance, concurrent requests share one read, and the last good copy is
 * reused if Google is unreachable. Raw rows never leave the server.
 */
import { credentials, sheetId, readRanges } from './sheets.js';

export const TABS = ['REFERRALS', 'DATA', 'EXCLUDE', 'SETTINGS', 'ALIASES', 'RAW_CHITRANTAR', 'RAW_KSHANIKA', 'RAW_CHITRAGATI', 'RAW_RONGOLIPI'];
const RANGES = TABS.map((t) => `'${t}'!A1:AB5000`);
const CACHE_TTL_MS = 60_000;

let last = { tabs: null, at: 0 };
let inflight = null;

export class NotConfigured extends Error {}

/** @returns {Promise<{ tabs: Record<string, any[][]>, cache: 'HIT'|'MISS'|'STALE' }>} */
export async function loadTabs({ fresh = false } = {}) {
  let creds = null;
  try { creds = credentials(); } catch { creds = null; }
  const id = sheetId(process.env.REFERRAL_SHEET);
  if (!creds || !id) throw new NotConfigured('sheet not configured');

  if (!fresh && last.tabs && Date.now() - last.at < CACHE_TTL_MS) return { tabs: last.tabs, cache: 'HIT' };
  try {
    inflight ??= read(creds, id).finally(() => (inflight = null));
    const tabs = await inflight;
    last = { tabs, at: Date.now() };
    return { tabs, cache: 'MISS' };
  } catch (err) {
    console.error('sheet read failed:', err && err.message);
    if (last.tabs) return { tabs: last.tabs, cache: 'STALE' };
    throw err;
  }
}

async function read(creds, id) {
  const values = await readRanges(creds, id, RANGES);
  return Object.fromEntries(TABS.map((t, i) => [t, values[i] || []]));
}

// ---- shared response helpers ------------------------------------------------------------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

export function json(obj, status = 200, extra = {}) {
  return new Response(obj == null ? null : JSON.stringify(obj), {
    status,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

export function clientIp(request) {
  const h = request.headers;
  return (h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();
}

const hits = new Map();
/** Per-IP request limit (per function instance). */
export function allow(ip, max = 120, windowMs = 60_000) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const e = hits.get(ip);
  if (!e || e.reset < now) { hits.set(ip, { count: 1, reset: now + windowMs }); return true; }
  e.count += 1;
  return e.count <= max;
}
