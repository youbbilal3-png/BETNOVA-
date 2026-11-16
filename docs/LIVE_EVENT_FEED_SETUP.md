# BETNOVA live event feed setup

The deployed Edge Function is `live-event-ingest` and accepts normalized match events. It is intentionally protected by a separate webhook secret.

## Required project secret

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add:

- `BETNOVA_LIVE_FEED_SECRET`: generate a long random value (at least 32 bytes).

Do not put this value in the browser, GitHub, or a public repository. The function also uses the platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side secrets.

## Request

Send a `POST` request to:

```text
https://<project-ref>.supabase.co/functions/v1/live-event-ingest
```

Include `Content-Type: application/json` and `x-betnova-feed-secret: <your secret>`.

Example normalized event:

```json
{
  "provider": "your-data-provider",
  "provider_event_id": "provider-event-unique-id",
  "fixture_id": "internal-BETNOVA-fixture-uuid",
  "event_type": "goal",
  "team_id": "internal-BETNOVA-team-uuid",
  "player_id": "provider-player-id",
  "player_name": "Player name",
  "period": "second_half",
  "minute": 67,
  "added_time": 0,
  "home_score": 2,
  "away_score": 1,
  "occurred_at": "2026-11-16T18:42:00Z",
  "event_data": {
    "confirmed": false
  }
}
```

Supported event types: `goal`, `goal_cancelled`, `full_time`, `half_time`, `corner`, `yellow_card`, `red_card`, and `penalty_awarded`.

`fixture_id` and `team_id` must be the internal BETNOVA UUIDs, not IDs from an external provider. A provider adapter must map its fixture/team identifiers to these records first. Events are deduplicated by provider + provider event ID.

## Goal settlement

Unconfirmed goal events wait 20 seconds for a VAR cancellation event before the settlement processor runs. A provider may set `event_data.confirmed: true` only when it considers the goal final. If a cancellation arrives, its `event_data` should contain `cancels_provider_event_id` with the original goal's provider event ID.

The current automatic settlement processor supports the configured selection-key conventions for first team to score, next goal, first goalscorer, goal totals, team goal totals, both teams to score, goal in both halves, match result, double chance, draw no bet, exact goals, odd/even goals, correct score, red card, penalty awarded, and first corner. Markets must be built with the corresponding `market_key` and `selection_key` values. Other markets remain unsettled until their result logic is added.

## Current connection status

The ingestion Edge Function is deployed, but no live data provider has been connected yet and the `BETNOVA_LIVE_FEED_SECRET` still needs to be configured. Until a provider adapter is running and sending verified events, live score updates and automatic settlements will not occur.
