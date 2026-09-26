'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { acceptCard, createStore, pruneBellHotelCards } = require('../lib/league-cards');

function player(name, boxes) {
  return { name, boxes, spare: [false, false, false, false, false, false], fine: [false, false, false, false, false, false] };
}

const pair0 = {
  key: '0-3-0',
  div: 0,
  week: 3,
  mi: 0,
  date: '2026-09-28',
  home: 6,
  away: 4,
  format: 'league',
  pair: 0,
  status: 'draft',
  players: {
    home: [player('D. Holland', [8, 7, null, null, null, null])],
    away: [player('A. Westcott', [6, 9, null, null, null, null])]
  }
};

const accepted = acceptCard(pair0);
assert.strictEqual(accepted.error, undefined, accepted.error);
assert.strictEqual(accepted.card.id, '0-3-0');
assert.strictEqual(accepted.card.pair, 0);

const omittedFormat = Object.assign({}, pair0);
delete omittedFormat.format;
assert.strictEqual(acceptCard(omittedFormat).error, undefined);

function rejected(label, body, snippet) {
  const result = acceptCard(body);
  assert.ok(result.error, label + ' should fail');
  assert.ok(result.error.includes(snippet), label + ' got: ' + result.error);
}

rejected('quick league', Object.assign({}, pair0, { quick: true, key: 'qm-1' }), 'Quick Matches');
rejected('sid squire', Object.assign({}, pair0, { format: 'sid-squire' }), 'sid-squire');
rejected('western', Object.assign({}, pair0, { format: 'western-counties' }), 'western-counties');
rejected('pidler', Object.assign({}, pair0, { format: 'pidler' }), 'pidler');
rejected('front pin', Object.assign({}, pair0, { format: 'front-pin' }), 'front-pin');
rejected('concrete', Object.assign({}, pair0, { format: 'concrete' }), 'concrete');
rejected('missing pair', Object.assign({}, pair0, { pair: undefined }), 'pair 0');
rejected('wrong teams', Object.assign({}, pair0, { home: 1, away: 2 }), 'Home and away');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'league-cards-'));
const store = createStore(path.join(dir, 'cards.json'));
const first = store.upsert(accepted.card);
assert.strictEqual(first.homeTotal, 15);
assert.strictEqual(first.awayTotal, 15);
assert.strictEqual(first.lastPair, 0);

const pair1 = acceptCard(Object.assign({}, pair0, {
  pair: 1,
  players: {
    home: [player('D. Holland', [null, null, 6, 5, null, null])],
    away: [player('A. Westcott', [null, null, 4, 8, null, null])]
  }
}));
assert.strictEqual(pair1.error, undefined, pair1.error);
const second = store.upsert(pair1.card);
assert.strictEqual(second.homeTotal, 26);
assert.strictEqual(second.awayTotal, 27);
assert.deepStrictEqual(second.homePlayers[0].boxes, [8, 7, 6, 5, null, null]);
assert.strictEqual(store.list().length, 1);
assert.strictEqual(second.receivedAt, first.receivedAt);

const bell = store.upsert(Object.assign({}, accepted.card, { id: '0-1-0', divIndex: 0, division: 1, week: 1, matchIndex: 0, homeNum: 5, awayNum: 3 }));
assert.strictEqual(bell.homeNum, 5);
assert.deepStrictEqual(pruneBellHotelCards(store), ['0-1-0']);
assert.strictEqual(store.get('0-1-0'), null);
assert.strictEqual(store.get('0-3-0').homeTotal, 26);

console.log('league-cards tests passed');
