/**
 * Representative sessions.
 *
 * Cookie value: "<base64url(code)>.<expiry>.<HMAC>". The HMAC covers the code, the expiry and a
 * hash of the rep's CURRENT password, so changing a password in the sheet signs that rep out.
 * The key comes from SESSION_SECRET (falls back to a hash of the service-account key).
 * HttpOnly + SameSite=Strict, and __Host- prefixed on HTTPS.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE = 7 * 24 * 60 * 60;
const sha = (v) => createHash('sha256').update(String(v)).digest();
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url').toString('utf8');

function secret(env = process.env) {
  const s = env.SESSION_SECRET || env.GOOGLE_SERVICE_ACCOUNT_JSON || env.GOOGLE_PRIVATE_KEY || '';
  return sha(`rep-session|${s}`);
}
const sign = (code, exp, password) => createHmac('sha256', secret()).update(`${code}|${exp}|${sha(password).toString('hex')}`).digest('base64url');

/** Passwords are matched ignoring case and spaces (phone keyboards auto-capitalise). */
export const normPassword = (v) => String(v == null ? '' : v).replace(/\s+/g, '').toLowerCase();

/** Constant-time password compare (hash both sides so lengths match). */
export function passwordOk(input, real) {
  if (typeof input !== 'string' || !real || input.length > 200) return false;
  return timingSafeEqual(sha(normPassword(input)), sha(normPassword(real)));
}

export function issue(code, password, now = Date.now()) {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  return `${b64(code)}.${exp}.${sign(code, exp, password)}`;
}

/** Returns the code inside a structurally valid, unexpired token (signature checked later with the password). */
export function parse(token, now = Date.now()) {
  const m = typeof token === 'string' && token.match(/^([A-Za-z0-9_-]{1,80})\.(\d{10})\.([A-Za-z0-9_-]{43})$/);
  if (!m || Number(m[2]) < now / 1000) return null;
  return { code: unb64(m[1]), exp: m[2], sig: m[3] };
}

export function verify(parsed, password) {
  if (!parsed || !password) return false;
  const want = Buffer.from(sign(parsed.code, parsed.exp, password));
  const got = Buffer.from(parsed.sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ---- cookie helpers -------------------------------------------------------------------------
const secureFor = (request) => !/^(localhost|127\.0\.0\.1)$/.test(new URL(request.url).hostname);
const cookieName = (request) => (secureFor(request) ? '__Host-prk_rep' : 'prk_rep');

export function readSession(request) {
  const name = cookieName(request);
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
export const setCookie = (request, token) => `${cookieName(request)}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Strict${secureFor(request) ? '; Secure' : ''}`;
export const clearCookie = (request) => `${cookieName(request)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureFor(request) ? '; Secure' : ''}`;

// ---- brute-force protection -------------------------------------------------------------------
const WINDOW = 15 * 60 * 1000;
const byIp = new Map();
const byCode = new Map();
let global = { count: 0, reset: 0 };
const LIMITS = { ip: 8, code: 10, global: 120 };

function bump(map, key, now) {
  if (map.size > 5000) for (const [k, v] of map) if (v.reset < now) map.delete(k);
  const e = map.get(key);
  if (!e || e.reset < now) map.set(key, { count: 1, reset: now + WINDOW });
  else e.count += 1;
}
function over(map, key, max, now) {
  const e = map.get(key);
  return e && e.reset > now && e.count >= max ? Math.ceil((e.reset - now) / 1000) : 0;
}

/** Seconds until another attempt is allowed, or 0. */
export function lockedFor(ip, code, now = Date.now()) {
  if (global.reset > now && global.count >= LIMITS.global) return Math.ceil((global.reset - now) / 1000);
  return over(byIp, ip, LIMITS.ip, now) || over(byCode, code, LIMITS.code, now);
}
export function recordFailure(ip, code, now = Date.now()) {
  if (global.reset < now) global = { count: 0, reset: now + WINDOW };
  global.count += 1;
  bump(byIp, ip, now);
  if (code) bump(byCode, code, now);
}
export function clearFailures(ip, code) {
  byIp.delete(ip);
  byCode.delete(code);
}
