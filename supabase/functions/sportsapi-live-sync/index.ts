import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const API_BASE = "https://api.sportsapi.app/v2";
const PROVIDER = "sportsapi";
const DAILY_REQUEST_LIMIT = 95;
const MAX_REQUESTS_PER_RUN = 8;
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
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function integer(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}

function mapPeriod(value: unknown): string | null {
  const p = String(value ?? "").toLowerCase();
  if (["period1", "first_half", "1h", "firsthalf"].includes(p)) return "first_half";
  if (["period2", "second_half", "2h", "secondhalf"].includes(p)) return "second_half";
  if (["extra_time_period1", "extratime1", "et1"].includes(p)) return "extra_time_first_half";
  if (["extra_time_period2", "extratime2", "et2"].includes(p)) return "extra_time_second_half";
  return p || null;
}

function stableGoalKeys(providerFixtureId: number, goals: any[]): string[] {
  const occurrences = new Map<string, number>();
  return goals.map((event) => {
    const side = event?.side === "home" || event?.side === "away" ? event.side : "-";
    const minute = event?.minute != null && Number.isInteger(Number(event.minute)) ? String(Number(event.minute)) : "-";
    const added = event?.addedMinute == null ? "0" : (Number.isInteger(Number(event.addedMinute)) ? String(Number(event.addedMinute)) : "0");
    const base = `goal:${side}:${minute}:${added}`;
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    return `${providerFixtureId}:${occurrence === 1 ? base : `${base}#${occurrence}`}`.slice(0, 160);
  });
}

