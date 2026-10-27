/**
 * Pratikriti – Referral portal passwords.
 *
 * Paste into the referral sheet: Extensions → Apps Script → (new file) → paste → Save.
 * Reload the sheet: a "Referral portal" menu appears.
 *
 *  • Generate missing passwords — fills the PASSWORD column of REFERRALS for every row that has a
 *    referral code but no password yet. Existing passwords are never changed.
 *  • Reset password for selected row(s) — gives the selected rows a fresh password (that rep is
 *    signed out of the portal automatically).
 *  • Replace ALL passwords — gives every rep a new password (asks first).
 *  • Welcome message for selected row(s) — a ready-to-send greeting with the rep's code, password
 *    and the website link, with Copy and "Send on WhatsApp" buttons.
 *
 * Passwords are one easy word + 3 digits, e.g.  shutter482  (lowercase; the website ignores
 * capital letters and spaces, so phone keyboards can't get in the way).
 */

const REF_TAB = 'REFERRALS';
const SITE_URL = 'https://pratikritileaderborad.vercel.app'; // the leaderboard website
const COUNTRY_CODE = '91'; // added to 10-digit mobile numbers for WhatsApp
const PW_HEADER = 'PASSWORD';
const WORDS = [
  'lens', 'focus', 'shutter', 'frame', 'flash', 'prism', 'colour', 'light', 'pixel', 'zoom',
  'tripod', 'portrait', 'sunset', 'sunrise', 'shadow', 'glow', 'spark', 'canvas', 'studio', 'camera',
  'film', 'reel', 'snap', 'click', 'motion', 'story', 'scene', 'vista', 'horizon', 'skyline',
  'meadow', 'river', 'ocean', 'forest', 'garden', 'lotus', 'tiger', 'falcon', 'koel', 'peacock',
  'mango', 'saffron', 'indigo', 'crimson', 'amber', 'silver', 'golden', 'velvet', 'marble', 'pearl',
  'rainbow', 'monsoon', 'breeze', 'comet', 'galaxy', 'planet', 'orbit', 'rocket', 'lantern', 'candle',
  'festival', 'rhythm', 'melody', 'paint', 'palette', 'sketch', 'poster', 'album', 'gallery', 'mosaic',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Referral portal')
    .addItem('Welcome message for selected row(s)', 'welcomeMessages')
    .addSeparator()
    .addItem('Generate missing passwords', 'generateMissingPasswords')
    .addItem('Reset password for selected row(s)', 'resetSelectedPasswords')
    .addSeparator()
    .addItem('Replace ALL passwords', 'replaceAllPasswords')
    .addToUi();
}

function generateMissingPasswords() {
  const { sheet, headerRow, codeCol, pwCol } = locate_();
  const last = sheet.getLastRow();
  if (last <= headerRow) return toast_('No referral rows yet.');
  const n = last - headerRow;
  const codes = sheet.getRange(headerRow + 1, codeCol, n, 1).getValues();
  const pwRange = sheet.getRange(headerRow + 1, pwCol, n, 1);
  const pws = pwRange.getValues();
  let made = 0;
  for (let i = 0; i < n; i++) {
    if (String(codes[i][0]).trim() && !String(pws[i][0]).trim()) {
      pws[i][0] = newPassword_();
      made++;
    }
  }
  pwRange.setNumberFormat('@').setValues(pws);
  toast_(made ? `Created ${made} password${made === 1 ? '' : 's'}.` : 'Every referral code already has a password.');
}

function resetSelectedPasswords() {
  const { sheet, headerRow, codeCol, pwCol } = locate_();
  const range = sheet.getActiveRange();
  if (!range || range.getSheet().getName() !== REF_TAB) return toast_(`Select rows in ${REF_TAB} first.`);
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Reset passwords?', 'The selected representatives get new passwords and are signed out of the portal.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  let made = 0;
  for (let r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) {
    if (r <= headerRow) continue;
    if (!String(sheet.getRange(r, codeCol).getValue()).trim()) continue;
    sheet.getRange(r, pwCol).setNumberFormat('@').setValue(newPassword_());
    made++;
  }
  toast_(`Reset ${made} password${made === 1 ? '' : 's'}.`);
}

function replaceAllPasswords() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Replace ALL passwords?', 'Every representative gets a new password and is signed out of the portal. Send them their new passwords afterwards.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  const { sheet, headerRow, codeCol, pwCol } = locate_();
  const last = sheet.getLastRow();
  if (last <= headerRow) return toast_('No referral rows yet.');
  const n = last - headerRow;
  const codes = sheet.getRange(headerRow + 1, codeCol, n, 1).getValues();
  const pwRange = sheet.getRange(headerRow + 1, pwCol, n, 1);
  const pws = pwRange.getValues();
  let made = 0;
  for (let i = 0; i < n; i++) {
    if (String(codes[i][0]).trim()) { pws[i][0] = newPassword_(); made++; }
  }
  pwRange.setNumberFormat('@').setValues(pws);
  toast_(`Replaced ${made} password${made === 1 ? '' : 's'}.`);
}

// ---------------------------------------------------------------- welcome messages
function welcomeText_(rep) {
  const first = rep.name.split(/\s+/)[0] || rep.name;
  return [
    `Hello ${first}! 👋`,
    '',
    'Warm greetings from the *IEM Photography Club* ✨',
    `Thank you for representing *${rep.institution}* for *PRATIKRITI*, Day 0 of IEMPACT. We're glad to have you on board!`,
    '',
    'Here are your referral login details:',
    `🔑 Referral code: *${rep.code}*`,
    `🔒 Password: *${rep.password}*`,
    '',
    `Open ${SITE_URL} and tap *Rep login* to see everyone who has registered with your code, event-wise, updated live.`,
    '',
    'Please keep your password private. If you have any questions, just reply here.',
    '',
    'Warm regards,',
    'IEM Photography Club',
  ].join('\n');
}

