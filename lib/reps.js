/**
 * Representative portal data. Everything here is served ONLY to the signed-in rep, and only for
 * registrations made with that rep's own referral code.
 *
 *   REFERRALS  NAME · INSTITUITION · REFERRAL CODE · PASSWORD · SUBMISSIONS · REFERRALS TOTAL
 *   SETTINGS   EVENT · REFERRAL COL · COUNT COL · SUBMISSIONS OPEN?   (column letters per RAW_ tab)
 *   RAW_<EVENT> rows: A timestamp · B name · C institution · D phone · <REFERRAL COL> code · <COUNT COL> photos
 *   ALIASES / EXCLUDE  decide whether a registration counts for referrals
 */
import { text, num, norm, table, titleEvent, prettyName, prettyInstitution } from './board.js';

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);
const GENRE_COLS = {
  CHITRANTAR: [8, 12, 14, 18, 20, 22], // genre of each photo, whichever path was taken
  KSHANIKA: [6],
  CHITRAGATI: [6],
};

export const normCode = (v) => text(v).toUpperCase().replace(/\s+/g, '');
const colIndex = (letter) => {
  const s = norm(letter).replace(/[^A-Z]/g, '');
  if (!s) return -1;
  return [...s].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;
};

/** A rep row (with password, server-side only) or null. */
export function findRep(tabs, code) {
  const ref = table(tabs.REFERRALS, 'NAME');
  if (!ref) return null;
  const iCode = ref.col('REFERRAL CODE');
  const iPw = ref.col('PASSWORD');
  const want = normCode(code);
  if (!want || iCode < 0) return null;
  for (const r of ref.rows) {
    if (normCode(r[iCode]) !== want) continue;
    return {
      code: want,
      name: prettyName(r[ref.col('NAME')]),
      institution: prettyInstitution(r[ref.col('INSTITU')]),
      password: iPw >= 0 ? text(r[iPw]) : '',
      submissions: num(r[ref.col('SUBMISSIONS')]),
      registrations: num(r[ref.col('REFERRALS TOTAL')]),
    };
  }
  return null;
}

function whenOf(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 20000) {
    return new Date(SERIAL_EPOCH + v * 86400000).toISOString().slice(0, 16); // already sheet-local time
  }
  const t = Date.parse(text(v));
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 16);
}

const phoneOf = (v) => text(v).replace(/[^\d+]/g, '').slice(0, 15);

/** Everything the welcome page needs for one rep. */
export function repDetails(tabs, rep, board) {
  // events + where each RAW_ tab keeps the code and the photo count
  const settings = table(tabs.SETTINGS, 'EVENT');
  const events = [];
  if (settings) {
    const iRef = settings.col('REFERRAL COL');
    const iCount = settings.col('COUNT COL');
    const iOpen = settings.col('SUBMISSIONS OPEN');
    for (const r of settings.rows) {
      const key = norm(r[0]);
      if (!key || key.length > 24 || key.includes(' ')) break;
      events.push({ key, name: titleEvent(key), codeCol: colIndex(r[iRef]), countCol: colIndex(r[iCount]), open: iOpen < 0 || /^Y/.test(norm(r[iOpen])) });
    }
  }

  // colleges that don't count for referrals (after alias clean-up)
  const aliases = new Map();
  for (const r of (tabs.ALIASES || []).slice(1)) if (norm(r && r[0]) && norm(r[1])) aliases.set(norm(r[0]), norm(r[1]));
  const excluded = new Set(['', 'NA', 'N/A', '-', 'NONE', 'NIL']);
  for (const r of (tabs.EXCLUDE || []).slice(1)) if (norm(r && r[0])) excluded.add(norm(r[0]));

  const people = [];
  const perEvent = events.map((e) => ({ key: e.key, name: e.name, open: e.open, registrations: 0, submissions: 0 }));
  events.forEach((ev, ei) => {
    if (ev.codeCol < 0) return;
    for (const r of tabs[`RAW_${ev.key}`] || []) {
      if (!r || normCode(r[ev.codeCol]) !== rep.code) continue;
      const name = prettyName(r[1]);
      if (!name) continue;
      const instKey = norm(r[2]);
      const counted = !excluded.has(aliases.get(instKey) || instKey);
      const photos = ev.countCol >= 0 ? num(r[ev.countCol]) : 1;
      const submissions = ev.open ? photos : 0;
      const genres = [...new Set((GENRE_COLS[ev.key] || []).map((c) => text(r[c])).filter(Boolean))]
        .map((g) => g.replace(/ Competition$/i, '').replace(/^Live Photography - /i, ''));
      people.push({
        event: ev.key,
        name,
        institution: prettyInstitution(r[2]),
        phone: phoneOf(r[3]),
        when: whenOf(r[0]),
        submissions,
        genre: genres.join(', ').slice(0, 80),
        counted,
      });
      if (counted) {
        perEvent[ei].registrations += 1;
        perEvent[ei].submissions += submissions;
      }
    }
  });
  people.sort((a, b) => (b.when > a.when ? 1 : b.when < a.when ? -1 : 0));

  const me = board.referrers.find((r) => r.name === rep.name && r.institution === rep.institution);
  return {
    name: rep.name,
    firstName: rep.name.split(' ')[0],
    institution: rep.institution,
    code: rep.code,
    submissions: rep.submissions,
    registrations: rep.registrations,
    rank: me ? me.rank : null,
    of: board.referrers.length,
    events: perEvent,
    people: people.slice(0, 2000),
    updated: new Date().toISOString(),
  };
}
