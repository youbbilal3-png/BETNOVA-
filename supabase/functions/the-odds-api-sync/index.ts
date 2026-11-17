import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const PROVIDER = "the-odds-api";
const API_BASE = "https://api.the-odds-api.com/v4";
const ALLOWED_SOCCER_KEYS = new Set([
  "soccer_epl",
  "soccer_germany_bundesliga",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_france_ligue_one",
  "soccer_uefa_champs_league",
]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-betnova-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}
function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function validOdd(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 && n < 1000 ? n : null;
}
function validTimestamp(value: unknown): string {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}
function normalize(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}
function selectionKey(side: string, point?: number): string {
  return point === undefined ? side : side + "_" + String(point).replace(".", "_");
}
class QuotaExhaustedError extends Error {}

async function providerGet(path: string, key: string) {
  const response = await fetch(API_BASE + path + (path.includes("?") ? "&" : "?") + "apiKey=" + encodeURIComponent(key), {
    headers: { "Accept": "application/json", "Accept-Encoding": "gzip" },
    signal: AbortSignal.timeout(20000),
  });
  const remainingHeader = response.headers.get("x-requests-remaining");
  const remaining = remainingHeader === null ? null : Number(remainingHeader);
  const raw = await response.text();
  let body: any;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const message = JSON.stringify(body?.message ?? body?.error ?? raw ?? response.status).slice(0, 400);
    if (/usage.?credits|quota|out of credits|insufficient credits/i.test(message) || response.status === 429) {
      throw new QuotaExhaustedError(message);
    }
    throw new Error("The Odds API request failed (" + response.status + "): " + message);
  }
  return { data: body, remaining: Number.isFinite(remaining) ? remaining : null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration is incomplete" }, 503);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: config, error: configError } = await supabase.rpc("betnova_get_odds_sync_config");
  if (configError || !config) return json({ error: "Secure odds provider configuration is unavailable" }, 503);
  const expected = String(config.sync_secret ?? "");
  if (!expected || !safeEqual(req.headers.get("x-betnova-sync-secret") ?? "", expected)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const apiKey = String(config.api_key ?? "");
  if (!apiKey) return json({ error: "Add the_odds_api_key to Supabase Vault before enabling odds sync" }, 503);

  try {
    const { data: sports, remaining: initialRemaining } = await providerGet("/sports", apiKey);
    const selectedSports = (Array.isArray(sports) ? sports : []).filter((sport: any) =>
      sport?.active === true &&
      String(sport?.group ?? "").toLowerCase().includes("soccer") &&
      ALLOWED_SOCCER_KEYS.has(String(sport?.key ?? ""))
    );
    const { data: football, error: footballError } = await supabase
      .from("sports").select("id").eq("slug", "football").eq("is_active", true).maybeSingle();
    if (footballError || !football) throw new Error("Football sport catalogue is not configured");

    const fixtureIds = new Map<string, string>();
    let fixturesSynced = 0, marketsUpdated = 0, selectionsUpdated = 0;
    let remaining = initialRemaining;
    let quotaExhausted = false;
    const providerErrors: string[] = [];

    async function storeEvent(event: any, sport: any): Promise<string | null> {
      const eventId = String(event?.id ?? "").trim();
      const homeName = String(event?.home_team ?? "").trim();
      const awayName = String(event?.away_team ?? "").trim();
      const startsAt = new Date(String(event?.commence_time ?? ""));
      if (!eventId || !homeName || !awayName || !Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
        return null;
      }
      const cacheKey = String(sport.key) + ":" + eventId;
      const cached = fixtureIds.get(cacheKey);
      if (cached) return cached;

      const teamExternal = (name: string) => String(sport.key) + ":" + normalize(name).replace(/[^a-z0-9]+/g, "-");
      const country = String(sport.group ?? "").replace(/^soccer\s*-\s*/i, "") || null;
      const [home, away, competition] = await Promise.all([
        supabase.from("teams").upsert({
          name: homeName, short_name: homeName.slice(0, 3).toUpperCase(), country,
          source_provider: PROVIDER, external_id: teamExternal(homeName),
        }, { onConflict: "source_provider,external_id" }).select("id").single(),
        supabase.from("teams").upsert({
          name: awayName, short_name: awayName.slice(0, 3).toUpperCase(), country,
          source_provider: PROVIDER, external_id: teamExternal(awayName),
        }, { onConflict: "source_provider,external_id" }).select("id").single(),
        supabase.from("competitions").upsert({
          sport_id: football.id, name: String(sport.title ?? sport.key), country,
          season: "", is_active: true, source_provider: PROVIDER, external_id: String(sport.key),
        }, { onConflict: "source_provider,external_id" }).select("id").single(),
      ]);
      if (home.error || away.error || competition.error) {
        throw new Error("Could not store teams or competition for " + sport.key);
      }
      const { data: fixture, error: fixtureError } = await supabase.from("fixtures").upsert({
        competition_id: competition.data.id,
        home_team_id: home.data.id,
        away_team_id: away.data.id,
        starts_at: startsAt.toISOString(),
        status: "scheduled",
        home_score: null,
        away_score: null,
        source_provider: PROVIDER,
        external_id: eventId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "source_provider,external_id" }).select("id").single();
      if (fixtureError || !fixture) throw new Error("Could not store fixture " + eventId);
      fixtureIds.set(cacheKey, fixture.id);
      fixturesSynced++;
      return fixture.id;
    }

    // Events are free on this plan. They keep the upcoming fixture list populated
    // even when the monthly odds-credit allowance has been used.
    for (const sport of selectedSports) {
      try {
        const { data: events } = await providerGet("/sports/" + encodeURIComponent(sport.key) + "/events", apiKey);
        for (const event of Array.isArray(events) ? events : []) {
          await storeEvent(event, sport);
        }
      } catch (error) {
        providerErrors.push(String(sport.key) + " events: " + (error instanceof Error ? error.message : "unknown error"));
      }
    }

    // One daily pass across six selected leagues, two markets, one EU region:
    // maximum planned consumption is 12 credits per day (about 360 per 30 days).
    // When credits run out, do not close markets or overwrite their last stored odds.
    for (const sport of selectedSports) {
      if (remaining !== null && remaining < 2) {
        quotaExhausted = true;
        break;
      }
      try {
        const { data: oddsEvents, remaining: nextRemaining } = await providerGet(
          "/sports/" + encodeURIComponent(sport.key) + "/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso",
          apiKey,
        );
        if (nextRemaining !== null) remaining = nextRemaining;

        for (const event of Array.isArray(oddsEvents) ? oddsEvents : []) {
          const fixtureId = await storeEvent(event, sport);
          if (!fixtureId) continue;
          const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
          const bookmaker = bookmakers.find((book: any) =>
            Array.isArray(book.markets) && book.markets.some((m: any) => m.key === "h2h" || m.key === "totals")
          );
          if (!bookmaker) continue;
          const updatedAt = validTimestamp(
            bookmaker.markets?.find((m: any) => m.key === "h2h")?.last_update ??
            bookmaker.markets?.find((m: any) => m.key === "totals")?.last_update ??
            bookmaker.last_update
          );

          const h2h = bookmaker.markets?.find((market: any) => market.key === "h2h");
          if (h2h) {
            const outcomes = Array.isArray(h2h.outcomes) ? h2h.outcomes : [];
            const byName = new Map(outcomes.map((item: any) => [normalize(item.name), validOdd(item.price)]));
            const homeOdd = byName.get(normalize(event.home_team));
            const awayOdd = byName.get(normalize(event.away_team));
            const drawOdd = byName.get("draw");
            if (homeOdd && awayOdd && drawOdd) {
              const name = "Match Winner · " + String(bookmaker.title ?? bookmaker.key ?? "EU bookmaker");
              const { data: existing } = await supabase.from("markets").select("id,status")
                .eq("fixture_id", fixtureId).eq("market_key", "match_result").eq("name", name).maybeSingle();
              if (!existing || existing.status === "open") {
                const payload = {
                  fixture_id: fixtureId, market_type: "match_result", market_key: "match_result",
                  name, settlement_rule: {}, is_live: false, is_active: true, status: "open",
                  source_provider: PROVIDER, external_id: String(event.id) + ":h2h:" + String(bookmaker.key),
                  last_updated_at: updatedAt,
                };
                const saved = existing
                  ? await supabase.from("markets").update(payload).eq("id", existing.id).eq("status", "open").select("id").single()
                  : await supabase.from("markets").insert(payload).select("id").single();
                if (!saved.error && saved.data) {
                  marketsUpdated++;
                  for (const pick of [
                    { name: "Home", key: "home", odds: homeOdd },
                    { name: "Draw", key: "draw", odds: drawOdd },
                    { name: "Away", key: "away", odds: awayOdd },
                  ]) {
                    const { data: old } = await supabase.from("market_selections").select("id,status,result_status")
                      .eq("market_id", saved.data.id).eq("selection_key", pick.key).maybeSingle();
                    if (old && (old.status !== "active" || old.result_status !== "pending")) continue;
                    const selection = {
                      market_id: saved.data.id, name: pick.name, selection_key: pick.key, odds: pick.odds,
                      status: "active", result_status: "pending", updated_at: updatedAt,
                    };
                    const result = old
                      ? await supabase.from("market_selections").update(selection).eq("id", old.id)
                      : await supabase.from("market_selections").insert(selection);
                    if (!result.error) selectionsUpdated++;
                  }
                }
              }
            }
          }

          const totals = bookmaker.markets?.find((market: any) => market.key === "totals");
          if (totals) {
            const byPoint = new Map<number, { over: number | null; under: number | null }>();
            for (const outcome of Array.isArray(totals.outcomes) ? totals.outcomes : []) {
              const point = Number(outcome.point);
              const odd = validOdd(outcome.price);
              if (!Number.isFinite(point) || !odd) continue;
              const side = normalize(outcome.name);
              if (side !== "over" && side !== "under") continue;
              const group = byPoint.get(point) ?? { over: null, under: null };
              group[side] = odd;
              byPoint.set(point, group);
            }
            for (const [point, picks] of byPoint) {
              if (!picks.over || !picks.under) continue;
              const marketName = "Total Goals " + point + " · " + String(bookmaker.title ?? bookmaker.key ?? "EU bookmaker");
              const { data: existing } = await supabase.from("markets").select("id,status")
                .eq("fixture_id", fixtureId).eq("market_key", "total_goals").eq("name", marketName).maybeSingle();
              if (existing && existing.status !== "open") continue;
              const payload = {
                fixture_id: fixtureId, market_type: "total_goals", market_key: "total_goals",
                name: marketName, settlement_rule: { line: point }, is_live: false, is_active: true,
                status: "open", source_provider: PROVIDER,
                external_id: String(event.id) + ":totals:" + String(point) + ":" + String(bookmaker.key),
                last_updated_at: updatedAt,
              };
              const saved = existing
                ? await supabase.from("markets").update(payload).eq("id", existing.id).eq("status", "open").select("id").single()
                : await supabase.from("markets").insert(payload).select("id").single();
              if (!saved.error && saved.data) {
                marketsUpdated++;
                for (const pick of [
                  { name: "Over " + point, key: selectionKey("over", point), odds: picks.over },
                  { name: "Under " + point, key: selectionKey("under", point), odds: picks.under },
                ]) {
                  const { data: old } = await supabase.from("market_selections").select("id,status,result_status")
                    .eq("market_id", saved.data.id).eq("selection_key", pick.key).maybeSingle();
                  if (old && (old.status !== "active" || old.result_status !== "pending")) continue;
                  const selection = {
                    market_id: saved.data.id, name: pick.name, selection_key: pick.key, odds: pick.odds,
                    status: "active", result_status: "pending", updated_at: updatedAt,
                  };
                  const result = old
                    ? await supabase.from("market_selections").update(selection).eq("id", old.id)
                    : await supabase.from("market_selections").insert(selection);
                  if (!result.error) selectionsUpdated++;
                }
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof QuotaExhaustedError) {
          quotaExhausted = true;
          break;
        }
        providerErrors.push(String(sport.key) + " odds: " + (error instanceof Error ? error.message : "unknown error"));
      }
    }

    return json({
      ok: true,
      provider: PROVIDER,
      sports_checked: selectedSports.length,
      fixtures_synced: fixturesSynced,
      markets_updated: marketsUpdated,
      selections_updated: selectionsUpdated,
      credits_remaining: remaining,
      quota_exhausted: quotaExhausted,
      stored_odds_policy: "Existing odds remain stored and open after quota exhaustion; new bets use the recorded price snapshot and are rejected automatically once kickoff has passed. Live betting is not enabled by this provider.",
      provider_errors: providerErrors.slice(0, 8),
    });
  } catch (error) {
    console.error("the-odds-api-sync", error);
    return json({ error: error instanceof Error ? error.message : "Odds sync failed" }, 502);
  }
});
