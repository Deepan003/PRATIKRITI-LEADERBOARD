/**
 * GET /api/me — the signed-in representative's own referral details.
 * Private: requires the session cookie; never cached by the CDN.
 */
import { loadTabs, NotConfigured, json, clientIp, allow } from '../lib/store.js';
import { buildBoard } from '../lib/board.js';
import { findRep, repDetails } from '../lib/reps.js';
import { readSession, parse, verify, clearCookie } from '../lib/session.js';

const PRIVATE = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request) {
  if (!allow(clientIp(request), 60)) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  const parsed = parse(readSession(request));
  if (!parsed) return json({ error: 'unauthorized' }, 401, PRIVATE);
  try {
    const { tabs } = await loadTabs();
    const rep = findRep(tabs, parsed.code);
    if (!rep || !verify(parsed, rep.password)) {
      return json({ error: 'unauthorized' }, 401, { ...PRIVATE, 'Set-Cookie': clearCookie(request) });
    }
    return json(repDetails(tabs, rep, buildBoard(tabs)), 200, PRIVATE);
  } catch (err) {
    if (err instanceof NotConfigured) return json({ error: 'not_configured' }, 503);
    return json({ error: 'upstream_unavailable' }, 502, { 'Retry-After': '30' });
  }
}