function welcomeMessages() {
  const { sheet, headerRow, codeCol, pwCol } = locate_();
  const range = sheet.getActiveRange();
  if (!range || range.getSheet().getName() !== REF_TAB) return toast_(`Select one or more rows in ${REF_TAB} first.`);
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0].map((v) => String(v).replace(/\s+/g, ' ').trim().toUpperCase());
  const col = (name) => headers.findIndex((h) => h === name || h.startsWith(name));
  const iName = col('NAME');
  const iInst = col('INSTITU');
  const iMob = col('MOBILE');

  const reps = [];
  for (let r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) {
    if (r <= headerRow) continue;
    const row = sheet.getRange(r, 1, 1, lastCol).getValues()[0];
    const code = String(row[codeCol - 1]).trim();
    if (!code) continue;
    let password = String(row[pwCol - 1]).trim();
    if (!password) {
      password = newPassword_();
      sheet.getRange(r, pwCol).setNumberFormat('@').setValue(password);
    }
    const digits = String(iMob >= 0 ? row[iMob] : '').replace(/\D/g, '');
    const phone = digits.length === 10 ? COUNTRY_CODE + digits : digits;
    const rep = { name: String(row[iName] || '').trim() || 'there', institution: String(row[iInst] || '').trim() || 'your college', code, password };
    reps.push({ name: rep.name, phone, text: welcomeText_(rep) });
  }
  if (!reps.length) return toast_('No referral codes in the selected rows.');

  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cards = reps.map((m, i) => `
    <section class="card">
      <h3>${esc(m.name)}</h3>
      <textarea id="m${i}" readonly>${esc(m.text)}</textarea>
      <div class="row">
        <button onclick="copyIt(${i}, this)">Copy message</button>
        ${m.phone.length >= 11 ? `<a class="wa" target="_blank" rel="noopener" href="https://wa.me/${esc(m.phone)}?text=${encodeURIComponent(m.text)}">Send on WhatsApp</a>` : ''}
      </div>
    </section>`).join('');

  const html = HtmlService.createHtmlOutput(`<!doctype html><html><head><base target="_top"><style>
    body{margin:0;padding:14px;font:14px/1.45 -apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0f0b0b;color:#f4f0eb}
    .card{margin:0 0 14px;padding:14px;border-radius:14px;background:#1a1314;border:1px solid #3a2a2a}
    h3{margin:0 0 8px;font-size:15px}
    textarea{width:100%;box-sizing:border-box;height:250px;padding:10px;border-radius:10px;border:1px solid #3a2a2a;background:#0b0808;color:#f4f0eb;font:13px/1.45 inherit;resize:vertical}
    .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
    button,.wa{flex:1;min-width:140px;padding:11px 12px;border:0;border-radius:10px;font-weight:700;font-size:14px;text-align:center;text-decoration:none;cursor:pointer}
    button{background:linear-gradient(135deg,#ff4a3a,#b4150d);color:#fff}
    .wa{background:#1fa855;color:#fff}
  </style></head><body>${cards}
  <script>
    function copyIt(i, btn){
      var t=document.getElementById('m'+i); t.focus(); t.select();
      var ok=false; try{ ok=document.execCommand('copy'); }catch(e){}
      if(!ok && navigator.clipboard){ navigator.clipboard.writeText(t.value); }
      btn.textContent='Copied ✓'; setTimeout(function(){ btn.textContent='Copy message'; }, 1600);
    }
  </script></body></html>`).setWidth(460).setHeight(Math.min(620, 380 + (reps.length - 1) * 330));
  SpreadsheetApp.getUi().showModalDialog(html, reps.length === 1 ? `Welcome message · ${reps[0].name}` : `Welcome messages · ${reps.length} reps`);
}

/** Finds the header row, the REFERRAL CODE column and the PASSWORD column (adds it if missing). */
function locate_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(REF_TAB);
  if (!sheet) throw new Error(`Tab "${REF_TAB}" not found.`);
  const values = sheet.getRange(1, 1, Math.min(10, sheet.getLastRow() || 1), sheet.getLastColumn() || 1).getValues();
  const norm = (v) => String(v).replace(/\s+/g, ' ').trim().toUpperCase();
  let headerRow = 1;
  for (let i = 0; i < values.length; i++) if (values[i].some((c) => norm(c) === 'NAME')) { headerRow = i + 1; break; }
  const headers = values[headerRow - 1].map(norm);
  const codeCol = headers.indexOf('REFERRAL CODE') + 1;
  if (!codeCol) throw new Error('No "REFERRAL CODE" header found in REFERRALS.');
  let pwCol = headers.indexOf(PW_HEADER) + 1;
  if (!pwCol) {
    pwCol = sheet.getLastColumn() + 1;
    sheet.getRange(headerRow, pwCol).setValue(PW_HEADER).setFontWeight('bold');
  }
  return { sheet, headerRow, codeCol, pwCol };
}

function newPassword_() {
  // Utilities.getUuid() is random; hash it into bytes and pick a word + 3 digits.
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid())
    .map((b) => (b + 256) % 256);
  const word = WORDS[((bytes[0] << 8) | bytes[1]) % WORDS.length];
  const digits = String(((bytes[2] << 8) | bytes[3]) % 900 + 100);
  return word + digits;
}

function toast_(msg) {
  SpreadsheetApp.getActive().toast(msg, 'Referral portal', 5);
}
