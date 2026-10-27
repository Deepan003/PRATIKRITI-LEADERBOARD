/* Pratikriti · Institutional Referral Counter — client.
 * No frameworks, no third-party scripts. All data goes in as text nodes, never innerHTML. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf = new Intl.NumberFormat('en-IN');
  const plural = (n, one, many) => (n === 1 ? one : many || `${one}s`);
  const POLL_MS = 60_000;

  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }
  const b = (t) => h('b', null, t);

  const el = {
    bar: $('#bar'), live: $('#live'), liveLabel: $('#liveLabel'),
    tSubs: $('#tSubs'), tInst: $('#tInst'), tRefs: $('#tRefs'),
    champ: $('#champ'), champName: $('#champName'), champCount: $('#champCount'), champLead: $('#champLead'),
    podium: $('#podium'), refList: $('#refList'), instList: $('#instList'), instMore: $('#instMore'),
    events: $('#events'), error: $('#error'),
  };
  const S = { data: null, sig: '', timer: 0, failures: 0, pending: false, showAllInst: false };

  // ---------------------------------------------------------------- motion helpers
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
  const reveal = (n, delay = 0) => {
    n.style.setProperty('--d', `${delay}ms`);
    if (calm()) { n.classList.add('is-in'); return; }
    io.observe(n);
    // already on screen: reveal on the next frame instead of waiting for the observer
    requestAnimationFrame(() => {
      const r = n.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) { n.classList.add('is-in'); io.unobserve(n); }
    });
  };
  // safety net: never leave content hidden if the observer is unavailable or late
  setTimeout(() => $$('[data-reveal]:not(.is-in), .pod:not(.is-in), .champ:not(.is-in)').forEach((n) => {
    const r = n.getBoundingClientRect();
    if (r.top < innerHeight * 1.5) n.classList.add('is-in');
  }), 3000);

  /** Scoreboard digits that roll into place. */
  function roll(node, value) {
    const text = nf.format(value);
    if (calm()) { node.textContent = text; node._cols = null; return; }
    let cols = node._cols;
    if (!cols || node._len !== text.length) {
      node.textContent = '';
      node._sr = h('span', { class: 'sr' });
      node.append(node._sr);
      cols = [...text].map((ch) => {
        if (!/\d/.test(ch)) { node.append(h('span', { class: 'sep', 'aria-hidden': 'true' }, ch)); return null; }
        const strip = h('span', { class: 'strip' }, [...'0123456789'].map((d) => h('span', null, d)));
        node.append(h('span', { class: 'digit', 'aria-hidden': 'true' }, strip));
        return strip;
      });
      node._cols = cols;
      node._len = text.length;
      void node.offsetWidth;
    }
    node._sr.textContent = text;
    [...text].forEach((ch, i) => {
      if (!cols[i]) return;
      cols[i].style.transitionDelay = `${(text.length - 1 - i) * 70}ms`;
      cols[i].style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
  }

  // ---------------------------------------------------------------- data
  async function sync() {
    clearTimeout(S.timer);
    try {
      const res = await fetch('/api/board', { headers: { Accept: 'application/json' }, credentials: 'omit', signal: AbortSignal.timeout(15000) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || !Array.isArray(body.institutions)) throw Object.assign(new Error('bad'), { code: body && body.error });
      S.failures = 0;
      el.error.hidden = true;
      el.live.classList.remove('is-stale');
      el.liveLabel.textContent = 'Live';
      apply(body);
      S.timer = setTimeout(tick, POLL_MS + Math.random() * 8000);
    } catch (err) {
      S.failures += 1;
      el.live.classList.add('is-stale');
      el.liveLabel.textContent = 'Offline';
      if (!S.data) {
        el.error.textContent = err.code === 'not_configured' ? 'The leaderboard is being set up. Check back soon.' : "Can't load the leaderboard right now. Retrying…";
        el.error.hidden = false;
      }
      S.timer = setTimeout(tick, Math.min(15000 * 2 ** (S.failures - 1), 180000));
    } finally {
      document.body.classList.remove('is-loading');
    }
  }
  function tick() {
    if (document.hidden) S.pending = true;
    else sync();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.pending) { S.pending = false; sync(); } });

  function apply(data) {
    const sig = JSON.stringify([data.totals, data.institutions, data.referrers, data.events]);
    if (sig === S.sig) return;
    const first = !S.sig;
    S.sig = sig;
    S.data = data;
    roll(el.tSubs, data.totals.submissions);
    roll(el.tInst, data.totals.institutions);
    roll(el.tRefs, data.totals.referrers);
    renderChamp(first);
    renderPodium();
    renderInstitutions();
    renderEvents();
  }

  // ---------------------------------------------------------------- leading institution
  function renderChamp(first) {
    const [top, second] = S.data.institutions;
    const lead = top && top.submissions > 0 ? top : null;
    el.champ.classList.toggle('is-empty', !lead);
    const label = lead ? lead.name : 'Open race';
    if (el.champName.dataset.name !== label) {
      el.champName.dataset.name = label;
      el.champName.setAttribute('aria-label', label);
      // letter-by-letter reveal, grouped per word so names wrap cleanly
      let i = 0;
      el.champName.replaceChildren(...label.split(' ').flatMap((word, wi) => {
        const w = h('span', { 'aria-hidden': 'true' }, [...word].map((c) => {
          const ch = h('span', { class: 'ch' }, c);
          ch.style.setProperty('--i', String(i++));
          return ch;
        }));
        w.style.whiteSpace = 'nowrap';
        return wi ? [' ', w] : [w];
      }));
      if (!first) { el.champ.classList.remove('is-in'); void el.champ.offsetWidth; }
      if (calm() || !first) el.champ.classList.add('is-in'); else reveal(el.champ);
    }
    roll(el.champCount, lead ? lead.submissions : 0);
    if (!lead) el.champLead.textContent = 'The first submission takes the lead.';
    else if (second && second.submissions === lead.submissions) el.champLead.replaceChildren('Tied with ', b(second.name));
    else if (second) el.champLead.replaceChildren(b(`${lead.submissions - second.submissions} ahead`), ` of ${second.name}`);
    else el.champLead.textContent = 'The only institution on the board so far.';
  }

  // ---------------------------------------------------------------- referrers
  function renderPodium() {
    const refs = S.data.referrers;
    if (!refs.length) {
      el.podium.replaceChildren(h('div', { class: 'pod-empty' }, b('Leaderboard opens soon'), 'The first referred submission puts a name here.'));
      el.refList.replaceChildren();
      return;
    }
    const pods = refs.slice(0, 3).map((r, i) => {
      const rank = i + 1;
      return h('article', { class: 'pod', 'data-rank': rank, 'aria-label': `${rank}. ${r.name}, ${r.institution}: ${r.submissions} ${plural(r.submissions, 'submission')}` },
        h('div', { class: 'pod-top' },
          h('span', { class: 'medal', 'aria-hidden': 'true' }, rank),
          h('span', { class: 'pod-num', 'aria-hidden': 'true' }, b(nf.format(r.submissions)), h('small', null, plural(r.submissions, 'submission')))),
        h('p', { class: 'pod-name', 'aria-hidden': 'true' }, r.name),
        h('p', { class: 'pod-inst', 'aria-hidden': 'true' }, r.institution || '—'));
    });
    el.podium.replaceChildren(...pods);
    pods.forEach((p, i) => reveal(p, i === 0 ? 0 : 120 + i * 90));

    const max = Math.max(1, refs[0].submissions);
    el.refList.replaceChildren(...refs.slice(3, 20).map((r, i) => row(r.rank, r.name, r.institution, r.submissions, max, i)));
  }

  // ---------------------------------------------------------------- institutions
  function renderInstitutions() {
    const all = S.data.institutions;
    const list = all.slice(1); // #1 is the hero card above
    const shown = S.showAllInst ? list : list.slice(0, 7);
    const max = Math.max(1, all[0] ? all[0].submissions : 1);
    el.instList.replaceChildren(...shown.map((x, i) => row(x.rank, x.name, eventLine(x), x.submissions, max, i)));
    if (!list.length) el.instList.replaceChildren(h('li', { class: 'pod-empty' }, 'More institutions appear as entries come in.'));
    el.instMore.hidden = list.length <= 7;
    el.instMore.textContent = S.showAllInst ? 'Show less' : `Show all ${all.length}`;
  }
  el.instMore.addEventListener('click', () => { S.showAllInst = !S.showAllInst; renderInstitutions(); });

  function eventLine(x) {
    return S.data.events.filter((e) => x.events[e.key]).map((e) => `${e.name} ${x.events[e.key]}`).join(' · ')
      || `${x.registrations} ${plural(x.registrations, 'entry', 'entries')}`;
  }

  function row(rank, title, sub, value, max, i) {
    const li = h('li', { class: `row${value ? '' : ' is-zero'}`, 'data-reveal': true },
      h('span', { class: 'rk' }, String(rank).padStart(2, '0')),
      h('span', { class: 'who' }, b(title), h('span', null, sub || '')),
      h('span', { class: 'score' }, b(nf.format(value)), h('small', null, plural(value, 'sub'))));
    li.style.setProperty('--w', (value / max).toFixed(3));
    reveal(li, Math.min(i * 50, 400));
    return li;
  }

  // ---------------------------------------------------------------- events
  function renderEvents() {
    el.events.replaceChildren(...S.data.events.map((e, i) => {
      const card = h('div', { class: `ev${e.open ? ' is-open' : ''}`, 'data-reveal': true },
        h('p', { class: 'ev-name' }, e.name),
        h('span', { class: 'ev-state' }, e.open ? h('i', { 'aria-hidden': 'true' }) : null, e.open ? 'Submissions open' : 'Opens soon'),
        h('p', { class: 'ev-num' }, nf.format(e.open ? e.submissions : e.registrations)),
        h('p', { class: 'ev-unit' }, e.open ? plural(e.submissions, 'submission') : plural(e.registrations, 'registration')));
      reveal(card, i * 70);
      return card;
    }));
  }

  // ---------------------------------------------------------------- tabs
  const tabs = $('#tabs');
  const tabOrder = ['colleges', 'referrers'];
  function setTab(name, { push = true, focus = false } = {}) {
    if (!tabOrder.includes(name)) name = 'colleges';
    const prev = tabs.dataset.tab || 'colleges';
    tabs.dataset.tab = name;
    for (const id of tabOrder) {
      const btn = $(`#tab-${id}`);
      const panel = $(`#panel-${id}`);
      const on = id === name;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      if (on && panel.hidden) {
        panel.hidden = false;
        panel.classList.toggle('from-left', tabOrder.indexOf(name) < tabOrder.indexOf(prev));
        panel.style.animation = 'none';
        void panel.offsetWidth;
        panel.style.animation = '';
        // content that was hidden: reveal what is now on screen
        requestAnimationFrame(() => $$('[data-reveal], .pod, .champ', panel).forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.top < innerHeight && r.bottom > 0) n.classList.add('is-in');
        }));
      } else if (!on) {
        panel.hidden = true;
      }
      if (on && focus) btn.focus();
    }
    if (push) history.replaceState(null, '', name === 'colleges' ? location.pathname : `#${name}`);
    const top = tabs.getBoundingClientRect().top;
    if (push && top < 60) scrollTo({ top: scrollY + top - 70, behavior: calm() ? 'auto' : 'smooth' });
    if (push) { try { navigator.vibrate?.(8); } catch { /* unsupported */ } }
  }
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn && btn.getAttribute('aria-selected') !== 'true') setTab(btn.dataset.tab);
  });
  tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = tabOrder.indexOf(tabs.dataset.tab || 'colleges');
    setTab(tabOrder[(i + (e.key === 'ArrowRight' ? 1 : tabOrder.length - 1)) % tabOrder.length], { focus: true });
  });
  // swipe sideways on the leaderboards to switch tabs
  const panels = $('#panels');
  let sx = null;
  let sy = 0;
  panels.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } }, { passive: true });
  panels.addEventListener('pointercancel', () => { sx = null; });
  panels.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > 50) return;
    const next = dx < 0 ? 'referrers' : 'colleges';
    if (next !== (tabs.dataset.tab || 'colleges')) setTab(next);
  });
  setTab(location.hash === '#referrers' ? 'referrers' : 'colleges', { push: false });

  // ---------------------------------------------------------------- representative portal
  const R = {
    btn: $('#repBtn'), btnLabel: $('#repBtnLabel'),
    sheet: $('#loginSheet'), form: $('#loginForm'), code: $('#repCode'), pw: $('#repPw'), eye: $('#repEye'), err: $('#loginErr'), go: $('#loginGo'),
    portal: $('#portal'), back: $('#pBack'), out: $('#pOut'),
    welcome: $('#pWelcome'), meta: $('#pMeta'), regs: $('#pRegs'), subs: $('#pSubs'), rank: $('#pRank'),
    events: $('#pEvents'), search: $('#pSearch'), list: $('#pList'), empty: $('#pEmpty'),
  };
  const P = { data: null, filter: 'ALL', q: '', open: new Set(), timer: 0 };
  const HINT = 'prk_rep_hint';
  const hint = {
    get: () => { try { return localStorage.getItem(HINT) === '1'; } catch { return false; } },
    set: (on) => { try { if (on) localStorage.setItem(HINT, '1'); else localStorage.removeItem(HINT); } catch { /* private mode */ } },
  };
  const lock = (on) => document.documentElement.classList.toggle('lock', on);
  const fmtWhen = (w) => (w ? new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(`${w}:00Z`)) : '—');
  const initials = (name) => { const p = name.split(' ').filter(Boolean); return ((p[0] || '')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase(); };

  function syncBtn() {
    const inn = hint.get();
    R.btn.classList.toggle('is-in', inn);
    R.btnLabel.textContent = inn ? 'My referrals' : 'Rep login';
  }

  // ---- login sheet
  function openSheet() {
    R.sheet.hidden = false;
    R.sheet.classList.remove('is-closing');
    R.err.textContent = '';
    lock(true);
    setTimeout(() => (R.code.value ? R.pw : R.code).focus({ preventScroll: true }), 320);
  }
  function closeSheet() {
    if (R.sheet.hidden) return;
    R.sheet.classList.add('is-closing');
    setTimeout(() => { R.sheet.hidden = true; R.sheet.classList.remove('is-closing'); if (R.portal.hidden) lock(false); }, calm() ? 0 : 260);
  }
  R.sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  R.eye.addEventListener('click', () => {
    const show = R.pw.type === 'password';
    R.pw.type = show ? 'text' : 'password';
    R.eye.setAttribute('aria-pressed', String(show));
    R.eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  R.code.addEventListener('input', () => { const pos = R.code.selectionStart; R.code.value = R.code.value.toUpperCase(); R.code.setSelectionRange(pos, pos); });

  function wrong(msg) {
    R.err.textContent = msg;
    R.form.classList.remove('is-wrong');
    void R.form.offsetWidth;
    R.form.classList.add('is-wrong');
    try { navigator.vibrate?.(30); } catch { /* unsupported */ }
  }

  R.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = R.code.value.trim();
    const password = R.pw.value;
    if (!code || !password) { wrong('Enter your referral code and password.'); return; }
    R.go.disabled = true;
    R.err.textContent = '';
    try {
      const res = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, password }) });
      if (res.status === 204) {
        R.pw.value = '';
        hint.set(true);
        syncBtn();
        closeSheet();
        openPortal();
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) wrong(`Too many tries. Wait ${Math.ceil((body.retryAfter || 900) / 60)} min and try again.`);
      else if (res.status === 403) wrong('No password has been set for this code yet. Ask the organisers.');
      else if (res.status >= 500) wrong("Can't sign in right now. Try again in a minute.");
      else wrong('That code and password don’t match.');
    } catch {
      wrong('No connection. Try again.');
    } finally {
      R.go.disabled = false;
    }
  });

  // ---- portal
  function openPortal() {
    if (R.portal.hidden) {
      R.portal.hidden = false;
      R.portal.classList.remove('is-closing', 'is-ready');
      R.portal.scrollTop = 0;
      lock(true);
      if (location.hash !== '#me') history.pushState({ portal: 1 }, '', '#me');
    }
    loadMe();
  }
  function closePortal({ fromHistory = false } = {}) {
    if (R.portal.hidden) return;
    clearTimeout(P.timer);
    R.portal.classList.add('is-closing');
    setTimeout(() => { R.portal.hidden = true; R.portal.classList.remove('is-closing'); lock(false); }, calm() ? 0 : 280);
    if (!fromHistory && location.hash === '#me') history.back();
  }
  R.back.addEventListener('click', () => closePortal());
  addEventListener('popstate', () => { if (location.hash !== '#me') { closePortal({ fromHistory: true }); closeSheet(); } });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!R.sheet.hidden) closeSheet(); else if (!R.portal.hidden) closePortal(); } });

  R.btn.addEventListener('click', () => (hint.get() ? openPortal() : openSheet()));

  R.out.addEventListener('click', async () => {
    try { await fetch('/api/login', { method: 'DELETE', credentials: 'same-origin' }); } catch { /* sign out locally anyway */ }
    hint.set(false);
    syncBtn();
    P.data = null;
    closePortal();
  });

  async function loadMe() {
    clearTimeout(P.timer);
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (res.status === 401) {
        hint.set(false);
        syncBtn();
        closePortal();
        setTimeout(openSheet, 300);
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error('bad');
      renderPortal(body);
      P.timer = setTimeout(() => { if (!R.portal.hidden && !document.hidden) loadMe(); }, 60_000);
    } catch {
      if (!P.data) { R.empty.textContent = "Can't load your referrals right now. Retrying…"; R.empty.hidden = false; }
      P.timer = setTimeout(() => { if (!R.portal.hidden) loadMe(); }, 20_000);
    }
  }

  function renderPortal(d) {
    const first = !P.data || P.data.code !== d.code;
    P.data = d;
    if (first) {
      let i = 0;
      R.welcome.setAttribute('aria-label', d.firstName);
      R.welcome.replaceChildren(...[...d.firstName].map((c) => { const ch = h('span', { class: 'ch' }, c); ch.style.setProperty('--i', String(i++)); return ch; }));
      R.meta.replaceChildren(h('span', null, d.name), d.institution ? h('span', null, d.institution) : null, h('span', null, d.code));
      requestAnimationFrame(() => R.portal.classList.add('is-ready'));
    }
    roll(R.regs, d.registrations);
    roll(R.subs, d.submissions);
    R.rank.textContent = d.rank ? `#${d.rank}` : '—';

    const total = d.people.length;
    const chips = [{ key: 'ALL', name: 'All', count: total, sub: plural(total, 'person', 'people') },
      ...d.events.map((e) => ({ key: e.key, name: e.name, count: d.people.filter((p) => p.event === e.key).length, sub: e.open ? `${e.submissions} ${plural(e.submissions, 'sub')}` : 'registered' }))];
    if (!chips.some((c) => c.key === P.filter)) P.filter = 'ALL';
    R.events.replaceChildren(...chips.map((c) => {
      const b2 = h('button', { class: 'p-chip', type: 'button', 'aria-pressed': String(c.key === P.filter) }, h('span', null, c.name), b(nf.format(c.count)), h('span', null, c.sub));
      b2.addEventListener('click', () => { P.filter = c.key; $$('.p-chip', R.events).forEach((x) => x.setAttribute('aria-pressed', String(x === b2))); renderPeople(); });
      return b2;
    }));
    renderPeople();
  }

  function chev() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
    svg.setAttribute('class', 'pp-chev'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'm6 9 6 6 6-6'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    return svg;
  }

  function renderPeople() {
    const d = P.data;
    const q = P.q.trim().toLowerCase();
    const evName = Object.fromEntries(d.events.map((e) => [e.key, e]));
    const rows = d.people.filter((p) => (P.filter === 'ALL' || p.event === P.filter) && (!q || p.name.toLowerCase().includes(q)));
    R.list.replaceChildren(...rows.slice(0, 400).map((p, i) => {
      const id = `${p.event}|${p.name}|${p.when}`;
      const ev = evName[p.event] || { name: p.event, open: false };
      const open = P.open.has(id);
      const li = h('li', { class: `pp${open ? ' is-open' : ''}${p.counted ? '' : ' is-off'}` });
      li.style.setProperty('--d', `${Math.min(i * 30, 360)}ms`);
      const main = h('button', { class: 'pp-main', type: 'button', 'aria-expanded': String(open) },
        h('span', { class: 'pp-av', 'aria-hidden': 'true' }, initials(p.name)),
        h('span', { class: 'pp-who' }, b(p.name), h('span', null, `${ev.name} · ${fmtWhen(p.when)}`)),
        h('span', { class: 'pp-n' }, b(ev.open ? nf.format(p.submissions) : '✓'), h('small', null, ev.open ? plural(p.submissions, 'sub') : 'reg')),
        chev());
      const call = p.phone ? h('a', { class: 'pp-call', href: `tel:${p.phone}` }, p.phone) : '—';
      const more = h('div', { class: 'pp-more' }, h('div', null, h('dl', { class: 'pp-dl' },
        h('dt', null, 'Phone'), h('dd', null, call),
        h('dt', null, 'College'), h('dd', null, p.institution || '—', p.counted ? null : h('span', { class: 'tag-off' }, 'not counted')),
        h('dt', null, 'Event'), h('dd', null, ev.name),
        p.genre ? h('dt', null, 'Genre') : null, p.genre ? h('dd', null, p.genre) : null,
        ev.open ? h('dt', null, 'Submissions') : null, ev.open ? h('dd', null, String(p.submissions)) : null,
        h('dt', null, 'Registered'), h('dd', null, fmtWhen(p.when)))));
      main.addEventListener('click', () => {
        const next = !li.classList.contains('is-open');
        li.classList.toggle('is-open', next);
        main.setAttribute('aria-expanded', String(next));
        if (next) P.open.add(id); else P.open.delete(id);
      });
      li.append(main, more);
      return li;
    }));
    R.empty.hidden = rows.length > 0;
    if (!rows.length) R.empty.textContent = d.people.length ? 'No one matches that search.' : 'No one has registered with your code yet. Share it around!';
  }
  let st = 0;
  R.search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { P.q = R.search.value.slice(0, 60); if (P.data) renderPeople(); }, 120); });

  syncBtn();
  if (location.hash === '#me' && hint.get()) openPortal();

  // ---------------------------------------------------------------- page
  $$('[data-reveal]').forEach((n) => reveal(n));
  let queued = false;
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; el.bar.classList.toggle('is-scrolled', scrollY > 6); });
  }, { passive: true });
  sync();
})();
