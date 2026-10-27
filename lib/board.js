/**
 * Builds the public leaderboard from the "Pratikriti – Out House Referral Sheet".
 *
 * Tabs used (matched by header text, not position):
 *   REFERRALS  NAME · INSTITUITION · REFERRAL CODE (sheet totals are only a fallback)
 *   RAW_<EVENT> form responses: B name · <REFERRAL COL> code · <COUNT COL> photos
 *   DATA       EVENT · INSTITUTE · SUBMISSIONS     (one cleaned row per registration)
 *   EXCLUDE    column A: colleges left out of the institution ranking (host institution, "NA", …)
 *   SETTINGS   EVENT · REFERRAL COL · COUNT COL · SUBMISSIONS OPEN?
 *
 * Referrers: every registration made with their code counts, whoever used it.
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
export const normCode = (v) => text(v).toUpperCase().replace(/\s+/g, '');
/** Column letter from SETTINGS ("G") → 0-based index, or -1. */
export const colIndex = (letter) => {
  const s = norm(letter).replace(/[^A-Z]/g, '');
  if (!s) return -1;
  return [...s].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;
};

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

/**
 * Every use of a referral code in the RAW_<EVENT> tabs (column B = registrant name), as
 * code → { registrations, submissions, events: { KEY: registrations } }.
 * Null when no RAW_ tab can be read, so the caller can fall back to the sheet's totals.
 */
export function referralUses(tabs, events) {
  const usable = events.filter((e) => e.codeCol >= 0 && (tabs[`RAW_${e.key}`] || []).length);
  if (!usable.length) return null;
  const uses = new Map();
  for (const ev of usable) {
    for (const r of tabs[`RAW_${ev.key}`]) {
      const code = normCode(r && r[ev.codeCol]);
      if (!code || !text(r[1])) continue;
      const u = uses.get(code) || { registrations: 0, submissions: 0, events: {} };
      u.registrations += 1;
      if (ev.open) u.submissions += ev.countCol >= 0 ? num(r[ev.countCol]) : 1;
      u.events[ev.key] = (u.events[ev.key] || 0) + 1;
      uses.set(code, u);
    }
  }
  return uses;
}

/** @param {Record<string, any[][]>} tabs  tab name → rows */
export function buildBoard(tabs, now = new Date()) {
  const warnings = [];

  // ---- events + which have submissions open
  const settings = table(tabs.SETTINGS, 'EVENT');
  const events = [];
  if (settings) {
    const iOpen = settings.col('SUBMISSIONS OPEN');
    const iRef = settings.col('REFERRAL COL');
    const iCount = settings.col('COUNT COL');
    for (const r of settings.rows) {
      const name = norm(r[0]);
      if (!name || name.length > 24 || name.includes(' ')) break; // help notes start below the table
      events.push({
        key: name, name: titleEvent(name), open: iOpen >= 0 ? /^Y/.test(norm(r[iOpen])) : true, registrations: 0, submissions: 0,
        codeCol: iRef >= 0 ? colIndex(r[iRef]) : -1, countCol: iCount >= 0 ? colIndex(r[iCount]) : -1,
      });
    }
  }
  if (!events.length) {
    warnings.push('SETTINGS: no events found, using defaults');
    for (const n of ['CHITRANTAR', 'KSHANIKA', 'CHITRAGATI', 'RONGOLIPI']) events.push({ key: n, name: titleEvent(n), open: n === 'CHITRANTAR', registrations: 0, submissions: 0, codeCol: -1, countCol: -1 });
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

  // ---- REFERRALS: people. Counted from the form responses: every registration made with a rep's
  // code counts, whatever college (or none) the registrant gave. EXCLUDE only affects institutions.
  const uses = referralUses(tabs, events);
  const ref = table(tabs.REFERRALS, 'NAME');
  const referrers = [];
  if (ref) {
    const iName = ref.col('NAME');
    const iInst = ref.col('INSTITU');
    const iCode = ref.col('REFERRAL CODE');
    const iSub = ref.col('SUBMISSIONS');
    const iTotal = ref.col('REFERRALS TOTAL');
    if (uses && iCode < 0) warnings.push('REFERRALS: no REFERRAL CODE column, using the sheet totals');
    for (const r of ref.rows) {
      const name = prettyName(r[iName]);
      if (!name) continue;
      let submissions;
      let registrations;
      const perEvent = {};
      if (uses && iCode >= 0) {
        const u = uses.get(normCode(r[iCode])) || { submissions: 0, registrations: 0, events: {} };
        ({ submissions, registrations } = u);
        Object.assign(perEvent, u.events);
      } else {
        // form responses unavailable: fall back to the sheet's own totals
        submissions = num(r[iSub]);
        registrations = num(r[iTotal]);
        for (const ev of events) {
          const c = ref.col(ev.key);
          if (c >= 0 && num(r[c])) perEvent[ev.key] = num(r[c]);
        }
      }
      if (!submissions && !registrations) continue; // placeholder / not started yet
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
