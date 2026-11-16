# BETNOVA — Real-money wagering launch gate

**Status: BLOCKED for Algeria.** BETNOVA must not accept deposits, stakes, wagers, withdrawals, or cash-equivalent credits from users in Algeria.

## Current legal research (16 November 2026)

The Algerian Ministry of Interior's national money-laundering and terrorist-financing risk assessment summary states that gambling and betting are prohibited except for the Algerian Sports Betting (Pari Sportif Algérien) and horse-racing bets, and that the prohibition extends to electronic transactions concerning games of chance, betting, and lotteries under Law 18-05. It also describes fines under Article 37 and possible website closure.

Primary government sources:
- Ministry of Interior, French summary (June 2024): https://interieur.gov.dz/wp-content/uploads/2025/03/Rapport_de_lENR_Synthese.pdf
- Ministry of Interior, Arabic summary: https://interieur.gov.dz/images/ENR_VAR_Synthese.pdf

This is a product-risk summary, not a legal opinion. Obtain written advice from qualified Algerian counsel and confirmation from the competent authorities before any change in scope. Do not assume that incorporating abroad, using crypto, or routing payments through a foreign provider makes the activity lawful for Algerian residents.

## Safe development scope while blocked

- Sports fixtures, results, statistics, and editorial predictions.
- Free prediction challenges and leaderboards using non-purchasable, non-transferable points with no cash or prize redemption.
- Demo-only bet-slip UI clearly marked as simulation; no real deposits, payouts, or financial balances.
- Responsible-play information and clear age/jurisdiction notices.

## Mandatory gates before any real-money feature in another jurisdiction

1. Identify each target country and block unsupported jurisdictions.
2. Obtain a written legal opinion and the required operator licence/approval for the exact product and territory.
3. Contract only with a regulated payment provider that explicitly supports the licensed gambling use case and territory.
4. Complete KYC, age verification, sanctions screening, AML controls, source-of-funds checks, transaction monitoring, and reporting obligations.
5. Implement geolocation, self-exclusion, deposit/loss/time limits, cooling-off, complaints, and safer-gambling controls.
6. Obtain independent security, RNG/market integrity (as applicable), privacy, and compliance audits.
7. Keep the financial ledger, deposits, withdrawals, settlement, and dispute handling server-side with immutable audit trails and strict role separation.
8. Never use Supabase client-side code or service-role secrets in a browser to authorize money movement or settle wagers.

Until every gate is documented and approved, the production system must remain non-monetary.
