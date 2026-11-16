# BETNOVA

**A New World of Sports.**

BETNOVA is an independent, mobile-first sports platform prototype built with React, TypeScript, Vite and Supabase.

## Current status

- Bright ivory, emerald and turquoise visual identity
- Responsive sports discovery layout
- Illustrative fixture cards and sample prices
- Local demo bet-slip interactions only
- Independent Supabase project connected at the configuration layer
- Initial database schema deployed with Row Level Security enabled on every public table

**Important:** This is still a prototype. Fixtures and prices are illustrative until a verified sports data provider is integrated. No real bets, deposits, withdrawals, wallet balances, or payments are processed.

## Run locally

```bash
npm install
cp .env.example .env
```

Set `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` to the project's publishable key, then run:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Supabase

- Project ref: `lvhuipkfsdughearjsvy`
- Project URL: `https://lvhuipkfsdughearjsvy.supabase.co`
- Schema migration: `supabase/migrations/20261116130000_betnova_core_foundation.sql`

The publishable key is intended for browser use. Never expose a Supabase secret/service-role key or payment credentials in frontend code or this repository. The initial migration grants authenticated read access to sports catalogue data and own-profile access only; operational write access remains server-controlled.

## Architecture roadmap

1. UI foundation and responsive experience
2. Authentication, registration and profile flows
3. Verified sports data provider integration
4. Market catalogue, live odds and bet-slip validation
5. Secure ledger-based wallet architecture and approved payment integrations
6. Administration, security controls, audit logs and testing

Do not add secrets, service-role keys, payment credentials, or private API keys to this repository.
