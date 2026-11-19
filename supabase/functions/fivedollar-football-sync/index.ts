import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const API = "https://api.5dollarfootballapi.com/v1";
const PROVIDER = "fivedollarfootballapi";
const MAX_ODDS_FIXTURES = 7;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-betnova-sync-secret",
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
function finiteScore(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}
function odd(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 1 && n < 1000 ? n : null;
}
function status(value: unknown): "scheduled" | "live" | "finished" | null {
  if (value === "scheduled") return "scheduled";
  if (value === "in_play") return "live";
  if (value === "finished") return "finished";
  return null; // Unknown is never interpreted as finished.
}
function normalized(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}
function safeDate(value: unknown): string | null {
  const d = new Date(String(value ?? ""));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function eventType(value: unknown): string | null {
  const v = String(value ?? "").toLowerCase();
  return ["goal", "corner", "yellow_card", "red_card", "penalty_awarded"].includes(v) ? v : null;
}
function period(value: unknown): string | null {
  const v = String(value ?? "").toLowerCase();
  if (["first_half", "1h", "period1"].includes(v)) return "first_half";
  if (["second_half", "2h", "period2"].includes(v)) return "second_half";
  if (v.includes("extra_time")) return v;
  return v || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration is incomplete" }, 503);
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: config, error: configError } = await supabase.rpc("betnova_get_fivedollar_config");
  if (configError || !config) return json({ error: "Secure FiveDollar provider configuration is unavailable" }, 503);
  const expected = String(config.sync_secret ?? "");
  if (!expected || !safeEqual(req.headers.get("x-betnova-sync-secret") ?? "", expected)) return json({ error: "Unauthorized" }, 401);
  const apiKey = String(config.api_key ?? "");
  if (!apiKey) return json({ error: "Add fivedollarfootball_api_key to Supabase Vault" }, 503);

  const notificationDispatchSecret = Deno.env.get("BETNOVA_NOTIFICATION_DISPATCH_SECRET") ?? "";
  async function dispatchVerifiedPush(eventId: string, verified = false) {
    if (!notificationDispatchSecret) return;
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-push-notifications`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
          "Content-Type": "application/json",
          "x-betnova-notification-secret": notificationDispatchSecret,
        },
        body: JSON.stringify({ event_id: eventId, verified }),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) console.error("Push dispatch returned", response.status);
    } catch (error) {
      console.error("Push dispatch failed without affecting FiveDollar sync", error);
    }
  }

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "prematch" || body?.mode === "finalize" || body?.mode === "status" || body?.mode === "catalogue" ? body.mode : "live";
  const requestedBatch = Number(body?.batch ?? 0);
  const batch = Number.isInteger(requestedBatch) ? Math.max(0, Math.min(9, requestedBatch)) : 0;
  let requests = 0;
  let rateLimited = false;
  const errors: string[] = [];
  let fixturesSynced = 0, marketsSynced = 0, selectionsSynced = 0, eventsSynced = 0, retractedGoals = 0;
  const fixtureCache = new Map<string, string>();
  const now = new Date();

  async function get(path: string): Promise<any> {
    const { data: allowed, error: budgetError } = await supabase.rpc("betnova_reserve_fivedollar_request");
    if (budgetError) throw new Error("Provider request budget unavailable");
    if (!allowed) { rateLimited = true; throw new Error("Local provider request budget reached"); }
    requests++;
    const response = await fetch(API + path, {
      headers: { "Authorization": "Bearer " + apiKey, "Accept": "application/json" },
      signal: AbortSignal.timeout(18000),
    });
    const raw = await response.text();
    let payload: any;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (!response.ok || payload?.success !== 1) {
      throw new Error("FiveDollar API HTTP " + response.status + ": " + String(payload?.error?.message ?? payload?.message ?? raw).slice(0, 220));
    }
    return payload.data;
  }

  if (mode === "status") {
    try {
      const providerStatus = await get("/status");
      return json({ ok: true, provider: PROVIDER, mode, provider_status: providerStatus, requests });
    } catch (error) {
      return json({ ok: false, provider: PROVIDER, mode, error: error instanceof Error ? error.message : "Status check failed" }, 502);
    }
  }

  if (mode === "catalogue") {
    try {
      const data = await get("/leagues?active_since=" + Math.floor(Date.now() / 1000));
      const leagues = Array.isArray(data) ? data : [];
      return json({ ok: true, provider: PROVIDER, mode, plan: config.plan ?? null, leagues: leagues.map((league: any) => ({
        id: league.id, name: league.name, country: league.country?.name ?? league.country ?? null,
        last_fixture_utc: league.last_fixture_utc ?? null,
      })), requests });
    } catch (error) {
      return json({ ok: false, provider: PROVIDER, mode, error: error instanceof Error ? error.message : "Catalogue check failed" }, 502);
    }
  }

  async function storeFixture(item: any): Promise<string | null> {
    const externalId = String(item?.id ?? "");
    const homeName = String(item?.teams?.home?.name ?? "").trim();
    const awayName = String(item?.teams?.away?.name ?? "").trim();
    const kickoff = safeDate(item?.kickoff_utc);
    const fixtureStatus = status(item?.status);
    if (!externalId || !homeName || !awayName || !kickoff || !fixtureStatus || normalized(homeName) === normalized(awayName)) return null;
    const cache = fixtureCache.get(externalId);
    if (cache) return cache;

    const [football, oldFixture] = await Promise.all([
      supabase.from("sports").select("id").eq("slug", "football").eq("is_active", true).maybeSingle(),
      supabase.from("fixtures").select("id,home_score,away_score,status").eq("source_provider", PROVIDER).eq("external_id", externalId).maybeSingle(),
    ]);
    if (football.error || !football.data) throw new Error("Football catalogue unavailable");
    if (oldFixture.error) throw new Error("Could not inspect existing FiveDollar fixture");
    if (oldFixture.data?.id) {
      fixtureCache.set(externalId, oldFixture.data.id);
      return oldFixture.data.id;
    }

    // Reuse an already-imported fixture from another provider when both team names
    // and kickoff match. This prevents duplicate match cards when odds providers overlap.
    const teamKey = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase().replace(/\\b(fc|cf|sc|ac|afc|club|football club)\\b/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim().replace(/\\s+/g, " ");
    const kickoffMs = new Date(kickoff).getTime();
    const { data: candidates, error: candidateError } = await supabase.from("fixtures")
      .select("id,starts_at,home_team:teams!fixtures_home_team_id_fkey(name),away_team:teams!fixtures_away_team_id_fkey(name)")
      .gte("starts_at", new Date(kickoffMs - 15 * 60 * 1000).toISOString())
      .lte("starts_at", new Date(kickoffMs + 15 * 60 * 1000).toISOString())
      .neq("status", "cancelled").limit(100);
    if (candidateError) throw new Error("Could not match provider fixture");
    const matched = (candidates ?? []).find((candidate: any) => {
      const home = Array.isArray(candidate.home_team) ? candidate.home_team[0] : candidate.home_team;
      const away = Array.isArray(candidate.away_team) ? candidate.away_team[0] : candidate.away_team;
      return teamKey(home?.name) === teamKey(homeName) && teamKey(away?.name) === teamKey(awayName);
    });
    if (matched?.id) {
      const { error: linkError } = await supabase.from("fivedollar_fixture_links").upsert({
        provider_fixture_id: externalId, fixture_id: matched.id, updated_at: now.toISOString(),
      }, { onConflict: "provider_fixture_id" });
      if (linkError) throw new Error("Could not link FiveDollar odds to the existing match");
      fixtureCache.set(externalId, matched.id);
      return matched.id;
    }

    const country = String(item?.league?.country ?? "").trim() || null;
    const competitionName = String(item?.league?.name ?? "Football").trim();
    const season = String(item?.league?.season ?? "");
    const [home, away, league] = await Promise.all([
      supabase.from("teams").upsert({
        name: homeName, short_name: homeName.slice(0, 3).toUpperCase(), country,
        source_provider: PROVIDER, external_id: String(item.teams.home.id ?? externalId + ":home"),
      }, { onConflict: "source_provider,external_id" }).select("id").single(),
      supabase.from("teams").upsert({
        name: awayName, short_name: awayName.slice(0, 3).toUpperCase(), country,
        source_provider: PROVIDER, external_id: String(item.teams.away.id ?? externalId + ":away"),
      }, { onConflict: "source_provider,external_id" }).select("id").single(),
      supabase.from("competitions").upsert({
        sport_id: football.data.id, name: competitionName, country, season, is_active: true,
        source_provider: PROVIDER, external_id: String(item?.league?.id ?? "league-unknown"),
      }, { onConflict: "source_provider,external_id" }).select("id").single(),
    ]);
    if (home.error || away.error || league.error) throw new Error("Could not store provider teams/league");
    const homeScore = finiteScore(item?.goals?.home);
    const awayScore = finiteScore(item?.goals?.away);
    const saved = await supabase.from("fixtures").upsert({
      competition_id: league.data.id, home_team_id: home.data.id, away_team_id: away.data.id,
      starts_at: kickoff, status: fixtureStatus,
      ...(homeScore !== null ? { home_score: homeScore } : {}),
      ...(awayScore !== null ? { away_score: awayScore } : {}),
      source_provider: PROVIDER, external_id: externalId, updated_at: now.toISOString(),
    }, { onConflict: "source_provider,external_id" }).select("id").single();
    if (saved.error || !saved.data) throw new Error("Could not upsert fixture " + externalId);
    fixtureCache.set(externalId, saved.data.id);
    fixturesSynced++;
    return saved.data.id;
  }

  function normalizeStatistics(raw: any): { home: Array<{key:string;label:string;value:any}>; away: Array<{key:string;label:string;value:any}> } | null {
    if (!raw) return null;
    const source = raw.statistics ?? raw;
    const home: Array<{key:string;label:string;value:any}> = [];
    const away: Array<{key:string;label:string;value:any}> = [];
    const add = (label: string, pair: any, prefix = "") => {
      if (!pair || typeof pair !== "object" || Array.isArray(pair)) return;
      const key = (prefix + label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!key || (!("home" in pair) && !("away" in pair))) return;
      const display = (side: "home" | "away") => label.toLowerCase().includes("possession") && pair[side] != null
        ? String(pair[side]) + "%" : pair[side] ?? null;
      if (pair.home !== undefined && pair.home !== null) home.push({ key, label: prefix + label.replace(/_/g," "), value: display("home") });
      if (pair.away !== undefined && pair.away !== null) away.push({ key, label: prefix + label.replace(/_/g," "), value: display("away") });
    };
    if (Array.isArray(source)) {
      for (const row of source) {
        const label = String(row?.name ?? row?.type ?? row?.label ?? "").trim();
        if (label) add(label, { home: row?.home ?? row?.home_value, away: row?.away ?? row?.away_value });
      }
    } else if (typeof source === "object") {
      for (const [label, value] of Object.entries(source)) {
        if (value && typeof value === "object" && !Array.isArray(value) && ("home" in value || "away" in value)) {
          add(label, value);
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
          const prefix = label === "first_half" ? "1st half · " : label === "second_half" ? "2nd half · " : label.replace(/_/g," ") + " · ";
          for (const [nestedLabel, pair] of Object.entries(value as Record<string,any>)) add(nestedLabel, pair, prefix);
        }
      }
    }
    return home.length || away.length ? { home, away } : null;
  }

  async function syncStatistics(item: any, fixtureId: string) {
    const statistics = normalizeStatistics(item?.statistics ?? item?.stats ?? item?.team_statistics);
    if (!statistics) return;
    const { error } = await supabase.from("fixture_statistics").upsert({
      fixture_id: fixtureId, provider: PROVIDER, statistics, updated_at: now.toISOString(),
    }, { onConflict: "fixture_id,provider" });
    if (error) errors.push("statistics " + item.id + ": " + error.message.slice(0, 120));
  }

  async function syncEvents(item: any, fixtureId: string) {
    if (!Array.isArray(item?.events)) {
      const { error: holdError } = await supabase.rpc("betnova_set_fixture_settlement_hold", {
        p_fixture_id: fixtureId, p_provider: PROVIDER,
        p_reason: "Provider event timeline is missing from the live fixture snapshot", p_hold: true,
      });
      if (holdError) throw new Error("Could not protect fixture with a settlement hold");
      errors.push("fixture held: live event timeline missing");
      return;
    }
    const homeId = String(item?.teams?.home?.id ?? "");
    const awayId = String(item?.teams?.away?.id ?? "");
    const currentGoalIds = new Set<string>();
    const events = item.events;
    const occurrences = new Map<string, number>();
    let eventTimelineChanged = false;
    const newlyObservedGoalIds: string[] = [];

    for (const event of events) {
      const type = eventType(event?.type);
      if (!type) continue;
      const side = event?.team === "home" ? "home" : event?.team === "away" ? "away" : null;
      const base = type + ":" + (side ?? "none");
      const occurrence = Number.isInteger(Number(event?.count)) && Number(event.count) > 0
        ? Number(event.count) : (occurrences.get(base) ?? 0) + 1;
      occurrences.set(base, Math.max(occurrences.get(base) ?? 0, occurrence));
      const providerEventId = String(item.id) + ":" + base + ":" + occurrence;
      if (type === "goal") currentGoalIds.add(providerEventId);
      const teamId = side === "home" ? homeId : side === "away" ? awayId : null;
      const teamUuid = teamId
        ? (await supabase.from("teams").select("id").eq("source_provider", PROVIDER).eq("external_id", teamId).maybeSingle()).data?.id ?? null
        : null;
      const minute = finiteScore(event?.minute);
      const added = finiteScore(event?.added_time ?? event?.added_minute);
      const occurredAt = minute === null ? now.toISOString() : new Date(new Date(item.kickoff_utc).getTime() + minute * 60000 + (occurrence % 60) * 1000).toISOString();
      const prior = await supabase.from("fixture_events").select("id").eq("provider", PROVIDER).eq("provider_event_id", providerEventId).maybeSingle();
      if (prior.error) throw new Error("Could not inspect existing provider event");
      if (!prior.data) {
        eventTimelineChanged = true;
        if (type === "goal") newlyObservedGoalIds.push(providerEventId);
      }
      const saved = await supabase.from("fixture_events").upsert({
        fixture_id: fixtureId, provider: PROVIDER, provider_event_id: providerEventId,
        event_type: type, period: period(event?.period), minute, added_time: added,
        team_id: teamUuid, player_id: event?.player?.id == null ? null : String(event.player.id),
        player_name: event?.player?.name ?? null,
        assist_player_name: event?.assist?.name ?? null,
        event_data: { source: "5DollarFootballAPI", source_event: event, side, confirmed: true },
        occurred_at: occurredAt,
      }, { onConflict: "provider,provider_event_id" });
      if (saved.error) errors.push("event " + providerEventId + ": " + saved.error.message.slice(0, 100));
      else eventsSynced++;
    }

    // Full-time is a distinct settlement event and is written only when the
    // provider explicitly reports the fixture finished.
    let newFullTimeEvent = false;
    let fullTimeEventId: string | null = null;
    if (item?.status === "finished") {
      const fullTimeId = String(item.id) + ":full_time";
      const priorFullTime = await supabase.from("fixture_events").select("id")
        .eq("provider", PROVIDER).eq("provider_event_id", fullTimeId).maybeSingle();
      if (priorFullTime.error) throw new Error("Could not inspect full-time event");
      newFullTimeEvent = !priorFullTime.data;
      const fullTime = await supabase.from("fixture_events").upsert({
        fixture_id: fixtureId, provider: PROVIDER, provider_event_id: fullTimeId,
        event_type: "full_time", period: "full_time",
        event_data: { source: PROVIDER, confirmed: true, final: true, home_score: finiteScore(item?.goals?.home), away_score: finiteScore(item?.goals?.away) },
        occurred_at: now.toISOString(),
      }, { onConflict: "provider,provider_event_id" })
        .select("id").maybeSingle();
      if (fullTime.error || !fullTime.data?.id) throw new Error("Could not store provider full-time event");
      fullTimeEventId = fullTime.data.id;
    }

    const [oldGoals, linkResult, fixtureResult] = await Promise.all([
      supabase.from("fixture_events").select("id,provider_event_id,event_type,event_data")
        .eq("fixture_id", fixtureId).eq("provider", PROVIDER).in("event_type", ["goal","goal_cancelled"]),
      supabase.from("fivedollar_fixture_links").select("processed_goal_snapshot,pending_retraction_ids,pending_retraction_observations")
        .eq("provider_fixture_id", String(item.id)).maybeSingle(),
      supabase.from("fixtures").select("home_score,away_score,status").eq("id", fixtureId).maybeSingle(),
    ]);
    if (oldGoals.error || linkResult.error || fixtureResult.error || !fixtureResult.data) {
      throw new Error("Could not inspect provider event checkpoint");
    }
    const link = linkResult.data;
    const previousSnapshot = Array.isArray(link?.processed_goal_snapshot) ? link.processed_goal_snapshot : [];
    const currentSnapshot = Array.from(currentGoalIds).sort().map(key => ({ key }));
    const removed = (oldGoals.data ?? []).filter((event:any) =>
      event.event_type === "goal" && !currentGoalIds.has(event.provider_event_id)
    );
    const scoreHome = finiteScore(fixtureResult.data.home_score);
    const scoreAway = finiteScore(fixtureResult.data.away_score);
    const activeGoalCount = currentGoalIds.size;
    const scoreConsistent = scoreHome !== null && scoreAway !== null && activeGoalCount === scoreHome + scoreAway;

    const existingHold = await supabase.from("fixture_settlement_holds").select("fixture_id")
      .eq("fixture_id", fixtureId).maybeSingle();
    if (existingHold.error) throw new Error("Could not inspect settlement hold");

    if (!scoreConsistent) {
      const { error: holdError } = await supabase.rpc("betnova_set_fixture_settlement_hold", {
        p_fixture_id: fixtureId, p_provider: PROVIDER,
        p_reason: "Live score and confirmed event list do not agree", p_hold: true,
      });
      if (holdError) throw new Error("Could not protect fixture with a settlement hold");
      errors.push("fixture held: score/event mismatch; waiting for a consistent provider snapshot");
      return;
    }

    let correctionConfirmed = false;
    if (removed.length > 0) {
      const removedIds = removed.map((event:any) => event.provider_event_id).sort();
      const priorPending = Array.isArray(link?.pending_retraction_ids) ? link.pending_retraction_ids : [];
      const sameMissingSet = JSON.stringify(priorPending.slice().sort()) === JSON.stringify(removedIds);
      const observations = sameMissingSet ? Number(link?.pending_retraction_observations ?? 0) + 1 : 1;
      const { error: holdError } = await supabase.rpc("betnova_set_fixture_settlement_hold", {
        p_fixture_id: fixtureId, p_provider: PROVIDER,
        p_reason: "A previously confirmed goal is missing from the provider event feed", p_hold: true,
      });
      if (holdError) throw new Error("Could not pause new bets while confirming a goal retraction");
      const { error: pendingError } = await supabase.from("fivedollar_fixture_links").upsert({
        provider_fixture_id: String(item.id), fixture_id: fixtureId,
        processed_goal_snapshot: previousSnapshot,
        pending_retraction_ids: removedIds,
        pending_retraction_observations: observations,
        last_event_sync_at: now.toISOString(), updated_at: now.toISOString(),
      }, { onConflict: "provider_fixture_id" });
      if (pendingError) throw new Error("Could not store pending goal retraction checkpoint");
      if (observations < 2) {
        errors.push("goal retraction awaiting a second consistent provider observation");
        return;
      }
      for (const event of removed) {
        const priorData = event.event_data && typeof event.event_data === "object" ? event.event_data : {};
        const { error } = await supabase.from("fixture_events").update({
          event_type: "goal_cancelled",
          event_data: { ...priorData, original_event_type: "goal", retracted: true, retracted_at: now.toISOString(), correction_source: PROVIDER },
        }).eq("id", event.id);
        if (error) throw new Error("Could not preserve retracted goal audit event");
      }
      retractedGoals += removed.length;
      correctionConfirmed = true;
    }

    const snapshotChanged = JSON.stringify(previousSnapshot) !== JSON.stringify(currentSnapshot);
    const needsReplay = snapshotChanged || eventTimelineChanged || correctionConfirmed || Boolean(existingHold.data) || newFullTimeEvent;
    if (needsReplay) {
      const { data: replay, error: replayError } = await supabase.rpc("betnova_replay_fixture_events", {
        p_fixture_id: fixtureId, p_provider: PROVIDER,
        p_reason: correctionConfirmed ? "Confirmed provider goal retraction" : "Provider event timeline update",
      });
      if (replayError || !replay?.ok) {
        const { error: holdError } = await supabase.rpc("betnova_set_fixture_settlement_hold", {
          p_fixture_id: fixtureId, p_provider: PROVIDER,
          p_reason: "Automatic event replay failed and requires safe retry", p_hold: true,
        });
        if (holdError) throw new Error("Replay failed and the fixture could not be protected from new bets");
        errors.push("automatic event replay failed; new bets remain paused for this match");
        return;
      }
    }

    const { error: linkError } = await supabase.from("fivedollar_fixture_links").upsert({
      provider_fixture_id: String(item.id), fixture_id: fixtureId,
      processed_goal_snapshot: currentSnapshot,
      pending_retraction_ids: [], pending_retraction_observations: 0,
      last_event_sync_at: now.toISOString(), updated_at: now.toISOString(),
    }, { onConflict: "provider_fixture_id" });
    if (linkError) errors.push("could not save provider event checkpoint");

    // The first snapshot establishes a baseline; only later newly observed goals
    // are eligible for alerts, and only after score/retraction reconciliation succeeds.
    if (link?.last_event_sync_at && newlyObservedGoalIds.length > 0) {
      const { data: goalRows, error: goalLookupError } = await supabase.from("fixture_events")
        .select("id,provider_event_id")
        .eq("fixture_id", fixtureId).eq("provider", PROVIDER).eq("event_type", "goal")
        .in("provider_event_id", newlyObservedGoalIds);
      if (goalLookupError) {
        errors.push("verified goals stored but notification lookup failed");
      } else {
        for (const goal of goalRows ?? []) await dispatchVerifiedPush(goal.id, true);
      }
    }
    if (newFullTimeEvent && fullTimeEventId) await dispatchVerifiedPush(fullTimeEventId);
  }

  async function saveMarket(fixtureId: string, isLive: boolean, key: string, name: string, line: number | null, picks: Array<{name:string;key:string;price:unknown}>, period: string | null = null) {
    const usable = picks.map(p => ({...p, odds: odd(p.price)})).filter(p => p.odds !== null) as Array<{name:string;key:string;price:unknown;odds:number}>;
    if (usable.length !== picks.length || !usable.length) return;
    const marketKey = key;
    const { data: existing, error: findError } = await supabase.from("markets").select("id,status")
      .eq("fixture_id", fixtureId).eq("market_key", marketKey).eq("name", name).maybeSingle();
    if (findError) throw findError;
    if (existing && !["open", "suspended"].includes(existing.status)) return; // Never overwrite a settled market; allow fresh live prices to reopen suspended markets.
    const timestamp = now.toISOString();
    const marketPayload = {
      fixture_id: fixtureId, market_type: marketKey, market_key: marketKey, name,
      settlement_rule: { ...(line === null ? {} : { line }), ...(period ? { period } : {}) },
      is_live: isLive, is_active: true, status: "open",
      source_provider: PROVIDER, external_id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      last_updated_at: timestamp,
    };
    const saved = existing
      ? await supabase.from("markets").update(marketPayload).eq("id", existing.id).in("status", ["open", "suspended"]).select("id").single()
      : await supabase.from("markets").insert(marketPayload).select("id").single();
    if (saved.error || !saved.data) return;
    marketsSynced++;
    for (const pick of usable) {
      const { data: oldSelection, error: oldSelectionError } = await supabase.from("market_selections")
        .select("id,status,result_status").eq("market_id", saved.data.id).eq("selection_key", pick.key).maybeSingle();
      if (oldSelectionError) {
        errors.push("selection lookup: " + oldSelectionError.message.slice(0, 100));
        continue;
      }
      // Never reactivate or rewrite a selection that has already been settled.
      if (oldSelection && (oldSelection.status !== "active" || oldSelection.result_status !== "pending")) continue;
      const selectionPayload = {
        market_id: saved.data.id, name: pick.name, selection_key: pick.key,
        odds: pick.odds, status: "active", result_status: "pending", updated_at: timestamp,
      };
      const result = oldSelection
        ? await supabase.from("market_selections").update(selectionPayload).eq("id", oldSelection.id)
        : await supabase.from("market_selections").insert(selectionPayload);
      if (result.error) errors.push("selection: " + result.error.message.slice(0, 100));
      else selectionsSynced++;
    }
  }

  async function syncOdds(item: any, fixtureId: string, isLive: boolean) {
    const response = await get("/fixtures/" + encodeURIComponent(String(item.id)) + "/odds");
    const books = Array.isArray(response?.bookmakers) ? response.bookmakers : [];
    const bet365 = books.find((book: any) => normalized(book?.slug) === "bet365") ?? books[0];
    const odds = bet365?.odds;
    if (!odds) return;
    const priceSet = (market: any) => isLive ? market?.inplay : (market?.closing ?? market?.opening);

    const result = priceSet(odds["1x2"]);
    if (result) {
      await saveMarket(fixtureId, isLive, "match_result", "Match Winner · Bet365", null, [
        { name: "Home", key: "home", price: result.home },
        { name: "Draw", key: "draw", price: result.draw },
        { name: "Away", key: "away", price: result.away },
      ]);
    }

    // Only publish individually quoted fixed goal lines. Never synthesize prices.
    const fixedGoals = Array.isArray(odds.goal_line_fixed) ? odds.goal_line_fixed : [];
    const fixedLineNumbers = new Set<number>(fixedGoals.map((row: any) => Number(row?.line)).filter((line: number) => Number.isFinite(line)));
    for (const row of fixedGoals) {
      const line = Number(row?.line);
      if (!Number.isFinite(line) || line < 0.5 || line > 9.5 || Math.round(line * 2) !== line * 2) continue;
      const prices = isLive ? row?.inplay : row?.closing;
      if (!prices) continue;
      const key = line.toFixed(1).replace(".", "_");
      await saveMarket(fixtureId, isLive, "total_goals", "Total Goals · " + line + " · Bet365", line, [
        { name: "Over " + line, key: "over_" + key, price: prices.over },
        { name: "Under " + line, key: "under_" + key, price: prices.under },
      ]);
    }

    // Quarter-goal lines are intentionally not offered until split-stake settlement is supported.
    const goals = priceSet(odds.goal_line ?? odds.goalline);
    if (goals && Number.isFinite(Number(goals.line)) && Math.round(Number(goals.line) * 2) === Number(goals.line) * 2 && !fixedLineNumbers.has(Number(goals.line))) {
      const line = Number(goals.line);
      const key = line.toFixed(1).replace(".", "_");
      await saveMarket(fixtureId, isLive, "total_goals", "Main Total Goals · " + line + " · Bet365", line, [
        { name: "Over " + line, key: "over_" + key, price: goals.over },
        { name: "Under " + line, key: "under_" + key, price: goals.under },
      ]);
    }

    const firstHalfGoals = priceSet(odds.goal_line_half);
    if (firstHalfGoals && Number.isFinite(Number(firstHalfGoals.line)) && Math.round(Number(firstHalfGoals.line) * 2) === Number(firstHalfGoals.line) * 2) {
      const line = Number(firstHalfGoals.line);
      const key = line.toFixed(1).replace(".", "_");
      await saveMarket(fixtureId, isLive, "total_goals", "1st Half Goals · " + line + " · Bet365", line, [
        { name: "Over " + line, key: "over_" + key, price: firstHalfGoals.over },
        { name: "Under " + line, key: "under_" + key, price: firstHalfGoals.under },
      ], "first_half");
    }

    const handicap = priceSet(odds.asian_handicap);
    if (handicap && Number.isFinite(Number(handicap.line)) && Math.round(Number(handicap.line) * 2) === Number(handicap.line) * 2) {
      const line = Number(handicap.line);
      const formatLine = (value: number) => (value > 0 ? "+" : "") + value.toFixed(1);
      await saveMarket(fixtureId, isLive, "asian_handicap", "Asian Handicap · " + formatLine(line) + " · Bet365", line, [
        { name: "Home " + formatLine(line), key: "home", price: handicap.home },
        { name: "Away " + formatLine(-line), key: "away", price: handicap.away },
      ]);
    }

    const firstHalfHandicap = priceSet(odds.asian_handicap_half);
    if (firstHalfHandicap && Number.isFinite(Number(firstHalfHandicap.line)) && Math.round(Number(firstHalfHandicap.line) * 2) === Number(firstHalfHandicap.line) * 2) {
      const line = Number(firstHalfHandicap.line);
      const formatLine = (value: number) => (value > 0 ? "+" : "") + value.toFixed(1);
      await saveMarket(fixtureId, isLive, "asian_handicap", "1st Half Asian Handicap · " + formatLine(line) + " · Bet365", line, [
        { name: "Home " + formatLine(line), key: "home", price: firstHalfHandicap.home },
        { name: "Away " + formatLine(-line), key: "away", price: firstHalfHandicap.away },
      ], "first_half");
    }

    const cornerHandicap = priceSet(odds.corner_asian);
    if (cornerHandicap && Number.isFinite(Number(cornerHandicap.line)) && Math.round(Number(cornerHandicap.line) * 2) === Number(cornerHandicap.line) * 2) {
      const line = Number(cornerHandicap.line);
      const formatLine = (value: number) => (value > 0 ? "+" : "") + value.toFixed(1);
      await saveMarket(fixtureId, isLive, "corner_asian", "Asian Handicap Corners · " + formatLine(line) + " · Bet365", line, [
        { name: "Home " + formatLine(line), key: "home", price: cornerHandicap.home },
        { name: "Away " + formatLine(-line), key: "away", price: cornerHandicap.away },
      ]);
    }

    const btts = priceSet(odds.btts);
    if (btts) {
      await saveMarket(fixtureId, isLive, "both_teams_score", "Both Teams To Score · Bet365", null, [
        { name: "Yes", key: "yes", price: btts.yes },
        { name: "No", key: "no", price: btts.no },
      ]);
    }

    const corners = priceSet(odds.corner_line);
    if (corners && Number.isFinite(Number(corners.line)) && Math.round(Number(corners.line) * 2) === Number(corners.line) * 2) {
      const line = Number(corners.line);
      const key = line.toFixed(1).replace(".", "_");
      await saveMarket(fixtureId, isLive, "total_corners", "Total Corners · " + line + " · Bet365", line, [
        { name: "Over " + line, key: "over_" + key, price: corners.over },
        { name: "Under " + line, key: "under_" + key, price: corners.under },
      ]);
    }

    const firstHalfCorners = priceSet(odds.corner_line_half);
    if (firstHalfCorners && Number.isFinite(Number(firstHalfCorners.line)) && Math.round(Number(firstHalfCorners.line) * 2) === Number(firstHalfCorners.line) * 2) {
      const line = Number(firstHalfCorners.line);
      const key = line.toFixed(1).replace(".", "_");
      await saveMarket(fixtureId, isLive, "total_corners", "1st Half Total Corners · " + line + " · Bet365", line, [
        { name: "Over " + line, key: "over_" + key, price: firstHalfCorners.over },
        { name: "Under " + line, key: "under_" + key, price: firstHalfCorners.under },
      ], "first_half");
    }

    // Card markets are deliberately withheld until the provider's card-count
    // settlement convention (yellow/red weighting and dismissals) is implemented.
    // Never expose a market that the trusted event processor cannot settle safely.
  }

  let prematchLeagueName: string | null = null;
  let prematchLeagueId: string | null = null;
  let prematchOffset = batch * 5;

  try {
    let fixtures: any[] = [];
    if (mode === "live") {
      const data = await get("/fixtures?status=live&include=events,stats&per_page=50");
      fixtures = Array.isArray(data) ? data : [];
    } else if (mode === "finalize") {
      const end = Math.floor(Date.now() / 1000);
      const start = end - 24 * 60 * 60;
      const data = await get("/fixtures?status=finished&start_time=" + start + "&end_time=" + end + "&include=events,stats&per_page=50");
      fixtures = Array.isArray(data) ? data : [];
    } else {
      const start = Math.floor(Date.now() / 1000);
      // Unlike /fixtures (a 24-hour window), the league fixture endpoint can
      // return the whole upcoming week. The league catalogue is plan-scoped:
      // Free gives the top five; Community Access adds its chosen country pack.
      const end = start + 7 * 24 * 60 * 60;
      const leagueData = await get("/leagues?active_since=" + start);
      const leagues = (Array.isArray(leagueData) ? leagueData : [])
        .filter((league: any) => league?.id !== undefined && league?.id !== null)
        .sort((a: any, b: any) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id)));
      if (leagues.length) {
        const leagueIndex = batch % leagues.length;
        const selectedLeague = leagues[leagueIndex];
        prematchLeagueName = String(selectedLeague.name ?? selectedLeague.id);
        prematchLeagueId = String(selectedLeague.id);
        prematchOffset = Math.floor(batch / leagues.length) * 5;
        const data = await get("/leagues/" + encodeURIComponent(String(selectedLeague.id)) +
          "/fixtures?status=scheduled&start_time=" + start + "&end_time=" + end +
          "&order=asc&per_page=100");
        fixtures = Array.isArray(data) ? data : [];
      } else {
        // Fallback for an empty provider catalogue; keep the previous safe window.
        const data = await get("/fixtures?status=scheduled&start_time=" + start +
          "&end_time=" + (start + 24 * 60 * 60) + "&per_page=100");
        fixtures = Array.isArray(data) ? data : [];
      }
    }

    const fixturesToProcess = mode === "prematch"
      ? fixtures.slice(prematchOffset, prematchOffset + 5)
      : fixtures;
    const stored: Array<{item:any;id:string}> = [];
    for (const item of fixturesToProcess) {
      const id = await storeFixture(item);
      if (!id) continue;
      stored.push({ item, id });
      await syncStatistics(item, id);
      if (mode === "live" || mode === "finalize") await syncEvents(item, id);
    }

    // Free/Community plans expose live Bet365 prices per fixture. The live endpoint
    // costs one request plus one request per selected fixture. Seven fixtures every
    // ten minutes use at most 48 requests/hour, below the local 50/hour and provider 60/hour caps.
    // Rotate across the provider's live fixture list so later matches are not starved.
    let oddsTargets: Array<{item:any;id:string}> = [];
    if (mode === "live" && stored.length) {
      const { data: cursorState, error: cursorReadError } = await supabase.from("fivedollar_live_odds_state")
        .select("fixture_cursor").eq("id",1).maybeSingle();
      if (cursorReadError) throw cursorReadError;
      const cursor = Number(cursorState?.fixture_cursor ?? 0) % stored.length;
      const count = Math.min(MAX_ODDS_FIXTURES, stored.length);
      oddsTargets = Array.from({length:count},(_,i)=>stored[(cursor+i)%stored.length]);
      const nextCursor = (cursor + count) % stored.length;
      const { error: cursorWriteError } = await supabase.from("fivedollar_live_odds_state")
        .upsert({id:1,fixture_cursor:nextCursor,last_run_at:now.toISOString(),last_selected:count},{onConflict:"id"});
      if (cursorWriteError) throw cursorWriteError;
    } else if (mode === "prematch") {
      oddsTargets = stored;
    }
    for (const target of oddsTargets) {
      try { await syncOdds(target.item, target.id, mode === "live"); }
      catch (error) { errors.push("odds " + target.item.id + ": " + (error instanceof Error ? error.message : "unknown").slice(0, 150)); }
    }

    if (mode === "live") {
      const staleBefore = new Date(Date.now() - 12 * 60 * 1000).toISOString();
      const { error } = await supabase.from("markets").update({ status: "suspended", suspended_at: now.toISOString() })
        .eq("source_provider", PROVIDER).eq("is_live", true).eq("status", "open").lt("last_updated_at", staleBefore);
      if (error) errors.push("stale live market suspension: " + error.message.slice(0, 120));
    }

    return json({
      ok: true, provider: PROVIDER, mode, batch,
      fixtures_received: fixtures.length, fixtures_selected: fixturesToProcess.length, fixtures_synced: fixturesSynced,
      events_synced: eventsSynced, retracted_goals_recorded: retractedGoals,
      markets_synced: marketsSynced, selections_synced: selectionsSynced,
      live_odds_targets: oddsTargets.length,
      provider_requests: requests, local_rate_limited: rateLimited,
      prematch_league: prematchLeagueName, prematch_league_id: prematchLeagueId,
      prematch_window_days: mode === "prematch" ? 7 : null,
      errors: errors.slice(0, 10),
      settlement_policy: "Live goals and full-time results are replayed after score/event consistency checks. A missing goal must be absent from two consecutive consistent snapshots before automatic VAR correction; the fixture is held from new bets during confirmation, then markets and payouts are automatically reconciled using the immutable wallet audit ledger.",
    });
  } catch (error) {
    return json({
      ok: false, provider: PROVIDER, mode, provider_requests: requests, local_rate_limited: rateLimited,
      error: error instanceof Error ? error.message : "Sync failed", errors: errors.slice(0, 10),
    }, 502);
  }
});
