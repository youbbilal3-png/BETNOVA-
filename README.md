# BETNOVA

**A New World of Sports.**

BETNOVA is an independent, mobile-first sports platform prototype built with React, TypeScript, Vite and Supabase.

## Current status

- Bright ivory, emerald and turquoise visual identity
- Responsive sports discovery layout
- Email/password registration and login connected to Supabase Auth
- Automatic customer profile creation after signup
- Server-controlled profile roles with Row Level Security
- Sport-specific fixtures load from Supabase with explicit loading, empty, and error states; unauthenticated football visitors may see clearly labelled sample fixtures
- Initial sports catalogue seeded: football, basketball, tennis, ice hockey and volleyball
- Local demo bet-slip interactions only

**Important:** This is still a prototype. Fixtures and prices are illustrative until a verified sports data provider is integrated. No real bets, deposits, withdrawals, wallet balances, or payments are processed.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The example environment file contains the BETNOVA project URL and its browser-safe publishable key. The publishable key is designed for frontend use and is protected by database Row Level Security. In Supabase Authentication → URL Configuration, allow `http://localhost:5173` for local testing and add the final deployed domain when one is chosen. Never add a Supabase secret/service-role key or payment credentials to frontend code or this repository.

## Build

```bash
npm run build
```

## Supabase

- Project ref: `lvhuipkfsdughearjsvy`
- Project URL: `https://lvhuipkfsdughearjsvy.supabase.co`
- Database migrations: `supabase/migrations/`

The database currently contains profiles, five sports, 362 football competition/season entries, 3,423 teams and 5,474 fixtures (including 3,693 historical fixtures with complete team links). The imported fixtures are read-only reference data. Markets and market selections are still empty, so no odds are published and no real bets can be placed. All seven public tables have RLS enabled. New profiles are created by a trusted Auth trigger; clients cannot insert profiles or change their role. Source-provider identifiers and unique indexes support repeatable imports without duplicate teams or competitions.

## Architecture roadmap

1. UI foundation and responsive experience
2. Authentication, registration and profile flows
3. Verified sports data provider integration
4. Market catalogue, live odds and bet-slip validation
5. Secure ledger-based wallet architecture and approved payment integrations
6. Administration, security controls, audit logs and testing

Do not add secrets, service-role keys, payment credentials, or private API keys to this repository.

## Latest app maintenance
- Live match cards share one lightweight clock; fixture loading is capped to the first 100 rows and realtime refresh bursts are coalesced.
