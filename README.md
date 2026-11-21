# South Molton Skittles League

Fixtures, results, and league tables for the South Molton Skittles League, 2026/27 season. Divisions 1, 2, and 3 are included. The page keeps its existing layout. Scores pushed by the scoring app for league fixtures are folded into those tables.

## Run locally

From this directory:

```bash
node server.js
```

The site and the API listen on port 47331. Open [http://127.0.0.1:47331](http://127.0.0.1:47331).

`GET /api/cards` reads scored league fixtures from Supabase `skittles_league_cards()` when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set (they already are on the Vercel project). Those values are not stored in git. The page prefers those cards for tables, results, and averages. Quick / try-out cards (`quick: true`, or ids starting `qm-` / `quick-` / `tg-` / `tryout-`) are ignored. Baked CSV/HTML results stay as the fallback for any fixture Supabase does not have yet.

Locally, with those variables unset, cards stay in `data/league-cards.json` (not committed). Set `LEAGUE_DATA` to a durable file path if the host’s disk is wiped on restart. No API token is required for the local file.

## League admin

The **Admin** tab is for officers who need to correct a score or record a points penalty. Sign in with a username and password (not a shared PIN).

| Env var | Purpose |
| --- | --- |
| `LEAGUE_ADMIN_USER` / `LEAGUE_ADMIN_PASSWORD` | Single admin login |
| `LEAGUE_ADMIN_USERS` | Optional JSON array of `{ "username", "password" }` for more than one officer |
| `LEAGUE_ADMIN_SESSION_SECRET` | Optional; used to sign browser session tokens |
| `LEAGUE_ADMIN_DATA` | Optional file path for saved overrides (defaults under `data/`) |
| `BLOB_READ_WRITE_TOKEN` | Optional Vercel Blob store for durable overrides on serverless |
| `LEAGUE_ADMIN_SAVE_KEY` | Optional key for the Supabase admin save RPC |

Admin sits in a slim bar above the hero header (not in the main tabs). A built-in officer account is available on every host (`smskittlesadmin`). Extra accounts can be added with `LEAGUE_ADMIN_USER` / `LEAGUE_ADMIN_PASSWORD` (or `LEAGUE_ADMIN_USERS`). Locally, if no env users are set, `admin` / `skittles-local` also works. After sign-in, use **Edit** on Fixtures & Results to save a correction, or record a penalty under Admin → Penalties. Public visitors still load the corrected scores via `GET /api/admin` (no login required to read).

**Result precedence** (fixtures, tables, averages — same after refresh / tab focus):

1. Admin score corrections, **Clear** suppressions, and point penalties (`GET /api/admin`)
2. Live scored league cards from the scoring app / Supabase (`GET /api/cards`) — quick / try-out cards never apply
3. Baked CSV/HTML results in the page

Admin **Clear** stores a durable suppression so a live card cannot repaint that fixture after refresh. Use **Restore card** on the Admin corrections list to lift a Clear.

**One step for durable admin saves on Vercel:** in the Supabase SQL editor for project [`dtctorijynmcdjtzmgnk`](https://supabase.com/dashboard/project/dtctorijynmcdjtzmgnk/sql/new), paste and run `supabase/migrations/20261121190000_skittles_admin_overrides.sql` once. The site already has `SUPABASE_URL` / `SUPABASE_ANON_KEY` for that project (same as live cards).

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
