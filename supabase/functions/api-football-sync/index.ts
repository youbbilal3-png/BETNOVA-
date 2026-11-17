import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const PROVIDER = "api-football";
const API_BASE = "https://v3.football.api-sports.io";
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
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function day(offset: number) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
async function providerGet(path: string, key: string) {
  const response = await fetch(API_BASE + path, {
    headers: { "x-apisports-key": key, "Accept": "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok || (body.errors && Object.keys(body.errors).length)) {
    throw new Error("API-Football request failed: " + JSON.stringify(body.errors ?? body.message ?? response.status).slice(0, 500));
  }
  return body.response ?? [];
}
function fixtureStatus(short: string): string {
  if (["FT", "AET", "PEN"].includes(short)) return "finished";
  if (short === "PST") return "postponed";
  if (short === "CANC" || short === "ABD" || short === "AWD" || short === "WO") return "cancelled";
  if (["NS", "TBD"].includes(short)) return "scheduled";
  return "live";
}
function asOdd(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 && n < 1000 ? n : null;
}
function totalLine(value: string): string | null {
  const m = value.match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}
function selectionKey(side: string, line?: string) {
  return line ? side + "_" + line.replace(".", "_") : side;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("BETNOVA_SYNC_SECRET") ?? "";
  if (!expected) return json({ error: "BETNOVA_SYNC_SECRET is not configured" }, 503);
  if (!safeEqual(req.headers.get("x-betnova-sync-secret") ?? "", expected)) return json({ error: "Unauthorized" }, 401);
  const apiKey = Deno.env.get("API_FOOTBALL_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey || !supabaseUrl || !serviceKey) return json({ error: "Server configuration is incomplete" }, 503);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const from = day(0), to = day(7);
    const fixtures = await providerGet(`/fixtures?from=${from}&to=${to}&timezone=Africa%2FAlgiers`, apiKey);
    const { data: sport, error: sportError } = await supabase.from("sports").select("id").eq("slug", "football").eq("is_active", true).maybeSingle();
    if (sportError || !sport) throw new Error("Football sport catalogue is not configured");

    const fixtureIds = new Map<number, string>();
    let fixtureCount = 0;
    for (const item of fixtures) {
      const f = item.fixture, h = item.teams?.home, a = item.teams?.away, l = item.league;
      if (!f?.id || !h?.id || !a?.id || !l?.id || !f.date) continue;
      const [homeRes, awayRes, compRes] = await Promise.all([
        supabase.from("teams").upsert({
          name: h.name, short_name: h.name?.slice(0, 3)?.toUpperCase() ?? null, logo_url: h.logo ?? null,
          country: l.country ?? null, source_provider: PROVIDER, external_id: String(h.id),
        }, { onConflict: "source_provider,external_id" }).select("id").single(),
        supabase.from("teams").upsert({
          name: a.name, short_name: a.name?.slice(0, 3)?.toUpperCase() ?? null, logo_url: a.logo ?? null,
          country: l.country ?? null, source_provider: PROVIDER, external_id: String(a.id),
        }, { onConflict: "source_provider,external_id" }).select("id").single(),
        supabase.from("competitions").upsert({
          sport_id: sport.id, name: l.name, country: l.country ?? null, season: String(l.season ?? ""),
          is_active: true, source_provider: PROVIDER, external_id: String(l.id),
        }, { onConflict: "source_provider,external_id" }).select("id").single(),
      ]);
      if (homeRes.error || awayRes.error || compRes.error) throw new Error("Could not store provider teams or competition");
      const status = fixtureStatus(f.status?.short ?? "NS");
      const { data: stored, error: fixtureError } = await supabase.from("fixtures").upsert({
        competition_id: compRes.data.id, home_team_id: homeRes.data.id, away_team_id: awayRes.data.id,
        starts_at: f.date, status, home_score: item.goals?.home ?? null, away_score: item.goals?.away ?? null,
        source_provider: PROVIDER, external_id: String(f.id), updated_at: new Date().toISOString(),
      }, { onConflict: "source_provider,external_id" }).select("id").single();
      if (fixtureError || !stored) throw new Error("Could not store a provider fixture");
      fixtureIds.set(Number(f.id), stored.id);
      fixtureCount++;
    }

    let oddsFixtures = 0, marketCount = 0, selectionCount = 0;
    // Pre-match odds are refreshed for the next three calendar days. No odds are generated locally.
    for (const offset of [1, 2, 3]) {
      const oddsRows = await providerGet(`/odds?date=${day(offset)}&page=1`, apiKey);
      for (const row of oddsRows) {
        const externalFixtureId = Number(row.fixture?.id);
        let fixtureId = fixtureIds.get(externalFixtureId);
        if (!fixtureId) {
          const { data } = await supabase.from("fixtures").select("id").eq("source_provider", PROVIDER).eq("external_id", String(externalFixtureId)).maybeSingle();
          fixtureId = data?.id;
        }
        if (!fixtureId) continue;
        const bookmaker = row.bookmakers?.[0];
        if (!bookmaker) continue;
        let fixtureHadOdds = false;
        for (const bet of bookmaker.bets ?? []) {
          const betName = String(bet.name ?? "");
          const normalized = betName.toLowerCase();
          let marketKey: string | null = null;
          let marketName = "";
          let line: string | null = null;
          let accepted: { name: string; key: string; odds: number }[] = [];

          if (normalized.includes("match winner") || normalized === "1x2" || normalized === "winner") {
            marketKey = "match_result"; marketName = "Match Winner";
            accepted = (bet.values ?? []).flatMap((v: any) => {
              const label = String(v.value ?? "").trim().toLowerCase();
              const key = ["home", "1"].includes(label) ? "home" : ["draw", "x"].includes(label) ? "draw" : ["away", "2"].includes(label) ? "away" : "";
              const odd = asOdd(v.odd); return key && odd ? [{ name: key === "home" ? "Home" : key === "draw" ? "Draw" : "Away", key, odds: odd }] : [];
            });
          } else if ((normalized.includes("over/under") || normalized.includes("goals over")) && !normalized.includes("half")) {
            const values = bet.values ?? [];
            const parsed = values.map((v: any) => ({ raw: String(v.value ?? ""), odd: asOdd(v.odd) }))
              .filter((v: any) => v.odd && /^(over|under)\s+\d+(?:\.\d+)?$/i.test(v.raw));
            const lines = [...new Set(parsed.map((v: any) => totalLine(v.raw)).filter(Boolean))] as string[];
            for (const threshold of lines) {
              const picks = parsed.filter((v: any) => totalLine(v.raw) === threshold).map((v: any) => {
                const side = v.raw.toLowerCase().startsWith("over") ? "over" : "under";
                return { name: (side === "over" ? "Over " : "Under ") + threshold, key: selectionKey(side, threshold), odds: v.odd as number };
              });
              if (picks.length < 2) continue;
              const { data: existingMarket } = await supabase.from("markets").select("id,status").eq("fixture_id", fixtureId).eq("market_key", "total_goals").eq("name", "Total Goals " + threshold).maybeSingle();
              let marketId = existingMarket?.id;
              if (existingMarket?.status === "settled" || existingMarket?.status === "void") continue;
              if (!marketId) {
                const { data: created, error } = await supabase.from("markets").insert({
                  fixture_id: fixtureId, market_type: "total_goals", market_key: "total_goals",
                  name: "Total Goals " + threshold, settlement_rule: { line: threshold },
                  is_live: false, is_active: true, status: "open", source_provider: PROVIDER,
                  external_id: String(row.fixture.id) + ":" + String(bet.id) + ":" + threshold,
                }).select("id").single();
                if (error || !created) throw new Error("Could not create a total-goals market");
                marketId = created.id; marketCount++;
              } else {
                await supabase.from("markets").update({ status: "open", is_active: true, last_updated_at: new Date().toISOString() }).eq("id", marketId);
              }
              for (const pick of picks) {
                const { data: old } = await supabase.from("market_selections").select("id,result_status").eq("market_id", marketId).eq("selection_key", pick.key).maybeSingle();
                if (old?.result_status !== "pending") continue;
                if (old) await supabase.from("market_selections").update({ name: pick.name, odds: pick.odds, status: "active", updated_at: new Date().toISOString() }).eq("id", old.id);
                else await supabase.from("market_selections").insert({ market_id: marketId, name: pick.name, selection_key: pick.key, odds: pick.odds, status: "active" });
                selectionCount++;
              }
              fixtureHadOdds = true;
            }
            continue;
          }

          if (!marketKey || accepted.length < 2) continue;
          const { data: existingMarket } = await supabase.from("markets").select("id,status").eq("fixture_id", fixtureId).eq("market_key", marketKey).maybeSingle();
          if (existingMarket?.status === "settled" || existingMarket?.status === "void") continue;
          let marketId = existingMarket?.id;
          if (!marketId) {
            const { data: created, error } = await supabase.from("markets").insert({
              fixture_id: fixtureId, market_type: marketKey, market_key: marketKey,
              name: marketName + " · " + String(bookmaker.name ?? "Provider"),
              settlement_rule: {}, is_live: false, is_active: true, status: "open",
              source_provider: PROVIDER, external_id: String(row.fixture.id) + ":" + String(bet.id),
            }).select("id").single();
            if (error || !created) throw new Error("Could not create a match-winner market");
            marketId = created.id; marketCount++;
          } else {
            await supabase.from("markets").update({ status: "open", is_active: true, last_updated_at: new Date().toISOString() }).eq("id", marketId);
          }
          for (const pick of accepted) {
            const { data: old } = await supabase.from("market_selections").select("id,result_status").eq("market_id", marketId).eq("selection_key", pick.key).maybeSingle();
            if (old?.result_status !== "pending") continue;
            if (old) await supabase.from("market_selections").update({ name: pick.name, odds: pick.odds, status: "active", updated_at: new Date().toISOString() }).eq("id", old.id);
            else await supabase.from("market_selections").insert({ market_id: marketId, name: pick.name, selection_key: pick.key, odds: pick.odds, status: "active" });
            selectionCount++;
          }
          fixtureHadOdds = true;
        }
        if (fixtureHadOdds) oddsFixtures++;
      }
    }
    return json({
      ok: true, provider: PROVIDER, fixtures_synced: fixtureCount,
      odds_fixtures: oddsFixtures, markets_created: marketCount, selections_updated_or_created: selectionCount,
      source_note: "Only provider-supplied pre-match odds are stored. In-play markets remain disabled until a suitable live feed is configured.",
    });
  } catch (error) {
    console.error("api-football-sync", error);
    return json({ error: error instanceof Error ? error.message : "Provider sync failed" }, 502);
  }
});
