'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMPTY = () => ({ results: {}, penalties: [], updatedAt: null });

function defaultFilePath() {
  return process.env.LEAGUE_ADMIN_DATA
    || path.join(__dirname, '..', 'data', 'admin-overrides.json');
}

function localDevFallbackUsers() {
  // Local Node only — never on Vercel — so officers can try admin before env is set.
  if (process.env.VERCEL) return [];
  return [{ username: 'admin', password: 'skittles-local' }];
}

function configuredUsers() {
  const users = [];
  const multi = String(process.env.LEAGUE_ADMIN_USERS || '').trim();
  if (multi) {
    try {
      const parsed = JSON.parse(multi);
      if (Array.isArray(parsed)) {
        parsed.forEach(row => {
          const username = String(row && row.username || '').trim();
          const password = String(row && row.password || '');
          if (username && password) users.push({ username, password });
        });
      }
    } catch (err) {
      // ignore bad JSON; fall through to single-user env
    }
  }
  const username = String(process.env.LEAGUE_ADMIN_USER || '').trim();
  const password = String(process.env.LEAGUE_ADMIN_PASSWORD || '');
  if (username && password) users.push({ username, password });
  if (users.length) return users;
  return localDevFallbackUsers();
}

function authConfigured() {
  return configuredUsers().length > 0;
}

function findUser(username, password) {
  const wantUser = String(username || '').trim();
  const wantPass = String(password || '');
  for (const user of configuredUsers()) {
    const userBuf = Buffer.from(user.username);
    const wantUserBuf = Buffer.from(wantUser);
    if (userBuf.length !== wantUserBuf.length) continue;
    if (!crypto.timingSafeEqual(userBuf, wantUserBuf)) continue;
    const passBuf = Buffer.from(user.password);
    const wantPassBuf = Buffer.from(wantPass);
    if (passBuf.length !== wantPassBuf.length) return null;
    if (!crypto.timingSafeEqual(passBuf, wantPassBuf)) return null;
    return user;
  }
  return null;
}

function sessionSecret() {
  const explicit = String(process.env.LEAGUE_ADMIN_SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  const material = configuredUsers().map(u => u.username + ':' + u.password).join('|')
    || 'smskittles-admin-dev';
  return crypto.createHash('sha256').update(material).digest('hex');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function createSessionToken(username) {
  const body = {
    u: String(username || '').trim(),
    exp: Date.now() + (12 * 60 * 60 * 1000)
  };
  const payload = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifySessionToken(token) {
  const raw = String(token || '');
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!body || typeof body.u !== 'string' || !body.exp || Date.now() > body.exp) return null;
    if (!configuredUsers().some(u => u.username === body.u)) return null;
    return { username: body.u };
  } catch (err) {
    return null;
  }
}

function supabaseSaveKey() {
  return String(process.env.LEAGUE_ADMIN_SAVE_KEY || sessionSecret()).trim();
}

function resultKey(divIndex, week, matchIndex) {
  return String(divIndex) + '-w' + week + 'm' + matchIndex;
}

function parseResultKey(key) {
  const m = String(key || '').match(/^([0-2])-w(\d+)m(\d+)$/);
  if (!m) return null;
  return { divIndex: Number(m[1]), week: Number(m[2]), matchIndex: Number(m[3]) };
}

function sanitizePlayers(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(p => p && typeof p === 'object')
    .map(p => {
      const out = {
        name: String(p.name || '').trim(),
        pins: Math.max(0, parseInt(p.pins, 10) || 0)
      };
      if (p.twentySeven === true) out.twentySeven = true;
      return out;
    })
    .filter(p => p.name || p.pins > 0);
}

function sanitizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const homeNum = parseInt(raw.homeNum, 10);
  const awayNum = parseInt(raw.awayNum, 10);
  if (!(homeNum >= 1 && homeNum <= 9 && awayNum >= 1 && awayNum <= 9)) return null;
  const homePlayers = sanitizePlayers(raw.homePlayers);
  const awayPlayers = sanitizePlayers(raw.awayPlayers);
  const homeTotal = Number.isFinite(raw.homeTotal)
    ? Math.round(raw.homeTotal)
    : homePlayers.reduce((s, p) => s + p.pins, 0);
  const awayTotal = Number.isFinite(raw.awayTotal)
    ? Math.round(raw.awayTotal)
    : awayPlayers.reduce((s, p) => s + p.pins, 0);
  return {
    homeNum,
    awayNum,
    homePlayers,
    awayPlayers,
    homeTotal,
    awayTotal,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString().slice(0, 10),
    adminNote: typeof raw.adminNote === 'string' ? raw.adminNote.trim().slice(0, 240) : '',
    source: 'admin'
  };
}

function sanitizePenalty(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const divIndex = parseInt(raw.divIndex, 10);
  const teamNum = parseInt(raw.teamNum, 10);
  const pointsDelta = parseInt(raw.pointsDelta, 10);
  if (!(divIndex >= 0 && divIndex <= 2)) return null;
  if (!(teamNum >= 1 && teamNum <= 9)) return null;
  if (!Number.isFinite(pointsDelta) || pointsDelta === 0) return null;
  if (Math.abs(pointsDelta) > 20) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : ('p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)),
    divIndex,
    teamNum,
    pointsDelta,
    reason: String(raw.reason || '').trim().slice(0, 200) || 'Penalty',
    week: Number.isFinite(parseInt(raw.week, 10)) ? parseInt(raw.week, 10) : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
  };
}

