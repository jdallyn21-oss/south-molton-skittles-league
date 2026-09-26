'use strict';

const fs = require('fs');
const path = require('path');

// Same league fixture grid as the site and the scorer (all three divisions).
const FIXTURES = [
  { week: 1, matches: [[5, 3], [6, 2], [7, 1], [8, 9]] },
  { week: 2, matches: [[1, 8], [2, 7], [3, 6], [4, 5]] },
  { week: 3, matches: [[6, 4], [7, 3], [8, 2], [9, 1]] },
  { week: 4, matches: [[2, 9], [3, 8], [4, 7], [5, 6]] },
  { week: 5, matches: [[8, 6], [9, 5], [1, 4], [2, 3]] },
  { week: 6, matches: [[3, 1], [4, 9], [5, 8], [6, 7]] },
  { week: 7, matches: [[7, 5], [8, 4], [9, 3], [1, 2]] },
  { week: 8, matches: [[9, 7], [1, 6], [2, 5], [3, 4]] },
  { week: 9, matches: [[4, 2], [5, 1], [6, 9], [7, 8]] },
  { week: 10, matches: [[3, 5], [2, 6], [1, 7], [9, 8]] },
  { week: 11, matches: [[8, 1], [7, 2], [6, 3], [5, 4]] },
  { week: 12, matches: [[4, 6], [3, 7], [2, 8], [1, 9]] },
  { week: 13, matches: [[9, 2], [8, 3], [7, 4], [6, 5]] },
  { week: 14, matches: [[6, 8], [5, 9], [4, 1], [3, 2]] },
  { week: 15, matches: [[1, 3], [9, 4], [8, 5], [7, 6]] },
  { week: 16, matches: [[5, 7], [4, 8], [3, 9], [2, 1]] },
  { week: 17, matches: [[7, 9], [6, 1], [5, 2], [4, 3]] },
  { week: 18, matches: [[2, 4], [1, 5], [9, 6], [8, 7]] }
];

// League cards have 6 boxes. South Molton double rubs finish in three pairs.
const PAIR_BOXES = [[0, 1], [2, 3], [4, 5]];
const CUPS = new Set(['western-counties', 'sid-squire', 'pidler', 'front-pin', 'concrete']);

function isQuick(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.quick === true || body.quick === 1 || body.quick === 'true') return true;
  const cardKey = String(body.cardKey || body.key || '');
  if (cardKey.startsWith('qm-') || cardKey.startsWith('quick-')) return true;
  return false;
}

function divIndexOf(body) {
  if (Number.isInteger(body.division) && body.division >= 1 && body.division <= 3) return body.division - 1;
  if (Number.isInteger(body.div) && body.div >= 0 && body.div <= 2) return body.div;
  const m = String(body.key || body.cardKey || '').match(/^([0-2])-(\d+)-(\d+)$/);
  if (m) return Number(m[1]);
  return null;
}

function weekAndMatch(body) {
  const matchIndex = Number.isInteger(body.matchIndex) ? body.matchIndex : (Number.isInteger(body.mi) ? body.mi : null);
  if (Number.isInteger(body.week) && matchIndex !== null) return { week: body.week, matchIndex };
  const m = String(body.key || body.cardKey || '').match(/^[0-2]-(\d+)-(\d+)$/);
  if (m) return { week: Number(m[1]), matchIndex: Number(m[2]) };
  return null;
}

function teamNum(body, side) {
  if (side === 'home') {
    if (Number.isInteger(body.homeNum)) return body.homeNum;
    if (Number.isInteger(body.home)) return body.home;
  } else {
    if (Number.isInteger(body.awayNum)) return body.awayNum;
    if (Number.isInteger(body.away)) return body.away;
  }
  return null;
}

function sidePlayers(body, side, pairIndex) {
  const raw = body.players && body.players[side];
  if (!Array.isArray(raw)) return { error: 'League card is missing players.' + side + '.' };
  const pairBoxes = PAIR_BOXES[pairIndex];
  const players = [];
  for (const player of raw) {
    if (!player || typeof player !== 'object') continue;
    const name = String(player.name || '').trim();
    if (!name) continue;
    const boxes = Array(6).fill(null);
    const src = Array.isArray(player.boxes) ? player.boxes : [];
    for (let i = 0; i < 6; i++) {
      if (typeof src[i] === 'number' && Number.isFinite(src[i])) boxes[i] = src[i];
    }
    for (const box of pairBoxes) {
      if (typeof boxes[box] !== 'number') {
        return { error: 'Pair ' + pairIndex + ' needs a score in boxes ' + pairBoxes[0] + ' and ' + pairBoxes[1] + ' for ' + name + '.' };
      }
      if (boxes[box] < 0 || boxes[box] > 27) {
        return { error: 'Box scores must be from 0 to 27 (' + name + ').' };
      }
    }
    players.push({ name, boxes });
  }
  if (!players.length) return { error: 'League card has no ' + side + ' players for this pair.' };
  return { players };
}

