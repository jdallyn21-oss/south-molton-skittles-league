'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

delete process.env.VERCEL;
process.env.LEAGUE_ADMIN_USER = 'joe';
process.env.LEAGUE_ADMIN_PASSWORD = 'secret-pass';
process.env.LEAGUE_ADMIN_SESSION_SECRET = 'unit-test-session';
process.env.LEAGUE_ADMIN_DATA = path.join(os.tmpdir(), 'league-admin-' + Date.now() + '.json');

const {
  authConfigured,
  findUser,
  createSessionToken,
  verifySessionToken,
  upsertResult,
  addPenalty,
  removePenalty,
  saveOverrides,
  loadOverrides,
  resultKey,
  EMPTY
} = require('../lib/admin-overrides');

(async () => {
  assert.strictEqual(authConfigured(), true);
  assert.ok(findUser('joe', 'secret-pass'));
  assert.strictEqual(findUser('joe', 'nope'), null);

  const token = createSessionToken('joe');
  assert.strictEqual(verifySessionToken(token).username, 'joe');
  assert.strictEqual(verifySessionToken('bad.token'), null);

  let doc = EMPTY();
  const up = upsertResult(doc, 2, 7, 3, {
    homeNum: 1,
    awayNum: 2,
    homeTotal: 465,
    awayTotal: 404,
    homePlayers: [{ name: 'L. Warne', pins: 50 }],
    awayPlayers: [{ name: 'I. Martin-Taylor', pins: 41 }],
    adminNote: 'Corrected home/away'
  });
  assert.ok(!up.error);
  doc = up.doc;
  assert.strictEqual(doc.results[resultKey(2, 7, 3)].homeTotal, 465);

  const pen = addPenalty(doc, { divIndex: 2, teamNum: 2, pointsDelta: -1, reason: 'Late card', week: 7 });
  assert.ok(!pen.error);
  doc = pen.doc;
  assert.strictEqual(doc.penalties.length, 1);
  doc = removePenalty(doc, pen.penalty.id).doc;
  assert.strictEqual(doc.penalties.length, 0);

  const saved = await saveOverrides(doc);
  assert.ok(!saved.error, saved.error);
  assert.strictEqual(saved.source, 'file');

  const loaded = await loadOverrides();
  assert.strictEqual(loaded.doc.results[resultKey(2, 7, 3)].awayTotal, 404);

  try { fs.unlinkSync(process.env.LEAGUE_ADMIN_DATA); } catch (e) {}
  console.log('admin-overrides tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
