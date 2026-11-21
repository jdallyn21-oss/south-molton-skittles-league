'use strict';

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return {
    url: String(url).trim().replace(/\/+$/, ''),
    key: String(key).trim()
  };
}

// Defense in depth: RPC already drops quick/try-out and unscored drafts.
// Keep the same rules if a host ever returns a wider payload.
function isQuickOrTryoutCard(card) {
  if (!card || typeof card !== 'object') return true;
  if (card.quick === true || card.quick === 1 || card.quick === 'true') return true;
  if (card.tryout === true || card.tryout === 1 || card.tryout === 'true') return true;
  const id = String(card.id || card.key || card.cardKey || '');
  if (/^(qm-|quick-|tg-|tryout-)/i.test(id)) return true;
  return false;
}

function normalizeLeagueCard(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (isQuickOrTryoutCard(raw)) return null;
  if (raw.format != null && raw.format !== '' && raw.format !== 'league') return null;

  let divIndex = Number.isInteger(raw.divIndex) ? raw.divIndex
    : (Number.isInteger(raw.div) ? raw.div : null);
  let week = Number.isInteger(raw.week) ? raw.week : null;
  let matchIndex = Number.isInteger(raw.matchIndex) ? raw.matchIndex
    : (Number.isInteger(raw.mi) ? raw.mi : null);
  const idRaw = String(raw.id || raw.key || raw.cardKey || '');
  const m = idRaw.match(/^([0-2])-(\d+)-(\d+)$/);
  if (m) {
    if (divIndex == null) divIndex = Number(m[1]);
    if (week == null) week = Number(m[2]);
    if (matchIndex == null) matchIndex = Number(m[3]);
  }
  const homeNum = Number.isInteger(raw.homeNum) ? raw.homeNum
    : (Number.isInteger(raw.home) ? raw.home : null);
  const awayNum = Number.isInteger(raw.awayNum) ? raw.awayNum
    : (Number.isInteger(raw.away) ? raw.away : null);
  const homeTotal = typeof raw.homeTotal === 'number' && Number.isFinite(raw.homeTotal) ? raw.homeTotal : null;
  const awayTotal = typeof raw.awayTotal === 'number' && Number.isFinite(raw.awayTotal) ? raw.awayTotal : null;
  if (divIndex == null || week == null || matchIndex == null || homeNum == null || awayNum == null) return null;
  if (homeTotal == null || awayTotal == null) return null;

  const mapPlayers = (list) => (Array.isArray(list) ? list : [])
    .filter(p => p && typeof p === 'object' && String(p.name || '').trim())
    .map(p => ({ name: String(p.name).trim(), pins: typeof p.pins === 'number' ? p.pins : 0 }));
  const homePlayers = mapPlayers(raw.homePlayers);
  const awayPlayers = mapPlayers(raw.awayPlayers);
  if (!homePlayers.concat(awayPlayers).some(p => typeof p.pins === 'number')) return null;

  const id = m ? idRaw : (divIndex + '-' + week + '-' + matchIndex);
  return {
    id,
    divIndex,
    week,
    matchIndex,
    homeNum,
    awayNum,
    format: 'league',
    quick: false,
    homePlayers,
    awayPlayers,
    homeTotal,
    awayTotal,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt
      : (typeof raw.updatedAt === 'string' ? raw.updatedAt : null)
  };
}

function filterLeagueCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map(normalizeLeagueCard).filter(Boolean);
}

// League scoreboard rows from skittles_league_cards(). No key is written to disk.
// source is "supabase" when the function answers, "unavailable" when it is not
// installed yet, and "none" when this host has no Supabase env.
async function fetchLeagueCards() {
  const { url, key } = supabaseConfig();
  if (!url || !key) return { source: 'none', cards: [] };
  let res;
  try {
    res = await fetch(url + '/rest/v1/rpc/skittles_league_cards', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: '{}'
    });
  } catch (err) {
    return { source: 'unavailable', cards: [] };
  }
  if (!res.ok) return { source: 'unavailable', cards: [] };
  let data;
  try { data = await res.json(); }
  catch (err) { return { source: 'unavailable', cards: [] }; }
  return { source: 'supabase', cards: filterLeagueCards(Array.isArray(data) ? data : []) };
}

module.exports = {
  fetchLeagueCards,
  supabaseConfig,
  normalizeLeagueCard,
  filterLeagueCards,
  isQuickOrTryoutCard
};