function acceptCard(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Card must be a JSON object.' };
  }
  if (isQuick(body)) {
    if (!body.format || body.format === 'league') {
      return { error: 'Quick Matches are not accepted, including a Quick Match whose format is league.' };
    }
    return { error: 'Quick Match (' + body.format + ') is not a league fixture and was not saved.' };
  }
  if (body.format != null && body.format !== '' && body.format !== 'league') {
    if (CUPS.has(body.format)) {
      return { error: 'Cup game "' + body.format + '" is not a league fixture and was not saved.' };
    }
    return { error: 'Format "' + body.format + '" is not a league fixture and was not saved.' };
  }
  if (!Number.isInteger(body.pair) || body.pair < 0 || body.pair > 2) {
    return { error: 'Say which pair of rubs just finished: pair 0 (boxes 0–1), 1 (boxes 2–3), or 2 (boxes 4–5).' };
  }

  const divIndex = divIndexOf(body);
  if (divIndex === null) return { error: 'League card is missing a division (1, 2, or 3).' };
  const when = weekAndMatch(body);
  if (!when) return { error: 'League card is missing a fixture week and match.' };
  const fixture = FIXTURES.find(row => row.week === when.week);
  if (!fixture || when.matchIndex < 0 || when.matchIndex >= fixture.matches.length) {
    return { error: 'That week and match are not on the league fixture list.' };
  }
  const scheduled = fixture.matches[when.matchIndex];
  const homeNum = teamNum(body, 'home');
  const awayNum = teamNum(body, 'away');
  if (homeNum !== scheduled[0] || awayNum !== scheduled[1]) {
    return { error: 'Home and away do not match the scheduled league fixture.' };
  }

  const home = sidePlayers(body, 'home', body.pair);
  if (home.error) return home;
  const away = sidePlayers(body, 'away', body.pair);
  if (away.error) return away;

  return {
    card: {
      id: divIndex + '-' + when.week + '-' + when.matchIndex,
      division: divIndex + 1,
      divIndex,
      week: when.week,
      matchIndex: when.matchIndex,
      pair: body.pair,
      format: 'league',
      quick: false,
      homeNum,
      awayNum,
      homePlayers: home.players,
      awayPlayers: away.players,
      savedAt: typeof body.savedAt === 'string' ? body.savedAt : null
    }
  };
}

function mergePlayers(prev, next) {
  const prevList = Array.isArray(prev) ? prev : [];
  const out = [];
  const count = Math.max(prevList.length, next.length);
  for (let i = 0; i < count; i++) {
    const incoming = next[i];
    const old = prevList[i];
    if (!incoming) {
      if (old) out.push(old);
      continue;
    }
    const boxes = Array(6).fill(null);
    const oldBoxes = old && Array.isArray(old.boxes) ? old.boxes : [];
    const sameName = old && old.name === incoming.name;
    for (let box = 0; box < 6; box++) {
      if (typeof incoming.boxes[box] === 'number') boxes[box] = incoming.boxes[box];
      else if (sameName && typeof oldBoxes[box] === 'number') boxes[box] = oldBoxes[box];
    }
    out.push({
      name: incoming.name,
      pins: boxes.reduce((sum, value) => sum + (value || 0), 0),
      boxes
    });
  }
  return out;
}

function createStore(file) {
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      return {};
    }
  }
  function write(cards) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cards, null, 2));
    fs.renameSync(tmp, file);
  }
  return {
    list() {
      return Object.values(read()).sort((a, b) => a.divIndex - b.divIndex || a.week - b.week || a.matchIndex - b.matchIndex);
    },
    get(id) {
      return read()[id] || null;
    },
    remove(id) {
      const cards = read();
      if (!cards[id]) return false;
      delete cards[id];
      write(cards);
      return true;
    },
    upsert(card) {
      const cards = read();
      const prev = cards[card.id];
      const homePlayers = mergePlayers(prev && prev.homePlayers, card.homePlayers);
      const awayPlayers = mergePlayers(prev && prev.awayPlayers, card.awayPlayers);
      const now = new Date().toISOString();
      const stored = {
        id: card.id,
        division: card.division,
        divIndex: card.divIndex,
        week: card.week,
        matchIndex: card.matchIndex,
        format: 'league',
        quick: false,
        homeNum: card.homeNum,
        awayNum: card.awayNum,
        homePlayers,
        awayPlayers,
        homeTotal: homePlayers.reduce((sum, player) => sum + player.pins, 0),
        awayTotal: awayPlayers.reduce((sum, player) => sum + player.pins, 0),
        lastPair: card.pair,
        savedAt: card.savedAt,
        receivedAt: prev && prev.receivedAt ? prev.receivedAt : now,
        updatedAt: now
      };
      cards[card.id] = stored;
      write(cards);
      return stored;
    }
  };
}

function isDivision1BellFixture(card) {
  if (!card || card.divIndex !== 0) return false;
  if (card.homeNum === 5 || card.awayNum === 5) return true;
  const fixture = FIXTURES.find(row => row.week === card.week);
  const match = fixture && fixture.matches[card.matchIndex];
  return !!(match && (match[0] === 5 || match[1] === 5));
}

function pruneBellHotelCards(store) {
  const removed = [];
  store.list().forEach(card => {
    if (isDivision1BellFixture(card)) {
      store.remove(card.id);
      removed.push(card.id);
    }
  });
  return removed;
}

module.exports = { FIXTURES, PAIR_BOXES, acceptCard, createStore, isDivision1BellFixture, pruneBellHotelCards };
