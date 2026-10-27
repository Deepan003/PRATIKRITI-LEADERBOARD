/**
 * GET /api/board — public leaderboard for the Pratikriti out-house referral drive.
 *
 *  - Names, institutions and counts only: no phone numbers, emails, codes or passwords.
 *  - Sheet read via the shared, cached loader; 60 s CDN cache; per-IP rate limit.
 */
import { loadTabs, NotConfigured, json, clientIp, allow } from '../lib/store.js';
import { buildBoard } from '../lib/board.js';

export async function GET(request) {
  if (!allow(clientIp(request))) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  try {
    const { tabs, cache } = await loadTabs();
    const board = buildBoard(tabs);
    for (const w of board.warnings) console.warn('sheet:', w);
    delete board.warnings;
    return json(board, 200, {
      'Cache-Control': 'public, max-age=30',
      'CDN-Cache-Control': cache === 'STALE' ? 'public, s-maxage=15' : 'public, s-maxage=60, stale-while-revalidate=600',
      'X-Data-Cache': cache,
    });
  } catch (err) {
    if (err instanceof NotConfigured) return json({ error: 'not_configured' }, 503);
    return json({ error: 'upstream_unavailable' }, 502, { 'Retry-After': '30' });
  }
}
