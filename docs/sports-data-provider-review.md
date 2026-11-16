# BETNOVA sports-data provider review

This review is for development planning only. Do not enable real-money markets or rely on a provider feed for settlement until BETNOVA has written permission for the intended commercial and betting use, coverage rights, and any required league/federation rights.

## Options checked on 16 November 2026

| Provider | Public free offer | Practical fit |
| --- | --- | --- |
| API-Football | 100 requests/day; its pricing page lists fixtures, livescores, odds and statistics, with free-plan season limits | Useful for a small technical evaluation, but not a production feed for a global platform |
| football-data.org | 12 competitions, fixtures/schedules and league tables; scores and schedules are delayed; 10 requests/minute | Useful for a read-only fixture prototype, not live betting prices |
| Sportmonks Football API | Free forever access to two leagues (Danish Superliga and Scottish Premiership); paid plans scale by league coverage | Useful to test the API structure, but not broad global coverage on the free tier |

## Rights and operational cautions

- API-Football's terms say that use on betting platforms may require additional licences from relevant rights holders and that the provider does not grant commercial rights to competitions. Confirm written permission before using it for BETNOVA.
- Never expose a provider API key in React/Vite browser code. Keep it in a server-side secret and call the provider through a controlled backend/Edge Function.
- Cache provider responses, respect quotas and refresh intervals, and keep provider IDs in the database.
- Do not treat sample odds, delayed scores, or unverified feeds as live betting prices or settlement data.

## Suggested path

1. Keep the current Supabase fixture and market schema as the canonical BETNOVA data model.
2. Complete the read-only UI against those tables.
3. Choose a provider only after confirming its written rights for the intended use and its actual coverage of target competitions.
4. Store the provider key as a server-side secret, then implement a server-side sync function and monitor quota/error responses.
5. Keep market activation and settlement disabled until the data source and operational controls are verified.
