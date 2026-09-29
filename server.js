'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { acceptCard, createStore, pruneBellHotelCards } = require('./lib/league-cards');
const { fetchLeagueCards } = require('./lib/supabase-league');

const PORT = Number(process.env.PORT) || 47331;
const HOST = process.env.HOST || '0.0.0.0';
const DATA = process.env.LEAGUE_DATA || path.join(__dirname, 'data', 'league-cards.json');
const store = createStore(DATA);
const MAX_BODY = 1024 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
  res.end(body);
}

function readBody(req, done) {
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BODY) {
      req.destroy();
      done(new Error('Card is too large.'));
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
  req.on('error', err => done(err));
}

function servePage(res) {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://127.0.0.1'); }
  catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/cards') {
    fetchLeagueCards().then(remote => {
      const fromSupabase = remote.source === 'supabase';
      send(res, 200, {
        ok: true,
        cards: fromSupabase ? remote.cards : store.list(),
        source: fromSupabase ? 'supabase' : 'local'
      });
    }).catch(() => {
      send(res, 200, { ok: true, cards: store.list(), source: 'local' });
    });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/cards/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/cards/'.length));
    const card = store.get(id);
    if (!card) send(res, 404, { ok: false, error: 'No league card is stored with that id.' });
    else send(res, 200, { ok: true, card });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/cards') {
    readBody(req, (err, raw) => {
      if (err) return send(res, 400, { ok: false, error: err.message || 'Card could not be read.' });
      let body;
      try { body = JSON.parse(raw); }
      catch (parseErr) { return send(res, 400, { ok: false, error: 'Card must be a JSON object.' }); }
      const result = acceptCard(body);
      if (result.error) return send(res, 400, { ok: false, error: result.error });
      const saved = store.upsert(result.card);
      send(res, 200, { ok: true, card: saved });
    });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    servePage(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

if (require.main === module) {
  const dropped = pruneBellHotelCards(store);
  if (dropped.length) console.log('Dropped Bell Hotel fixture cards: ' + dropped.join(', '));
  server.listen(PORT, HOST, () => {
    console.log('South Molton Skittles League http://' + HOST + ':' + PORT);
  });
}

module.exports = { server };