function normalizeDoc(raw) {
  const doc = EMPTY();
  if (!raw || typeof raw !== 'object') return doc;
  const results = raw.results && typeof raw.results === 'object' ? raw.results : {};
  Object.keys(results).forEach(key => {
    if (!parseResultKey(key)) return;
    const cleaned = sanitizeResult(results[key]);
    if (cleaned) doc.results[key] = cleaned;
  });
  const penalties = Array.isArray(raw.penalties) ? raw.penalties : [];
  penalties.forEach(p => {
    const cleaned = sanitizePenalty(p);
    if (cleaned) doc.penalties.push(cleaned);
  });
  doc.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  return doc;
}

function readFileStore(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { source: 'file', doc: normalizeDoc(parsed) };
  } catch (err) {
    return { source: 'file', doc: EMPTY() };
  }
}

function writeFileStore(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  const payload = normalizeDoc(doc);
  payload.updatedAt = new Date().toISOString();
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
  fs.renameSync(tmp, file);
  return payload;
}

async function readBlobStore() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { list } = await import('@vercel/blob');
    const listed = await list({ prefix: 'league-admin-overrides', limit: 10, token });
    const hit = (listed.blobs || []).find(b => b.pathname === 'league-admin-overrides.json')
      || (listed.blobs || [])[0];
    if (!hit) return { source: 'blob', doc: EMPTY() };
    const res = await fetch(hit.url, { cache: 'no-store' });
    if (!res.ok) return { source: 'blob', doc: EMPTY() };
    return { source: 'blob', doc: normalizeDoc(await res.json()) };
  } catch (err) {
    return null;
  }
}

async function writeBlobStore(doc) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { put } = await import('@vercel/blob');
    const payload = normalizeDoc(doc);
    payload.updatedAt = new Date().toISOString();
    await put('league-admin-overrides.json', JSON.stringify(payload, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token
    });
    return { source: 'blob', doc: payload };
  } catch (err) {
    return null;
  }
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return {
    url: String(url).trim().replace(/\/+$/, ''),
    key: String(key).trim()
  };
}

async function readSupabaseStore() {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  try {
    const res = await fetch(url + '/rest/v1/rpc/skittles_admin_overrides', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { source: 'supabase', doc: normalizeDoc(data) };
  } catch (err) {
    return null;
  }
}

async function writeSupabaseStore(doc) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return null;
  try {
    const payload = normalizeDoc(doc);
    payload.updatedAt = new Date().toISOString();
    const res = await fetch(url + '/rest/v1/rpc/skittles_admin_save_overrides', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_key: supabaseSaveKey(), p_payload: payload })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.error) return { error: String(data.error) };
    return { source: 'supabase', doc: normalizeDoc(data && data.payload ? data.payload : payload) };
  } catch (err) {
    return null;
  }
}

async function loadOverrides() {
  const supabase = await readSupabaseStore();
  if (supabase) return supabase;
  const blob = await readBlobStore();
  if (blob) return blob;
  return readFileStore(defaultFilePath());
}

async function saveOverrides(doc) {
  const next = normalizeDoc(doc);
  next.updatedAt = new Date().toISOString();

  const supabase = await writeSupabaseStore(next);
  if (supabase && supabase.error) return supabase;
  if (supabase && supabase.doc) return supabase;

  const blob = await writeBlobStore(next);
  if (blob && blob.doc) return blob;

  try {
    const written = writeFileStore(defaultFilePath(), next);
    return { source: 'file', doc: written };
  } catch (err) {
    return {
      error: 'Could not save admin overrides. Use a writable data file, BLOB_READ_WRITE_TOKEN, or the Supabase admin migration.'
    };
  }
}

function upsertResult(doc, divIndex, week, matchIndex, result) {
  const next = normalizeDoc(doc);
  const cleaned = sanitizeResult(result);
  if (!cleaned) return { error: 'Result looks incomplete.' };
  next.results[resultKey(divIndex, week, matchIndex)] = cleaned;
  return { doc: next };
}

function clearResult(doc, divIndex, week, matchIndex) {
  const next = normalizeDoc(doc);
  delete next.results[resultKey(divIndex, week, matchIndex)];
  return { doc: next };
}

function addPenalty(doc, penalty) {
  const next = normalizeDoc(doc);
  const cleaned = sanitizePenalty(penalty);
  if (!cleaned) return { error: 'Penalty needs a team and a non-zero points change.' };
  next.penalties.push(cleaned);
  return { doc: next, penalty: cleaned };
}

function removePenalty(doc, id) {
  const next = normalizeDoc(doc);
  next.penalties = next.penalties.filter(p => p.id !== id);
  return { doc: next };
}

module.exports = {
  EMPTY,
  authConfigured,
  findUser,
  createSessionToken,
  verifySessionToken,
  resultKey,
  parseResultKey,
  normalizeDoc,
  sanitizeResult,
  sanitizePenalty,
  loadOverrides,
  saveOverrides,
  upsertResult,
  clearResult,
  addPenalty,
  removePenalty,
  defaultFilePath
};
