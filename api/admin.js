'use strict';

const {
  authConfigured,
  findUser,
  createSessionToken,
  verifySessionToken,
  loadOverrides,
  saveOverrides,
  upsertResult,
  clearResult,
  addPenalty,
  removePenalty
} = require('../lib/admin-overrides');

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function bearerToken(req, body) {
  if (body && body.token) return String(body.token);
  const header = req.headers.authorization || '';
  const m = String(header).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }

  if (req.method === 'GET') {
    const loaded = await loadOverrides();
    send(res, 200, {
      ok: true,
      source: loaded.source,
      authConfigured: authConfigured(),
      overrides: loaded.doc
    });
    return;
  }

  if (req.method !== 'POST') {
    send(res, 405, { ok: false, error: 'GET or POST only' });
    return;
  }

  let body;
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch (err) {
    send(res, 400, { ok: false, error: 'Body must be JSON.' });
    return;
  }

  const action = body.action || 'login';

  if (action === 'login') {
    if (!authConfigured()) {
      send(res, 503, {
        ok: false,
        error: 'Admin login is not configured on this host yet (set LEAGUE_ADMIN_USER and LEAGUE_ADMIN_PASSWORD).'
      });
      return;
    }
    const user = findUser(body.username, body.password);
    if (!user) {
      send(res, 401, { ok: false, error: 'Wrong username or password.' });
      return;
    }
    const token = createSessionToken(user.username);
    send(res, 200, { ok: true, authed: true, username: user.username, token });
    return;
  }

  if (action === 'whoami') {
    const session = verifySessionToken(bearerToken(req, body));
    if (!session) return send(res, 401, { ok: false, error: 'Please sign in again.' });
    send(res, 200, { ok: true, authed: true, username: session.username });
    return;
  }

  const session = verifySessionToken(bearerToken(req, body));
  if (!session) {
    send(res, 401, { ok: false, error: 'Please sign in again.' });
    return;
  }

  const loaded = await loadOverrides();
  let next = loaded.doc;

  if (action === 'upsert-result') {
    const changed = upsertResult(next, body.divIndex, body.week, body.matchIndex, body.result);
    if (changed.error) return send(res, 400, { ok: false, error: changed.error });
    next = changed.doc;
  } else if (action === 'clear-result') {
    next = clearResult(next, body.divIndex, body.week, body.matchIndex).doc;
  } else if (action === 'add-penalty') {
    const changed = addPenalty(next, body.penalty);
    if (changed.error) return send(res, 400, { ok: false, error: changed.error });
    next = changed.doc;
  } else if (action === 'remove-penalty') {
    next = removePenalty(next, body.id).doc;
  } else if (action === 'replace') {
    next = body.overrides || next;
  } else {
    send(res, 400, { ok: false, error: 'Unknown admin action.' });
    return;
  }

  const saved = await saveOverrides(next);
  if (saved.error) return send(res, 503, { ok: false, error: saved.error });
  send(res, 200, {
    ok: true,
    source: saved.source,
    username: session.username,
    overrides: saved.doc
  });
};
