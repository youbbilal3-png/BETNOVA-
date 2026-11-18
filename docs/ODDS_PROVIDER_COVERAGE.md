# BETNOVA odds provider coverage and live-feed status

Last checked: 2026-11-18

## Current provider matrix

| Provider | Free coverage / quota | Live odds | BETNOVA integration |
|---|---|---|---|
| 5DollarFootballAPI | Top five leagues; Community Access should add one chosen country; 60 requests/hour on the free tier | Yes, Bet365 in-play prices through per-fixture odds | Active. Live scoreboard poll every 10 minutes; at most 7 per-fixture odds calls per run plus one live-fixture list call (up to 48 requests/hour). Rotates across fixtures and suspends stale prices after 12 minutes. |
| The Odds API | 500 credits/month; one region + one market costs one credit | Yes, its aggregate upcoming endpoint can return live and upcoming events | Active. Live poll every 2 hours (about 360 credits/month). Pre-match batches run on days 1, 11 and 21 (about 60 credits/month), leaving a reserve. |
| OddsPapi | 250 requests/month | Not available on the current subscription: account reports websocket_access=0 and every listed bookmaker has has_live_odds=false | Active for pre-match only, every 4 hours. Current account had 240 requests remaining after 10 requests. |
| API-Sports / API-Football | Free plan lists 100 requests/day and in-play odds across available competitions | Yes, /odds/live; provider says odds refresh every 5–60 seconds | A dedicated secure live-odds Edge Function is deployed, with a 96/day local safety cap. Scheduling is paused because the provider returned: account suspended. |
| APIfootball.com (separate provider) | Free plan advertises England Championship and France Ligue 2, odds (1X2, BTTS, totals, Asian handicap), 180 requests/hour | Live-odds refresh is not clearly specified in its older public API docs | Not connected. Requires a separate account and API key; likely a limited pre-match coverage addition, not a global live solution. |

## Verified live-feed tests on 2026-11-18

- 5DollarFootballAPI live request returned zero fixtures. Its live catalogue response showed only the five top leagues, with no Algeria country pack; check the Community Access country selection in the provider dashboard.
- The Odds API live request succeeded but returned zero fixtures for its selected ten soccer competitions at the time of the test. The account reported 423 credits remaining after that test.
- API-Sports / API-Football /odds/live request returned HTTP 200 with provider error: "Your account is suspended". The live cron job is therefore unscheduled to avoid repeatedly calling a suspended account.
- OddsPapi account endpoint confirmed all bookmakers on the current subscription have has_live_odds=false and websocket_access=0. Do not spend its limited monthly quota trying to poll live odds.

## Safety and quota rules

- Never invent missing odds or infer prices from scores.
- Only import prices with complete required outcomes, valid decimal odds, correct fixture/team/kickoff matching, and a recent provider timestamp.
- Never overwrite settled markets or settled selections.
- Suspend stale live markets instead of displaying old prices as current.
- 5Dollar free live odds are per fixture, not one request for every live match; the rotation is bounded by the 60/hour plan cap.
- No current free provider covers every one of the 409 live fixtures seen in BETNOVA's score feed. The free API-Sports plan, once reactivated, is the most promising broad live-odds feed because one /odds/live request can return all available in-play fixtures.

## User actions needed

1. Reactivate the existing API-Sports account at https://dashboard.api-football.com. Its API key is already stored securely in Supabase Vault as `api_football_key`. Do not send the key in chat. Once the dashboard confirms the account is active, enable the prepared 15-minute live-odds job (96 requests/day maximum).
2. Confirm Community Access is active on the 5DollarFootballAPI account and that Algeria is selected as the additional country pack. The latest catalogue response contained only the top five leagues.
3. Optional: create a separate free account at https://apifootball.com/ and add its API key to Supabase Vault as `apifootballcom_api_key`. Its advertised free coverage is only England Championship and France Ligue 2; it is not a substitute for a global live-odds feed.
