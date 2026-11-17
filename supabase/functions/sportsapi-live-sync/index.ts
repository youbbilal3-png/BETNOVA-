import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const API_BASE = "https://api.sportsapi.app/v2";
const PROVIDER = "sportsapi";
const DAILY_REQUEST_LIMIT = 950;
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

function goalWasRuledOut(goal: any, events: any[]): boolean {
  return events.some((event: any) =>
    event?.type === "varDecision" &&
    event?.detail === "goalNotAwarded" &&
    (event?.side == null || event?.side === goal?.side) &&
    event?.minute != null &&
    goal?.minute != null &&
    Number.isFinite(Number(event.minute)) &&
    Number.isFinite(Number(goal.minute)) &&
    Math.abs(Number(event.minute) - Number(goal.minute)) <= 1
  );
}

function providerEventId(providerFixtureId: number, event: any, index: number): string {
  const side = String(event?.side ?? "none");
  const minute = event?.minute == null ? "x" : String(event.minute);
  const added = event?.addedMinute == null ? "0" : String(event.addedMinute);
  const player = String(event?.player?.id ?? event?.player?.name ?? "unknown")
    .toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 40);
  return `${providerFixtureId}:${event?.type ?? "event"}:${side}:${minute}:${added}:${player}:${index}`.slice(0, 160);
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

  const { data: config, error: configError } = await supabase.rpc("betnova_get_sportsapi_live_config");
  if (configError || !config) return json({ error: "Secure live-score configuration is unavailable" }, 503);
  const expectedSecret = String(config.sync_secret ?? "");
  if (!expectedSecret || !safeEqual(req.headers.get("x-betnova-sync-secret") ?? "", expectedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const apiKey = String(config.api_key ?? "");
  if (!apiKey) return json({ error: "Add sportsapi_live_api_key to Supabase Vault to activate live scores" }, 503);

  let requestsMade = 0;
  let quotaLimited = false;
  let providerLimited = false;
  let providerErrors: string[] = [];
  let fixturesMatched = 0;
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
    const staleTime = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    const { error } = await supabase.from("markets")
      .update({ last_updated_at: staleTime })
      .eq("fixture_id", fixtureId).eq("is_live", true).eq("status", "open")
      .gt("last_updated_at", staleTime);
    if (error) providerErrors.push("could not expire live prices for a score change");
  }

  async function getFixture(fixtureId: string) {
    const { data, error } = await supabase.from("fixtures")
      .select("id,home_team_id,away_team_id,home_score,away_score,status")
      .eq("id", fixtureId).maybeSingle();
    if (error || !data) return null;
    return data;
  }

  async function processGoalList(
    providerFixtureId: number,
    fixture: any,
    link: any,
    providerEvents: any[],
    finalScore: { home: number; away: number },
    baselineOnly = false,
  ): Promise<{ ok: boolean; processed: number; lastGoalCount: number; baselineReady: boolean; hold: boolean }> {
    if (Boolean(link.settlement_hold)) {
      return { ok: false, processed: 0, lastGoalCount: Number(link.last_processed_goal_count ?? 0), baselineReady: Boolean(link.baseline_ready), hold: true };
    }
    const allGoals = providerEvents.filter((event: any) =>
      event?.type === "goal" && (event?.side === "home" || event?.side === "away")
    );
    const activeGoals = allGoals.filter((goal: any) => !goalWasRuledOut(goal, providerEvents));
    const expectedGoals = finalScore.home + finalScore.away;

    if (activeGoals.length !== expectedGoals) {
      return {
        ok: false, processed: 0,
        lastGoalCount: Number(link.last_processed_goal_count ?? 0),
        baselineReady: Boolean(link.baseline_ready),
        hold: Boolean(link.settlement_hold),
      };
    }

    const lastProcessed = Number(link.last_processed_goal_count ?? 0);
    const settledCount = Number(link.settled_goal_count ?? 0);
    if (lastProcessed > activeGoals.length) {
      await supabase.from("sportsapi_fixture_links")
        .update({ settlement_hold: true, updated_at: new Date().toISOString() })
        .eq("provider_fixture_id", providerFixtureId);
      return { ok: false, processed: 0, lastGoalCount: lastProcessed, baselineReady: Boolean(link.baseline_ready), hold: true };
    }

    const baselineReady = Boolean(link.baseline_ready);
    const startIndex = baselineOnly || !baselineReady ? 0 : lastProcessed;
    const endIndex = activeGoals.length;
    let inserted = 0;
    let settled = 0;
    let goalEventsProcessed = 0;

    for (let i = startIndex; i < endIndex; i++) {
      const goal = activeGoals[i];
      const teamId = goal.side === "home" ? fixture.home_team_id : fixture.away_team_id;
      const eventId = providerEventId(providerFixtureId, goal, i);
      const eventAt = goal.at && Number.isFinite(Date.parse(String(goal.at)))
        ? new Date(String(goal.at)).toISOString()
        : null;
      const eventPayload = {
        fixture_id: fixture.id,
        provider: PROVIDER,
        provider_event_id: eventId,
        event_type: "goal",
        period: mapPeriod(goal.period),
        minute: goal.minute != null && Number.isInteger(Number(goal.minute)) ? Number(goal.minute) : null,
        added_time: goal.addedMinute != null && Number.isInteger(Number(goal.addedMinute)) ? Number(goal.addedMinute) : null,
        team_id: teamId,
        player_id: goal.player?.id == null ? null : String(goal.player.id),
        player_name: String(goal.player?.name ?? goal.playerName ?? "").slice(0, 160) || null,
        assist_player_name: Array.isArray(goal.assists) ? String(goal.assists[0]?.name ?? "").slice(0, 160) || null : null,
        event_data: {
          source: PROVIDER,
          confirmed: true,
          baseline: baselineOnly || !baselineReady,
          detail: goal.detail ?? null,
          home_score: goal.homeScore ?? null,
          away_score: goal.awayScore ?? null,
        },
        occurred_at: eventAt,
      };
      const { data: stored, error: insertError } = await supabase.from("fixture_events")
        .upsert(eventPayload, { onConflict: "provider,provider_event_id" })
        .select("id").maybeSingle();
      if (insertError) {
        providerErrors.push("could not store a confirmed goal event");
        return { ok: false, processed: inserted, lastGoalCount: lastProcessed, baselineReady, hold: Boolean(link.settlement_hold) };
      }
      if (!stored?.id) continue;
      inserted++;
      if (!(baselineOnly || !baselineReady)) {
        const { data: count, error: settleError } = await supabase.rpc(
          "betnova_process_live_event",
          { p_event_id: stored.id },
        );
        if (settleError) {
          providerErrors.push("goal stored but settlement processor failed");
          return { ok: false, processed: inserted, lastGoalCount: lastProcessed, baselineReady, hold: Boolean(link.settlement_hold) };
        }
        settled += Number(count ?? 0);
        goalEventsProcessed++;
      }
    }

    const newBaselineReady = true;
    const newLastGoalCount = activeGoals.length;
    const newSettledCount = settledCount + goalEventsProcessed;
    const { error: linkError } = await supabase.from("sportsapi_fixture_links")
      .update({
        baseline_ready: newBaselineReady,
        last_processed_goal_count: newLastGoalCount,
        settled_goal_count: newSettledCount,
        last_events_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("provider_fixture_id", providerFixtureId);
    if (linkError) providerErrors.push("could not save processed-goal checkpoint");

    goalsInserted += inserted;
    marketsProcessed += settled;
    return {
      ok: !linkError,
      processed: inserted,
      lastGoalCount: newLastGoalCount,
      baselineReady: newBaselineReady,
      hold: Boolean(link.settlement_hold),
    };
  }

  async function fetchAndProcessGoals(
    providerFixtureId: number,
    fixtureId: string,
    link: any,
    finalScore: { home: number; away: number },
    baselineOnly = false,
  ) {
    const events = await providerGet("/fixtures/" + providerFixtureId + "/events");
    if (!Array.isArray(events)) return false;
    const fixture = await getFixture(fixtureId);
    if (!fixture) return false;
    const result = await processGoalList(providerFixtureId, fixture, link, events, finalScore, baselineOnly);
    return result.ok;
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
        item?.status?.type !== "inprogress" || homeScore === null || awayScore === null) continue;

    seenProviderIds.add(providerFixtureId);
    let { data: link } = await supabase.from("sportsapi_fixture_links")
      .select("*").eq("provider_fixture_id", providerFixtureId).maybeSingle();

    if (!link) {
      const { data: matchedFixtureId, error: matchError } = await supabase.rpc(
        "betnova_match_sportsapi_fixture",
        { p_home_name: homeName, p_away_name: awayName, p_start_time: startTime.toISOString() },
      );
      if (matchError || !matchedFixtureId) {
        fixturesUnmatched++;
        continue;
      }
      const fixture = await getFixture(matchedFixtureId);
      if (!fixture) continue;
      const baselineReady = homeScore + awayScore === 0;
      const { data: insertedLink, error: linkError } = await supabase.from("sportsapi_fixture_links")
        .insert({
          provider_fixture_id: providerFixtureId,
          fixture_id: matchedFixtureId,
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
      await supabase.from("fixtures").update({
        status: "live", home_score: homeScore, away_score: awayScore, updated_at: new Date().toISOString(),
      }).eq("id", matchedFixtureId);
      await invalidateLivePrices(matchedFixtureId);
      if (!baselineReady && requestsMade < MAX_REQUESTS_PER_RUN) {
        await fetchAndProcessGoals(providerFixtureId, matchedFixtureId, link, { home: homeScore, away: awayScore }, true);
        const { data: refreshedLink } = await supabase.from("sportsapi_fixture_links")
          .select("*").eq("provider_fixture_id", providerFixtureId).maybeSingle();
        if (refreshedLink) link = refreshedLink;
      }
      continue;
    }

    const fixture = await getFixture(link.fixture_id);
    if (!fixture) continue;
    const previousHome = Number(link.last_home_score ?? homeScore);
    const previousAway = Number(link.last_away_score ?? awayScore);
    const changed = previousHome !== homeScore || previousAway !== awayScore;
    const regressed = homeScore < previousHome || awayScore < previousAway;
    const nowIso = new Date().toISOString();
    const nextHold = Boolean(link.settlement_hold) || (regressed && Number(link.settled_goal_count ?? 0) > 0);
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
    if (!nextHold && nextObservations >= 2 && stableSince > 0 && Date.now() - stableSince >= 90000 &&
        Number(link.last_processed_goal_count ?? 0) < homeScore + awayScore &&
        requestsMade < MAX_REQUESTS_PER_RUN) {
      await fetchAndProcessGoals(providerFixtureId, link.fixture_id, link, { home: homeScore, away: awayScore }, false);
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
            const { error: settleError } = await supabase.rpc(
              "betnova_process_live_event", { p_event_id: fullTimeEvent.id },
            );
            if (!settleError) {
              finalized++;
              settlementCompleted = true;
            } else providerErrors.push("full-time event stored but settlement processor failed");
          }
        } else {
          providerErrors.push("final score and confirmed goal events did not reconcile; settlement held");
        }

        await supabase.from("sportsapi_fixture_links").update({
          last_status: settlementCompleted ? "finished" : "inprogress",
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
    settlement_policy: "Score changes are confirmed across polls and reconciled against the provider event list. If scores regress after a goal has already been settled, that fixture is held for manual review; the system never auto-reverses wallet settlements.",
  });
});
