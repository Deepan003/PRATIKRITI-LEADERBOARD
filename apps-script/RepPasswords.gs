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
 *
 * Passwords are one easy word + 3 digits, e.g.  shutter482  (lowercase; the website ignores
 * capital letters and spaces, so phone keyboards can't get in the way).
 */

const REF_TAB = 'REFERRALS';
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
