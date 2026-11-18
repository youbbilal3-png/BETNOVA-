# The Odds API provider setup

BETNOVA uses The Odds API as its football pre-match odds source. API-Football remains disabled because the connected account was suspended.

## Secret setup

In Supabase Dashboard → Database → Vault, create:

- Name: `the_odds_api_key`
- Secret: the API key from your The Odds API account
- Description: `The Odds API provider key for BETNOVA`

Do not put the key in the frontend, GitHub, Vercel environment variables, or chat.

The existing `betnova_sync_secret` Vault secret is reused for the scheduled Edge Function request. The database RPC that reads both secrets is executable only by `service_role`.

## Refresh and quota policy

- The scheduled job runs once daily at 02:10 UTC.
- It checks six in-season football competitions: EPL, Bundesliga, La Liga, Serie A, Ligue 1, and UEFA Champions League.
- It requests the EU bookmaker region and the `h2h` and `totals` markets.
- The planned maximum is 12 credits per day, approximately 360 credits in a 30-day month, leaving a margin under the free plan's 500 monthly credits.
- The `/sports` and `/events` endpoints are used to discover competitions and upcoming fixtures; those endpoints do not consume odds credits.
- If the provider reports exhausted credits, the sync stops requesting odds and leaves all previously stored market prices untouched. It does not clear or suspend those markets just because the quota is exhausted.
- Stored odds remain available for pre-match bets until kickoff. The database bet-placement function records the exact odds snapshot in each bet leg and rejects scheduled fixtures once kickoff has passed.
- This provider integration does not enable live betting or automatic live-event settlement. A separate trusted live score/event feed is still required for live markets and reliable settlement.
- Only active markets are refreshed. Settled, void, or administratively suspended markets are not reopened by the sync.

## Before enabling real-money wagering

The Odds API permits storing and displaying its data in commercial user-facing apps under its current terms, but BETNOVA must separately verify its own licensing, age restrictions, responsible-gambling requirements, payment compliance, and legal permission to operate in every target jurisdiction. The provider feed is not a wagering licence and does not guarantee the accuracy of every price.


## Bounded sync execution

The active odds sync runs in two five-league batches at 02:10 and 02:20 UTC. The 50-league event catalogue refresh is split into five ten-league batches every six hours. Event rows are processed with bounded concurrency to avoid Edge Function wall-clock timeouts. The pre-match credit budget is unchanged: six priority leagues request h2h + totals, four additional leagues request h2h only (16 credits/day maximum when all markets are returned).


## Multi-provider odds coverage

- The Odds API supplies the featured soccer markets currently mapped by this project (match result and totals). Its free Starter plan is 500 credits/month; each market-region combination costs one credit, so the current ten-league schedule is capped at 16 credits/day (up to 480/month). Additional event-level markets cost extra credits and are not requested blindly.
- FiveDollarFootballAPI is a second, separate odds source. Its free plan lists the top five leagues and provides Bet365 odds per fixture; the pre-match worker now divides the 100-fixture/24-hour window into ten batches, cycling every three hours while respecting the project's 50-request/hour local cap.
- FiveDollar market ingestion includes 1X2, full-time and first-half goal totals, full-time and first-half Asian handicap, BTTS, full-time and first-half corner totals, and Asian corner handicap. Card markets remain disabled until their exact settlement convention is implemented and verified.
- Fixtures with no bookmaker quote remain without odds; the application must never manufacture or interpolate a price.

Official provider references:
- https://5dollarfootballapi.com/docs/fixtures
- https://5dollarfootballapi.com/docs
- https://the-odds-api.com/liveapi/guides/v4/
