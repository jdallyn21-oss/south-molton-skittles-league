'use strict';

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return {
    url: String(url).trim().replace(/\/+$/, ''),
    key: String(key).trim()
  };
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
  return { source: 'supabase', cards: Array.isArray(data) ? data : [] };
}

module.exports = { fetchLeagueCards, supabaseConfig };