function goalSnapshot(goals: any[], keys: string[]) {
  return goals.map((goal, index) => ({
    key: keys[index],
    side: goal?.side ?? null,
    minute: goal?.minute ?? null,
    addedMinute: goal?.addedMinute ?? null,
    period: goal?.period ?? null,
    detail: goal?.detail ?? null,
    playerId: goal?.player?.id == null ? null : String(goal.player.id),
    playerName: goal?.player?.name ?? goal?.playerName ?? null,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration is incomplete" }, 503);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: config, error: configError } = await supabase.rpc("betnova_get_sportsapi_live_config");
  if (configError || !config) return json({ error: "Secure live-score configuration is unavailable" }, 503);
  const expectedSecret = String(config.sync_secret ?? "");
  if (!expectedSecret || !safeEqual(req.headers.get("x-betnova-sync-secret") ?? "", expectedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const apiKey = String(config.api_key ?? "");
  if (!apiKey) return json({ error: "Add sportsapi_live_api_key to Supabase Vault to activate live scores" }, 503);

  async function dispatchVerifiedPush(eventId: string, verified = false) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-push-notifications`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_id: eventId, verified }),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) console.error("Push dispatch returned", response.status);
    } catch (error) {
      console.error("Push dispatch failed without affecting live sync", error);
    }
  }

  async function recordMatchStart(fixtureId: string, providerFixtureId: number, occurredAt: string) {
    const { data: event, error } = await supabase.from("fixture_events")
      .upsert({
        fixture_id: fixtureId,
        provider: PROVIDER,
        provider_event_id: providerFixtureId + ":match_start",
        event_type: "match_start",
        period: "match_start",
        event_data: { source: PROVIDER, confirmed: true },
        occurred_at: occurredAt,
      }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true })
      .select("id").maybeSingle();
    if (error) {
      console.error("Could not store match-start event", error.message);
      return;
    }
    if (event?.id) await dispatchVerifiedPush(event.id);
  }

  let requestsMade = 0;
  let quotaLimited = false;
  let providerLimited = false;
  let providerErrors: string[] = [];
  let fixturesMatched = 0;
  let fixturesCreated = 0;
  let fixturesUnmatched = 0;
  let goalsInserted = 0;
  let marketsProcessed = 0;
  let finalized = 0;

  async function providerGet(path: string): Promise<any | null> {
    if (requestsMade >= MAX_REQUESTS_PER_RUN || quotaLimited || providerLimited) return null;
    const { data: allowed, error: reserveError } = await supabase.rpc(
      "betnova_reserve_sportsapi_request",
      { p_daily_limit: DAILY_REQUEST_LIMIT },
    );
    if (reserveError || allowed !== true) {
      quotaLimited = true;
      return null;
    }
    requestsMade++;
    try {
      const response = await fetch(API_BASE + path, {
        headers: { "Authorization": "Bearer " + apiKey, "Accept": "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 429) {
        providerLimited = true;
        return null;
      }
      const raw = await response.text();
      let body: any = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      if (!response.ok) {
        providerErrors.push("provider HTTP " + response.status);
        return null;
      }
      return body?.data ?? null;
    } catch {
      providerErrors.push("provider request timed out or failed");
      return null;
    }
  }

  async function invalidateLivePrices(fixtureId: string) {
    const { data: openLiveMarkets, error: lookupError } = await supabase.from("markets")
      .select("id").eq("fixture_id", fixtureId).eq("is_live", true).eq("status", "open").limit(1);
    if (lookupError) {
      providerErrors.push("could not inspect live prices before a score change: " + lookupError.message.slice(0, 120));
      return;
    }
    if (!openLiveMarkets?.length) return;
    const staleTime = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const { error } = await supabase.from("markets")
      .update({ last_updated_at: staleTime })
      .eq("fixture_id", fixtureId).eq("is_live", true).eq("status", "open")
      .gt("last_updated_at", staleTime);
    if (error) providerErrors.push("could not expire live prices for a score change: " + error.message.slice(0, 120));
  }

  async function getFixture(fixtureId: string) {
    const { data, error } = await supabase.from("fixtures")
      .select("id,home_team_id,away_team_id,home_score,away_score,status")
      .eq("id", fixtureId).maybeSingle();
    if (error || !data) return null;
    return data;
  }

  async function createLiveFixture(
    item: any, providerFixtureId: number, homeName: string, awayName: string,
    startTime: Date, homeScore: number, awayScore: number,
  ): Promise<string | null> {
    const { data: football, error: sportError } = await supabase.from("sports")
      .select("id").eq("slug", "football").eq("is_active", true).maybeSingle();
    if (sportError || !football?.id) {
      providerErrors.push("could not load football catalogue for an unmatched live fixture");
      return null;
    }
    const slug = (value: string) => value.toLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const homeExternal = String(item?.home?.id ?? "name:" + slug(homeName));
    const awayExternal = String(item?.away?.id ?? "name:" + slug(awayName));
    const country = String(item?.tournament?.country ?? item?.competition?.country ?? "").trim() || null;
    const competitionName = String(item?.tournament?.name ?? item?.competition?.name ?? item?.league?.name ?? "Live Matches").trim();
    const competitionExternal = String(item?.tournament?.id ?? item?.competition?.id ?? item?.league?.id ?? "live-feed");
    const resolveTeam = async (name: string, side: any, externalId: string) => {
      const { data: branded } = await supabase.from("teams").select("id")
        .eq("name", name).not("logo_url", "is", null).limit(1).maybeSingle();
      if (branded?.id) return { data: { id: branded.id }, error: null };
      return await supabase.from("teams").upsert({
        name, short_name: String(side?.shortName ?? name.slice(0, 3)).slice(0, 12),
        country: String(side?.country ?? country ?? "").trim() || null,
        source_provider: PROVIDER, external_id: externalId,
      }, { onConflict: "source_provider,external_id" }).select("id").single();
    };
    const [home, away, competition] = await Promise.all([
      resolveTeam(homeName, item?.home, homeExternal),
      resolveTeam(awayName, item?.away, awayExternal),
      supabase.from("competitions").upsert({
        sport_id: football.id, name: competitionName, country,
        season: String(startTime.getUTCFullYear()), is_active: true,
        source_provider: PROVIDER, external_id: competitionExternal,
      }, { onConflict: "source_provider,external_id" }).select("id").single(),
    ]);
    if (home.error || away.error || competition.error || !home.data?.id || !away.data?.id || !competition.data?.id) {
      providerErrors.push("could not create catalogue records for an unmatched live fixture");
      return null;
    }
    const saved = await supabase.from("fixtures").upsert({
      competition_id: competition.data.id, home_team_id: home.data.id, away_team_id: away.data.id,
      starts_at: startTime.toISOString(), status: "live", home_score: homeScore, away_score: awayScore,
      source_provider: PROVIDER, external_id: String(providerFixtureId), updated_at: new Date().toISOString(),
    }, { onConflict: "source_provider,external_id" }).select("id").single();
    if (saved.error || !saved.data?.id) {
      providerErrors.push("could not create the unmatched live fixture");
      return null;
    }
    return saved.data.id;
  }

  async function holdSportsApiFixture(providerFixtureId: number, reason: string) {
    const { error } = await supabase.from("sportsapi_fixture_links")
      .update({ settlement_hold: true, updated_at: new Date().toISOString() })
      .eq("provider_fixture_id", providerFixtureId);
    if (error) providerErrors.push("could not apply live settlement hold: " + reason);
  }

  async function processGoalList(
    providerFixtureId: number,
    fixture: any,
    link: any,
    providerEvents: any[],
    finalScore: { home: number; away: number },
    baselineOnly = false,
  ): Promise<{ ok: boolean; processed: number; lastGoalCount: number; baselineReady: boolean; hold: boolean }> {
    const activeGoals = providerEvents.filter((event: any) =>
      event?.type === "goal" && (event?.side === "home" || event?.side === "away")
    );
    const expectedGoals = finalScore.home + finalScore.away;

    if (activeGoals.length !== expectedGoals) {
      await supabase.from("sportsapi_fixture_links")
        .update({ settlement_hold: true, updated_at: new Date().toISOString() })
        .eq("provider_fixture_id", providerFixtureId);
      return {
        ok: false, processed: 0,
        lastGoalCount: Number(link.last_processed_goal_count ?? 0),
        baselineReady: Boolean(link.baseline_ready), hold: true,
      };
    }

    const lastProcessed = Number(link.last_processed_goal_count ?? 0);
    const settledCount = Number(link.settled_goal_count ?? 0);
    const baselineReady = Boolean(link.baseline_ready);
    const stableKeys = stableGoalKeys(providerFixtureId, activeGoals);
    const currentSnapshot = goalSnapshot(activeGoals, stableKeys);
    const previousSnapshot = Array.isArray(link.processed_goal_snapshot) ? link.processed_goal_snapshot : [];

    if (!baselineOnly && baselineReady && lastProcessed > 0 && previousSnapshot.length !== lastProcessed) {
      await supabase.from("sportsapi_fixture_links")
        .update({ settlement_hold: true, updated_at: new Date().toISOString() })
        .eq("provider_fixture_id", providerFixtureId);
      providerErrors.push("prior confirmed-goal snapshot is incomplete; correction remains safely paused");
      return { ok: false, processed: 0, lastGoalCount: lastProcessed, baselineReady, hold: true };
    }

    const priorPrefix = previousSnapshot.slice(0, lastProcessed);
    const currentPrefix = currentSnapshot.slice(0, lastProcessed);
    const prefixChanged = !baselineOnly && baselineReady && lastProcessed > 0 &&
      (priorPrefix.length !== lastProcessed || JSON.stringify(priorPrefix) !== JSON.stringify(currentPrefix));
    const removedByCount = !baselineOnly && baselineReady && lastProcessed > activeGoals.length;
    const isCorrection = prefixChanged || removedByCount;

    if (isCorrection) {
      const currentKeys = new Set(stableKeys);
      const removedKeys = previousSnapshot.slice(0, lastProcessed)
        .map((item: any) => String(item?.key ?? ""))
        .filter((key: string) => key.length > 0 && !currentKeys.has(key));

      const { error: reopenError } = await supabase.rpc(
        "betnova_reopen_fixture_for_correction", { p_fixture_id: fixture.id },
      );
      if (reopenError) {
        providerErrors.push("automatic correction could not reopen the affected settlement graph");
        await supabase.from("sportsapi_fixture_links")
          .update({ settlement_hold: true, updated_at: new Date().toISOString() })
          .eq("provider_fixture_id", providerFixtureId);
        return { ok: false, processed: 0, lastGoalCount: lastProcessed, baselineReady, hold: true };
      }

      if (removedKeys.length > 0) {
        const { error: cancelError } = await supabase.from("fixture_events")
          .update({ event_type: "goal_cancelled" })
          .eq("fixture_id", fixture.id).eq("provider", PROVIDER)
          .in("provider_event_id", removedKeys);
        if (cancelError) {
          providerErrors.push("removed goal events could not be marked as cancelled");
          await supabase.from("sportsapi_fixture_links")
            .update({ settlement_hold: true, updated_at: new Date().toISOString() })
            .eq("provider_fixture_id", providerFixtureId);
          return { ok: false, processed: 0, lastGoalCount: lastProcessed, baselineReady, hold: true };
        }
      }
    }

    const startIndex = baselineOnly || !baselineReady || isCorrection ? 0 : lastProcessed;
    const storedEvents: Array<{ id: string }> = [];
    let inserted = 0;
    let settled = 0;
    let goalEventsProcessed = 0;

    // Persist the full confirmed set first so replayed markets see one consistent snapshot.
    for (let i = startIndex; i < activeGoals.length; i++) {
      const goal = activeGoals[i];
      const teamId = goal.side === "home" ? fixture.home_team_id : fixture.away_team_id;
      const eventAt = goal.at && Number.isFinite(Date.parse(String(goal.at)))
        ? new Date(String(goal.at)).toISOString() : null;
      const eventPayload = {
        fixture_id: fixture.id, provider: PROVIDER, provider_event_id: stableKeys[i],
        event_type: "goal", period: mapPeriod(goal.period),
        minute: goal.minute != null && Number.isInteger(Number(goal.minute)) ? Number(goal.minute) : null,
        added_time: goal.addedMinute != null && Number.isInteger(Number(goal.addedMinute)) ? Number(goal.addedMinute) : null,
        team_id: teamId,
        player_id: goal.player?.id == null ? null : String(goal.player.id),
        player_name: String(goal.player?.name ?? goal.playerName ?? "").slice(0, 160) || null,
        assist_player_name: Array.isArray(goal.assists) ? String(goal.assists[0]?.name ?? "").slice(0, 160) || null : null,
        event_data: {
          source: PROVIDER, confirmed: true, baseline: baselineOnly || !baselineReady,
          detail: goal.detail ?? null, home_score: goal.homeScore ?? null, away_score: goal.awayScore ?? null,
        },
        occurred_at: eventAt,
      };
      const { data: stored, error: insertError } = await supabase.from("fixture_events")
        .upsert(eventPayload, { onConflict: "provider,provider_event_id" })
        .select("id").maybeSingle();
      if (insertError || !stored?.id) {
        providerErrors.push("could not store a confirmed goal event");
        await holdSportsApiFixture(providerFixtureId, "goal event storage failed");
        return { ok: false, processed: inserted, lastGoalCount: lastProcessed, baselineReady, hold: true };
      }
      inserted++;
      storedEvents.push({ id: stored.id });
      // Only newly observed goals after a trusted zero-score baseline can alert.
      // Historical baseline goals and provider correction replays never generate a fresh alert.
      if (!baselineOnly && baselineReady && !isCorrection) {
        await dispatchVerifiedPush(stored.id, true);
      }
    }

    if (!(baselineOnly || !baselineReady)) {
      for (const stored of storedEvents) {
        const { data: count, error: settleError } = await supabase.rpc(
          "betnova_process_live_event", { p_event_id: stored.id },
        );
        if (settleError) {
          providerErrors.push("goal stored but automatic settlement replay failed");
          await supabase.from("sportsapi_fixture_links")
            .update({ settlement_hold: true, updated_at: new Date().toISOString() })
            .eq("provider_fixture_id", providerFixtureId);
          return { ok: false, processed: inserted, lastGoalCount: lastProcessed, baselineReady, hold: true };
        }
        settled += Number(count ?? 0);
        goalEventsProcessed++;
      }
    }

    const newLastGoalCount = activeGoals.length;
    const newSettledCount = isCorrection ? goalEventsProcessed : settledCount + goalEventsProcessed;
    const { error: linkError } = await supabase.from("sportsapi_fixture_links")
      .update({
        baseline_ready: true, processed_goal_snapshot: currentSnapshot,
        last_processed_goal_count: newLastGoalCount, settled_goal_count: newSettledCount,
        settlement_hold: false, last_events_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("provider_fixture_id", providerFixtureId);
    if (linkError) {
      providerErrors.push("could not save processed-goal checkpoint");
      await holdSportsApiFixture(providerFixtureId, "goal checkpoint persistence failed");
    }

    goalsInserted += inserted;
    marketsProcessed += settled;
    return { ok: !linkError, processed: inserted, lastGoalCount: newLastGoalCount, baselineReady: true, hold: false };
  }

  async function fetchAndProcessGoals(
    providerFixtureId: number,
    fixtureId: string,
    link: any,
    finalScore: { home: number; away: number },
    baselineOnly = false,
  ) {
    const events = await providerGet("/fixtures/" + providerFixtureId + "/events");
    if (!Array.isArray(events)) {
      await holdSportsApiFixture(providerFixtureId, "provider event timeline unavailable");
      return false;
    }
    const fixture = await getFixture(fixtureId);
    if (!fixture) {
      await holdSportsApiFixture(providerFixtureId, "local fixture could not be loaded");
      return false;
    }
    const result = await processGoalList(providerFixtureId, fixture, link, events, finalScore, baselineOnly);
    if (!result.ok) {
      await holdSportsApiFixture(providerFixtureId, "goal snapshot could not be reconciled");
      return false;
    }

    // A VAR replay on an already-finished fixture must also replay the
    // full-time event, otherwise match-result / BTTS / totals markets can stay open.
    if (!baselineOnly && fixture.status === "finished") {
      const checkedAt = new Date().toISOString();
      const { data: fullTimeEvent, error: fullTimeError } = await supabase.from("fixture_events")
        .upsert({
          fixture_id: fixtureId,
          provider: PROVIDER,
          provider_event_id: providerFixtureId + ":full_time",
          event_type: "full_time",
          period: "full_time",
          event_data: {
            source: PROVIDER, confirmed: true, final: true,
            home_score: finalScore.home, away_score: finalScore.away,
            reconciled_after_provider_event_update: true,
          },
          occurred_at: checkedAt,
        }, { onConflict: "provider,provider_event_id" })
        .select("id").maybeSingle();
      if (fullTimeError || !fullTimeEvent?.id) {
        providerErrors.push("could not refresh the final-time event after VAR correction");
        await holdSportsApiFixture(providerFixtureId, "full-time event could not be stored");
        return false;
      }
      await dispatchVerifiedPush(fullTimeEvent.id);
      const { error: fullTimeSettleError } = await supabase.rpc(
        "betnova_process_live_event", { p_event_id: fullTimeEvent.id },
      );
      if (fullTimeSettleError) {
        providerErrors.push("final-time markets could not be replayed after VAR correction");
        await holdSportsApiFixture(providerFixtureId, "full-time settlement failed");
        return false;
      }
    }
    return true;
  }

  const liveScores = await providerGet("/livescores?sport=football");
  if (!Array.isArray(liveScores)) {
    return json({
      ok: false,
      provider: PROVIDER,
      error: providerLimited ? "Provider rate limit reached" : quotaLimited ? "Daily free request budget reached" : "Live score feed unavailable",
      requests_made: requestsMade,
    }, 503);
  }

  const seenProviderIds = new Set<number>();
  for (const item of liveScores) {
    if (requestsMade >= MAX_REQUESTS_PER_RUN || quotaLimited || providerLimited) break;
    const providerFixtureId = Number(item?.id);
    const homeName = String(item?.home?.name ?? "");
    const awayName = String(item?.away?.name ?? "");
    const startTime = new Date(String(item?.startTime ?? ""));
    const homeScore = integer(item?.homeScore?.current);
    const awayScore = integer(item?.awayScore?.current);
    if (!Number.isSafeInteger(providerFixtureId) || providerFixtureId <= 0 ||
        !homeName || !awayName || !Number.isFinite(startTime.getTime()) ||
        item?.status?.type !== "inprogress" || item?.finalResultOnly === true ||
        homeScore === null || awayScore === null) continue;

    seenProviderIds.add(providerFixtureId);
    let { data: link } = await supabase.from("sportsapi_fixture_links")
      .select("*").eq("provider_fixture_id", providerFixtureId).maybeSingle();

    if (!link) {
      const { data: matchedFixtureId, error: matchError } = await supabase.rpc(
        "betnova_match_sportsapi_fixture",
        { p_home_name: homeName, p_away_name: awayName, p_start_time: startTime.toISOString() },
      );
      let targetFixtureId = matchedFixtureId as string | null;
      if (matchError || !targetFixtureId) {
        targetFixtureId = await createLiveFixture(item, providerFixtureId, homeName, awayName, startTime, homeScore, awayScore);
        if (!targetFixtureId) {
          fixturesUnmatched++;
          continue;
        }
        fixturesCreated++;
      }
      const fixture = await getFixture(targetFixtureId);
      if (!fixture) continue;
      const baselineReady = homeScore + awayScore === 0;
      const { data: insertedLink, error: linkError } = await supabase.from("sportsapi_fixture_links")
        .insert({
          provider_fixture_id: providerFixtureId,
          fixture_id: targetFixtureId,
          last_status: "inprogress",
          last_seen_at: new Date().toISOString(),
          last_home_score: homeScore,
          last_away_score: awayScore,
          score_observations: 0,
          score_stable_since: null,
          last_processed_goal_count: 0,
          settled_goal_count: 0,
          baseline_ready: baselineReady,
          settlement_hold: false,
        }).select("*").single();
      if (linkError || !insertedLink) {
        providerErrors.push("could not save a provider-to-fixture mapping");
        continue;
      }
      link = insertedLink;
      fixturesMatched++;
      if (fixture.status === "scheduled") {
        await recordMatchStart(targetFixtureId, providerFixtureId, new Date().toISOString());
      }
      await supabase.from("fixtures").update({
        status: "live", home_score: homeScore, away_score: awayScore, updated_at: new Date().toISOString(),
      }).eq("id", targetFixtureId);
      await invalidateLivePrices(targetFixtureId);
      if (!baselineReady && requestsMade < MAX_REQUESTS_PER_RUN) {
        await fetchAndProcessGoals(providerFixtureId, targetFixtureId, link, { home: homeScore, away: awayScore }, true);
        const { data: refreshedLink } = await supabase.from("sportsapi_fixture_links")
          .select("*").eq("provider_fixture_id", providerFixtureId).maybeSingle();
        if (refreshedLink) link = refreshedLink;
      }
      continue;
    }

    const fixture = await getFixture(link.fixture_id);
    if (!fixture) continue;
    if (fixture.status === "scheduled") {
      await recordMatchStart(link.fixture_id, providerFixtureId, new Date().toISOString());
    }
    const previousHome = Number(link.last_home_score ?? homeScore);
    const previousAway = Number(link.last_away_score ?? awayScore);
    const changed = previousHome !== homeScore || previousAway !== awayScore;
    const regressed = homeScore < previousHome || awayScore < previousAway;
    const nowIso = new Date().toISOString();
    // Score regressions mark the fixture for a fresh authoritative event snapshot.
    // Payout changes are applied only after the score and provider event list agree.
    const nextHold = Boolean(link.settlement_hold) || regressed;
    const nextObservations = changed ? 1 : Math.min(Number(link.score_observations ?? 0) + 1, 10);
    const nextStableSince = changed ? nowIso : link.score_stable_since;

    await supabase.from("fixtures").update({
      status: "live", home_score: homeScore, away_score: awayScore, updated_at: nowIso,
    }).eq("id", link.fixture_id);

    await supabase.from("sportsapi_fixture_links").update({
      last_status: "inprogress",
      last_seen_at: nowIso,
      last_home_score: homeScore,
      last_away_score: awayScore,
      score_observations: nextObservations,
      score_stable_since: nextStableSince,
      settlement_hold: nextHold,
      updated_at: nowIso,
    }).eq("provider_fixture_id", providerFixtureId);

    if (changed) {
      await invalidateLivePrices(link.fixture_id);
      continue;
    }

    if (!Boolean(link.baseline_ready)) {
      if (requestsMade < MAX_REQUESTS_PER_RUN) {
        await fetchAndProcessGoals(providerFixtureId, link.fixture_id, { ...link, baseline_ready: false }, { home: homeScore, away: awayScore }, true);
      }
      continue;
    }

    const stableSince = link.score_stable_since ? Date.parse(String(link.score_stable_since)) : 0;
    const eventSnapshotPredatesScore = !link.last_events_checked_at ||
      (link.score_stable_since &&
       Date.parse(String(link.last_events_checked_at)) < Date.parse(String(link.score_stable_since)));
    const needsEventReconciliation = nextHold ||
      Number(link.last_processed_goal_count ?? 0) !== homeScore + awayScore ||
      (nextObservations >= 2 && Boolean(eventSnapshotPredatesScore));
    if (needsEventReconciliation && nextObservations >= 2 && stableSince > 0 &&
        Date.now() - stableSince >= 90000 && requestsMade < MAX_REQUESTS_PER_RUN) {
      await fetchAndProcessGoals(providerFixtureId, link.fixture_id, { ...link, settlement_hold: nextHold }, { home: homeScore, away: awayScore }, false);
    }
  }

  // A finished fixture disappears from /livescores. Confirm its final state once,
  // then process final goals and full-time only when the score/event list agrees.
  if (requestsMade < MAX_REQUESTS_PER_RUN && !quotaLimited && !providerLimited) {
    const { data: missingLinks } = await supabase.from("sportsapi_fixture_links")
      .select("*")
      .eq("last_status", "inprogress")
      .lt("last_seen_at", new Date(Date.now() - 110000).toISOString())
      .gt("last_seen_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .or("last_final_checked_at.is.null,last_final_checked_at.lt." + new Date(Date.now() - 4 * 60 * 1000).toISOString())
      .order("last_seen_at", { ascending: true })
      .limit(7);

    for (const link of missingLinks ?? []) {
      if (requestsMade >= MAX_REQUESTS_PER_RUN || quotaLimited || providerLimited) break;
      if (seenProviderIds.has(Number(link.provider_fixture_id))) continue;
      const detail = await providerGet("/fixtures/" + Number(link.provider_fixture_id));
      if (!detail || typeof detail !== "object") continue;
      const statusType = String(detail?.status?.type ?? "");
      const homeScore = integer(detail?.homeScore?.current);
      const awayScore = integer(detail?.awayScore?.current);
      const checkedAt = new Date().toISOString();

      if (statusType === "finished" && homeScore !== null && awayScore !== null) {
        await supabase.from("fixtures").update({
          status: "finished", home_score: homeScore, away_score: awayScore, updated_at: checkedAt,
        }).eq("id", link.fixture_id);

        const finalLink = { ...link, baseline_ready: Boolean(link.baseline_ready) };
        const goalsOk = await fetchAndProcessGoals(
          Number(link.provider_fixture_id), link.fixture_id, finalLink,
          { home: homeScore, away: awayScore }, false,
        );
        const { data: refreshed } = await supabase.from("sportsapi_fixture_links")
          .select("*").eq("provider_fixture_id", link.provider_fixture_id).maybeSingle();
        let settlementCompleted = false;

        if (goalsOk && refreshed && !refreshed.settlement_hold &&
            Number(refreshed.last_processed_goal_count ?? 0) === homeScore + awayScore) {
          const { data: fullTimeEvent, error: fullTimeError } = await supabase.from("fixture_events")
            .upsert({
              fixture_id: link.fixture_id,
              provider: PROVIDER,
              provider_event_id: Number(link.provider_fixture_id) + ":full_time",
              event_type: "full_time",
              period: "full_time",
              event_data: { source: PROVIDER, confirmed: true, final: true, home_score: homeScore, away_score: awayScore },
              occurred_at: checkedAt,
            }, { onConflict: "provider,provider_event_id" })
            .select("id").maybeSingle();
          if (!fullTimeError && fullTimeEvent?.id) {
            // Final whistle is authoritative here; notification failures are isolated from settlement.
            await dispatchVerifiedPush(fullTimeEvent.id);
            const { error: settleError } = await supabase.rpc(
              "betnova_process_live_event", { p_event_id: fullTimeEvent.id },
            );
            if (!settleError) {
              finalized++;
              settlementCompleted = true;
            } else {
              providerErrors.push("full-time event stored but settlement processor failed");
              await holdSportsApiFixture(Number(link.provider_fixture_id), "full-time settlement failed");
            }
          } else {
            providerErrors.push("full-time event could not be stored");
            await holdSportsApiFixture(Number(link.provider_fixture_id), "full-time event storage failed");
          }
        } else {
          providerErrors.push("final score and confirmed goal events did not reconcile; settlement held");
          await holdSportsApiFixture(Number(link.provider_fixture_id), "final score and goal events did not reconcile");
        }

        await supabase.from("sportsapi_fixture_links").update({
          // Keep recently finished fixtures in the correction watch window so a
          // provider-side post-match VAR update can still be reconciled automatically.
          last_status: "inprogress",
          last_final_checked_at: checkedAt,
          updated_at: checkedAt,
        }).eq("provider_fixture_id", link.provider_fixture_id);
      } else if (statusType === "postponed" || statusType === "canceled") {
        await supabase.from("fixtures").update({
          status: statusType === "postponed" ? "postponed" : "cancelled",
          updated_at: checkedAt,
        }).eq("id", link.fixture_id);
        await supabase.from("sportsapi_fixture_links").update({
          last_status: statusType,
          last_final_checked_at: checkedAt,
          updated_at: checkedAt,
        }).eq("provider_fixture_id", link.provider_fixture_id);
      } else {
        await supabase.from("sportsapi_fixture_links").update({
          last_final_checked_at: checkedAt,
          updated_at: checkedAt,
        }).eq("provider_fixture_id", link.provider_fixture_id);
      }
    }
  }

  const { data: usage } = await supabase.from("sportsapi_api_usage")
    .select("request_count").eq("usage_date", new Date().toISOString().slice(0, 10)).maybeSingle();

  return json({
    ok: true,
    provider: PROVIDER,
    live_fixtures_received: liveScores.length,
    fixtures_matched: fixturesMatched,
    fixtures_created: fixturesCreated,
    fixtures_unmatched: fixturesUnmatched,
    goal_events_inserted: goalsInserted,
    markets_processed: marketsProcessed,
    fixtures_finalized: finalized,
    requests_made: requestsMade,
    daily_requests_used: usage?.request_count ?? null,
    daily_request_cap: DAILY_REQUEST_LIMIT,
    quota_limited: quotaLimited,
    provider_rate_limited: providerLimited,
    provider_errors: providerErrors.slice(0, 8),
    settlement_policy: "Score changes are confirmed across polls. When the provider's confirmed goal snapshot changes, affected markets are replayed and wallet payouts are automatically reconciled with idempotent recovery offsets.",
  });
});
