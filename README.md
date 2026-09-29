# South Molton Skittles League

Fixtures, results, and league tables for the South Molton Skittles League, 2026/27 season. Divisions 1, 2, and 3 are included. The page keeps its existing layout. Scores pushed by the scoring app for league fixtures are folded into those tables.

## Run locally

From this directory:

```bash
node server.js
```

The site and the API listen on port 47331. Open [http://127.0.0.1:47331](http://127.0.0.1:47331).

`GET /api/cards` reads league fixtures from Supabase `skittles_league_cards()` when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in the environment (they already are on the Vercel project). Those values are not stored in git. Until Joe runs `supabase/migrations/20260929120000_skittles_league_cards.sql` in the Supabase SQL editor, that read is empty and the page keeps the results already in the HTML.

Locally, with those variables unset, cards stay in `data/league-cards.json` (not committed). Set `LEAGUE_DATA` to a durable file path if the host’s disk is wiped on restart. No API token is required for the local file.

## League fixture API

The scoring app POSTs at the end of each pair of rubs. Only a scheduled league fixture is stored. A later push for the same fixture updates the running scores. A finished match card is not required: unplayed boxes stay `null`.

`POST /api/cards`

`GET /api/cards` returns league fixtures from Supabase when that read is available, otherwise the local file. `GET /api/cards/{id}` returns one local card. The id is `{divisionIndex}-{week}-{matchIndex}`, for example `0-3-0`.

League fixture cards in the scorer have no `quick` field. `format` is `league`, or it can be left off. Each player is a slot from the card: `name`, `boxes` (6 scores, `null` if not bowled yet), `spare`, and `fine`. South Molton plays double rubs, so the six boxes finish as three pairs:

| `pair` | boxes just finished |
| --- | --- |
| 0 | 0 and 1 |
| 1 | 2 and 3 |
| 2 | 4 and 5 |

A number in `boxes` replaces that box. `null` leaves a score already stored for that player. Team totals are the sum of the boxes stored so far.

Example body for the first pair of Division 1, week 3, Sundowners (home 6) v Young Guns (away 4):

```json
{
  "key": "0-3-0",
  "div": 0,
  "week": 3,
  "mi": 0,
  "date": "2026-09-28",
  "home": 6,
  "away": 4,
  "format": "league",
  "pair": 0,
  "players": {
    "home": [
      {
        "name": "D. Holland",
        "boxes": [8, 7, null, null, null, null],
        "spare": [false, false, false, false, false, false],
        "fine": [false, false, false, false, false, false]
      }
    ],
    "away": [
      {
        "name": "A. Westcott",
        "boxes": [6, 9, null, null, null, null],
        "spare": [false, true, false, false, false, false],
        "fine": [false, false, false, false, false, false]
      }
    ]
  }
}
```

A stored card comes back as `{ "ok": true, "card": { ... } }` with `homeTotal`, `awayTotal`, and each player’s running `pins`. The same JSON is what the page reads.

A push that is not a league fixture is not saved. The response is HTTP 400 and `{ "ok": false, "error": "..." }`.

- A Quick Match (`quick: true`, or a key starting with `qm-` / `quick-`), including one whose format is `league`: `Quick Matches are not accepted, including a Quick Match whose format is league.`
- A cup (`western-counties`, `sid-squire`, `pidler`, `front-pin`, `concrete`): `Cup game "sid-squire" is not a league fixture and was not saved.` (the name in the message is the format that was sent).
