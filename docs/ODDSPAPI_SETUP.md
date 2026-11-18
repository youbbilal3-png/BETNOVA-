# OddsPapi integration

## Credentials and security
- Store the provider key only in Supabase Vault as `oddspapi_api_key`.
- The key is read server-side by the `oddspapi-sync` Edge Function through the service-role-only `betnova_get_odds_sync_config()` RPC.
- The browser and GitHub source do not contain the provider key.
- Requests to the Edge Function require the existing `betnova_sync_secret` header.

## Coverage and schedule
- The account currently reports a 250-request monthly allowance.
- The integration makes one odds request per run, with up to three tournament IDs in that request.
- The cron job runs every four hours (`0 */4 * * *`), budgeting about 180 odds requests over a 30-day month and preserving a quota reserve.
- Tournament batches are prioritized using upcoming fixtures already present in BETNOVA, then rotated through a bounded competition list.
- The integration rotates among 1xBet, Pinnacle, and bet365 to broaden bookmaker coverage. 1xBet has been validated; other bookmaker/tournament combinations may return 404 when no odds are offered. A 404 advances both the bookmaker and tournament rotation so the same unsupported batch is not retried every four hours.
- The current OddsPapi subscription reports no live odds. This integration is pre-match only; live prices must come from another enabled provider.

## Market normalization
Markets are normalized to BETNOVA settlement keys where the existing settlement engine supports them:
- Match result, both teams to score, double chance, draw no bet
- Full-time and first-half total goals
- Home/away team total goals
- Asian handicap (full-time and first-half; quarter-goal lines are excluded)
- Total corners (full-time and first-half)
- Asian corner handicap
- Correct score and odd/even goals, when complete active outcomes are supplied

Markets that the settlement engine cannot safely settle are deliberately not activated, even if OddsPapi lists them in its catalogue. This currently excludes unsupported player props, bookings totals, team-corner totals, and last-goal markets.

## Fixture and price safety
- Provider events are linked only when both team names and kickoff time match a local scheduled fixture.
- Ambiguous matches are rejected rather than risking odds being attached to the wrong fixture.
- Markets are imported only when every required outcome is active, has a valid decimal price, and was updated within 24 hours.
- Existing settled markets and settled/inactive selections are never overwritten.
- Old open OddsPapi markets are suspended after their price freshness window expires.
- Provider fixture links, tournament catalogue, market catalogue, and sync cursor are stored in dedicated tables.

## Validation snapshot
On 2026-11-18, the first successful OddsPapi sync imported 259 markets across 7 BETNOVA fixtures. At the same checkpoint:
- The Odds API: 744 markets across 196 fixtures
- 5DollarFootballAPI: 147 markets across 10 fixtures
- OddsPapi: 259 markets across 7 fixtures

Coverage varies by competition, bookmaker, and market. The integration never fabricates missing odds or marks stale prices as current.
