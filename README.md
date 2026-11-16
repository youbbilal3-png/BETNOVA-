# BETNOVA

**A New World of Sports.**

BETNOVA is an independent, mobile-first sports platform prototype built with React, TypeScript, Vite and Supabase.

## Current status

- Bright ivory, emerald and turquoise visual identity
- Responsive sports discovery layout
- Email/password registration and login connected to Supabase Auth
- Automatic customer profile creation after signup
- Server-controlled profile roles with Row Level Security
- Illustrative fixture cards and local demo bet-slip interactions only

**Important:** This is still a prototype. Fixtures and prices are illustrative until a verified sports data provider is integrated. No real bets, deposits, withdrawals, wallet balances, or payments are processed.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

The example environment file contains the BETNOVA project URL and its browser-safe publishable key. The publishable key is designed for frontend use and is protected by database Row Level Security. Never add a Supabase secret/service-role key or payment credentials to frontend code or this repository.

## Build

```bash
npm run build
```

## Supabase

- Project ref: `lvhuipkfsdughearjsvy`
- Project URL: `https://lvhuipkfsdughearjsvy.supabase.co`
- Database migrations: `supabase/migrations/`

The database currently contains profiles, sports, competitions, teams, fixtures, markets and market selections. All seven public tables have RLS enabled. New profiles are created by a trusted Auth trigger; clients cannot insert profiles or change their role.

## Architecture roadmap

1. UI foundation and responsive experience
2. Authentication, registration and profile flows
3. Verified sports data provider integration
4. Market catalogue, live odds and bet-slip validation
5. Secure ledger-based wallet architecture and approved payment integrations
6. Administration, security controls, audit logs and testing

Do not add secrets, service-role keys, payment credentials, or private API keys to this repository.
