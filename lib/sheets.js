/**
 * Reads Google Sheets as a service account (read-only scope), with no SDK.
 * The sheets stay Restricted; they only need to be shared with the service account's email.
 */
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEET_ID = /^[A-Za-z0-9_-]{20,100}$/;
const TIMEOUT_MS = 9000;

let cachedToken = { value: null, exp: 0 };

/** Service account credentials from env: the whole JSON key, or email + private key. */
export function credentials(env = process.env) {
  let email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = env.GOOGLE_PRIVATE_KEY;
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const json = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    email = json.client_email;
    key = json.private_key;
  }
  if (!email || !key) return null;
  return { email, key: key.replace(/\\n/g, '\n') };
}

export function sheetId(raw) {
  // Accept a bare ID or a full sheet URL pasted into the env var.
  const s = String(raw || '').trim();
  const fromUrl = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  const id = fromUrl ? fromUrl[1] : s;
  return SHEET_ID.test(id) ? id : null;
}

const b64url = (v) => Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

let tokenInflight = null; // parallel sheet reads share one token request

function accessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken.value && cachedToken.exp - 120 > now) return Promise.resolve(cachedToken.value);
  tokenInflight ??= fetchToken(creds, now).finally(() => (tokenInflight = null));
  return tokenInflight;
}

async function fetchToken(creds, now) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: creds.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(creds.key))}`;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const json = await res.json();
  cachedToken = { value: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedToken.value;
}

/** All rows of the form-responses tab (falls back to the first tab). Timestamps as serial numbers. */
export async function readRows(creds, id, tab = 'Form Responses 1') {
  const token = await accessToken(creds);
  const get = async (range) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`
      + '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS';
    return fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  };
  let res = await get(`'${tab}'!A1:AZ5000`);
  if (res.status === 400) res = await get('A1:AZ5000'); // tab renamed: use the first tab
  if (!res.ok) throw new Error(`sheet ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.values) ? json.values : [];
}

/** Several ranges in one request (spreadsheets.values.batchGet). Returns rows per range, in order. */
export async function readRanges(creds, id, ranges) {
  const token = await accessToken(creds);
  const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${qs}`
    + '&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS';
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`sheet ${res.status}`);
  const json = await res.json();
  return (json.valueRanges || []).map((v) => (Array.isArray(v.values) ? v.values : []));
}
