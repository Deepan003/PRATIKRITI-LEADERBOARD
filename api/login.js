/**
 * POST /api/login   { "code": "IEM-ABC1234", "password": "…" } → 204 + session cookie
 *                   401 wrong code/password · 403 no password set yet · 429 locked out
 * DELETE /api/login → 204, signed out
 */
import { loadTabs, NotConfigured, json, clientIp } from '../lib/store.js';
import { findRep, normCode } from '../lib/reps.js';
import { passwordOk, issue, setCookie, clearCookie, lockedFor, recordFailure, clearFailures } from '../lib/session.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return json({ error: 'too_large' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const code = normCode(body && body.code).slice(0, 40);
  const password = typeof body?.password === 'string' ? body.password : '';
  const ip = clientIp(request);

  const wait = lockedFor(ip, code);
  if (wait) return json({ error: 'locked', retryAfter: wait }, 429, { 'Retry-After': String(wait) });
  if (!code || !password) return json({ error: 'missing' }, 400);

  let rep;
  try {
    // fresh read so a just-generated password works straight away
    rep = findRep((await loadTabs({ fresh: true })).tabs, code);
  } catch (err) {
    if (err instanceof NotConfigured) return json({ error: 'not_configured' }, 503);
    return json({ error: 'upstream_unavailable' }, 502);
  }

  if (rep && !rep.password) return json({ error: 'no_password' }, 403);
  if (!rep || !passwordOk(password, rep.password)) {
    recordFailure(ip, code);
    await sleep(400 + Math.random() * 300); // same delay whether the code exists or not
    return json({ error: 'invalid' }, 401);
  }
  clearFailures(ip, code);
  return json(null, 204, { 'Set-Cookie': setCookie(request, issue(rep.code, rep.password)) });
}

export async function DELETE(request) {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  return json(null, 204, { 'Set-Cookie': clearCookie(request) });
}
