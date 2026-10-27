/**
 * Builds the public leaderboard from the "Pratikriti – Out House Referral Sheet".
 *
 * Tabs used (matched by header text, not position):
 *   REFERRALS  NAME · INSTITUITION · SUBMISSIONS · REFERRALS TOTAL · one column per event
 *   DATA       EVENT · INSTITUTE · SUBMISSIONS     (one cleaned row per registration)
 *   EXCLUDE    column A: colleges that don't count for referrals (host institution, "NA", …)
 *   SETTINGS   EVENT · SUBMISSIONS OPEN?
 *
 * Only names, institutions and counts leave this module. Mobile numbers and referral codes are
 * never read into the output (codes end in phone digits, so they stay private too).
 */

export const TABS = ['REFERRALS', 'DATA', 'EXCLUDE', 'SETTINGS'];
export const RANGES = TABS.map((t) => `'${t}'!A1:Z3000`);

export const text = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());
export const num = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0;
};
export const norm = (v) => text(v).toUpperCase().replace(/[.,]+$/g, '');

const ACRONYMS = new Set(['IEM', 'UEM', 'FIEM', 'IIT', 'NIT', 'IIIT', 'BIT', 'SRM', 'KIIT', 'JIS', 'MAKAUT', 'IISER', 'IIEST', 'MCKV', 'RCC', 'BPPIMT', 'NSEC', 'NSHM', 'MSIT', 'GNIT', 'HITK', 'TIU', 'SPA', 'VIT', 'BHU', 'JU', 'CU', 'DU']);
const SMALL = new Set(['of', 'and', 'for', 'the', 'in', 'at', '&']);

/** "SCHOOL OF PLANNING AND ARCHITECTURE, DELHI" → "School of Planning and Architecture, Delhi"; keeps IEM, B.C. etc. */
export function prettyInstitution(raw) {
  const s = text(raw);
  if (!s) return '';
  const shouting = s === s.toUpperCase() || s === s.toLowerCase();
  if (!shouting) return s.slice(0, 80);
  return s.split(' ').map((w, i) => {
    const bare = w.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (ACRONYMS.has(bare) || /^([A-Z]\.){1,4}[A-Z]?\.?$/i.test(w)) return w.toUpperCase();
    const lower = w.toLowerCase();
    if (i > 0 && SMALL.has(lower)) return lower;
    return lower.replace(/(^|[-(])([a-z])/g, (m, a, c) => a + c.toUpperCase());
  }).join(' ').slice(0, 80);
}

/** "ATANU JANA" / "subhadeep panda" → "Atanu Jana" / "Subhadeep Panda"; mixed case is kept. */
export function prettyName(raw) {
  const s = text(raw);
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s.slice(0, 60);
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, c) => a + c.toUpperCase()).slice(0, 60);
}

export const titleEvent = (s) => text(s).toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** First row containing a cell equal to `must` is the header row. */
export function table(rows, must) {
  const at = (rows || []).findIndex((r) => (r || []).some((c) => norm(c) === must));
  if (at < 0) return null;
  const headers = rows[at].map(norm);
  return { rows: rows.slice(at + 1), col: (name) => headers.findIndex((h) => h === name || h.startsWith(name)) };
}

/** @param {Record<string, any[][]>} tabs  tab name → rows */
export function buildBoard(tabs, now = new Date()) {
  const warnings = [];

  // ---- events + which have submissions open
  const settings = table(tabs.SETTINGS, 'EVENT');
  const events = [];
  if (settings) {
    const iOpen = settings.col('SUBMISSIONS OPEN');
    for (const r of settings.rows) {
      const name = norm(r[0]);
      if (!name || name.length > 24 || name.includes(' ')) break; // help notes start below the table
      events.push({ key: name, name: titleEvent(name), open: iOpen >= 0 ? /^Y/.test(norm(r[iOpen])) : true, registrations: 0, submissions: 0 });
    }
  }
  if (!events.length) {
    warnings.push('SETTINGS: no events found, using defaults');
    for (const n of ['CHITRANTAR', 'KSHANIKA', 'CHITRAGATI', 'RONGOLIPI']) events.push({ key: n, name: titleEvent(n), open: n === 'CHITRANTAR', registrations: 0, submissions: 0 });
  }
  const eventByKey = new Map(events.map((e) => [e.key, e]));

  // ---- excluded colleges
  const excluded = new Set(['', 'NA', 'N/A', '-', 'NONE', 'NIL']);
  for (const r of (tabs.EXCLUDE || []).slice(1)) {
    const v = norm(r && r[0]);
    if (v && v.length < 120) excluded.add(v);
  }

  // ---- DATA: per event + per institution
  const data = table(tabs.DATA, 'EVENT');
  const institutions = new Map();
  if (data) {
    const iEv = data.col('EVENT');
    const iInst = data.col('INSTITUTE');
    const iSub = data.col('SUBMISSIONS');
    for (const r of data.rows) {
      const ev = eventByKey.get(norm(r[iEv]));
      if (!ev) continue;
      const subs = num(r[iSub]);
      ev.registrations += 1;
      ev.submissions += subs;
      const inst = norm(r[iInst]);
      if (excluded.has(inst)) continue;
      const it = institutions.get(inst) || { name: prettyInstitution(inst), submissions: 0, registrations: 0, events: {} };
      it.submissions += subs;
      it.registrations += 1;
      it.events[ev.key] = (it.events[ev.key] || 0) + (ev.open ? subs : 1);
      institutions.set(inst, it);
    }
  } else {
    warnings.push('DATA tab not found');
  }

  // ---- REFERRALS: people
  const ref = table(tabs.REFERRALS, 'NAME');
  const referrers = [];
  if (ref) {
    const iName = ref.col('NAME');
    const iInst = ref.col('INSTITU');
    const iSub = ref.col('SUBMISSIONS');
    const iTotal = ref.col('REFERRALS TOTAL');
    for (const r of ref.rows) {
      const name = prettyName(r[iName]);
      if (!name) continue;
      const submissions = num(r[iSub]);
      const registrations = num(r[iTotal]);
      if (!submissions && !registrations) continue; // placeholder / not started yet
      const perEvent = {};
      for (const ev of events) {
        const c = ref.col(ev.key);
        if (c >= 0 && num(r[c])) perEvent[ev.key] = num(r[c]);
      }
      referrers.push({ name, institution: prettyInstitution(r[iInst]), submissions, registrations, events: perEvent });
    }
  } else {
    warnings.push('REFERRALS tab not found');
  }

  // ---- ranking: submissions first, registrations break ties, then name
  const rank = (list) => {
    list.sort((a, b) => b.submissions - a.submissions || b.registrations - a.registrations || a.name.localeCompare(b.name));
    let prev = null;
    list.forEach((x, i) => {
      x.rank = prev && prev.submissions === x.submissions && prev.registrations === x.registrations ? prev.rank : i + 1;
      prev = x;
    });
    return list;
  };

  const inst = rank([...institutions.values()]).slice(0, 100);
  const people = rank(referrers).slice(0, 100);
  return {
    updated: now.toISOString(),
    totals: {
      submissions: events.reduce((a, e) => a + e.submissions, 0),
      registrations: events.reduce((a, e) => a + e.registrations, 0),
      institutions: inst.length,
      referrers: people.length,
    },
    institutions: inst,
    referrers: people,
    events: events.map(({ key, name, open, registrations, submissions }) => ({ key, name, open, registrations, submissions })),
    warnings,
  };
}
