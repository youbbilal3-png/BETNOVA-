import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-betnova-feed-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function safeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedEvents = new Set(["match_start", "goal", "full_time", "corner", "yellow_card", "red_card", "penalty_awarded", "goal_cancelled", "half_time"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("BETNOVA_LIVE_FEED_SECRET");
  const supplied = req.headers.get("x-betnova-feed-secret") ?? "";
  if (!expected) return json({ error: "Live feed secret is not configured" }, 503);
  if (!safeEqual(supplied, expected)) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration is incomplete" }, 503);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const provider = String(payload.provider ?? "").trim().slice(0, 80);
  const providerEventId = String(payload.provider_event_id ?? "").trim().slice(0, 160);
  const fixtureId = String(payload.fixture_id ?? "").trim();
  const eventType = String(payload.event_type ?? "").trim();
  const teamId = payload.team_id == null ? null : String(payload.team_id);
  const occurredAt = payload.occurred_at == null ? null : String(payload.occurred_at);
  const period = payload.period == null ? null : String(payload.period).slice(0, 40);
  const minute = payload.minute == null ? null : Number(payload.minute);
  const addedTime = payload.added_time == null ? null : Number(payload.added_time);
  const homeScore = payload.home_score == null ? null : Number(payload.home_score);
  const awayScore = payload.away_score == null ? null : Number(payload.away_score);
  const playerId = payload.player_id == null ? null : String(payload.player_id).slice(0, 100);
  const playerName = payload.player_name == null ? null : String(payload.player_name).slice(0, 160);
  const assistName = payload.assist_player_name == null ? null : String(payload.assist_player_name).slice(0, 160);

  if (!provider || !providerEventId || !uuidPattern.test(fixtureId) || !allowedEvents.has(eventType)) {
    return json({ error: "Missing or invalid provider, event ID, fixture ID or event type" }, 400);
  }
  if (teamId && !uuidPattern.test(teamId)) return json({ error: "Invalid team ID" }, 400);
  if (minute !== null && (!Number.isInteger(minute) || minute < 0 || minute > 150)) return json({ error: "Invalid minute" }, 400);
  if (addedTime !== null && (!Number.isInteger(addedTime) || addedTime < 0 || addedTime > 30)) return json({ error: "Invalid added time" }, 400);
  if ((homeScore !== null && (!Number.isInteger(homeScore) || homeScore < 0 || homeScore > 99)) ||
      (awayScore !== null && (!Number.isInteger(awayScore) || awayScore < 0 || awayScore > 99))) {
    return json({ error: "Invalid score" }, 400);
  }
  if (payload.event_data != null && JSON.stringify(payload.event_data).length > 6000) {
    return json({ error: "Event data is too large" }, 413);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: fixture, error: fixtureError } = await supabase
    .from("fixtures").select("id,home_team_id,away_team_id")
    .eq("id", fixtureId).maybeSingle();
  if (fixtureError) return json({ error: "Could not validate fixture" }, 500);
  if (!fixture) return json({ error: "Fixture not found" }, 404);
  if (teamId && teamId !== fixture.home_team_id && teamId !== fixture.away_team_id) {
    return json({ error: "Event team does not belong to this fixture" }, 400);
  }

  const { data: event, error: insertError } = await supabase
    .from("fixture_events")
    .upsert({
      fixture_id: fixtureId,
      provider,
      provider_event_id: providerEventId,
      event_type: eventType,
      period,
      minute,
      added_time: addedTime,
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      assist_player_name: assistName,
      event_data: (payload.event_data && typeof payload.event_data === "object" ? payload.event_data : {}),
      occurred_at: occurredAt,
    }, { onConflict: "provider,provider_event_id", ignoreDuplicates: true })
    .select("id").maybeSingle();

  if (insertError) return json({ error: "Could not store live event" }, 500);
  if (!event) return json({ ok: true, duplicate: true });

  if (homeScore !== null && awayScore !== null) {
    const update: Record<string, unknown> = {
      home_score: homeScore,
      away_score: awayScore,
    };
    if (eventType === "full_time") update.status = "finished";
    else if (eventType !== "goal_cancelled") update.status = "live";
    const { error: scoreError } = await supabase.from("fixtures").update(update).eq("id", fixtureId);
    if (scoreError) return json({ error: "Event stored but fixture score update failed" }, 500);
  }

  let settledMarkets = 0;
  if (eventType === "goal" && (payload.event_data as Record<string, unknown> | null)?.confirmed !== true) {
    // Allow the provider's VAR/cancellation update to arrive before crediting a goal market.
    await new Promise(resolve => setTimeout(resolve, 20000));
    const { data: recentCancellations, error: cancellationError } = await supabase
      .from("fixture_events").select("id,event_data")
      .eq("fixture_id", fixtureId).eq("event_type", "goal_cancelled")
      .gte("received_at", new Date(Date.now() - 60000).toISOString());
    if (cancellationError) return json({ error: "Could not verify goal status" }, 500);
    const overturned = (recentCancellations ?? []).some(row => {
      const details = row.event_data as Record<string, unknown>;
      return details?.cancels_provider_event_id === providerEventId ||
        details?.cancelled_provider_event_id === providerEventId ||
        details?.related_event_id === providerEventId;
    });
    if (overturned) return json({ ok: true, event_id: event.id, goal_overturned: true, settled_markets: 0 });
  }

  // Push alerts are independent of wallet and bet settlement. A failure here must never block event ingestion.
  const dispatchSecret = Deno.env.get("BETNOVA_NOTIFICATION_DISPATCH_SECRET");
  if (dispatchSecret && ["match_start", "goal", "red_card", "half_time", "full_time"].includes(eventType)) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/dispatch-push-notifications`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
          "Content-Type": "application/json",
          "x-betnova-notification-secret": dispatchSecret,
        },
        body: JSON.stringify({ event_id: event.id, verified: eventType === "goal" }),
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) console.error("Push dispatch returned", response.status);
    } catch (error) {
      console.error("Push dispatch failed without affecting event processing", error);
    }
  }

  if (["goal", "full_time", "corner", "yellow_card", "red_card", "penalty_awarded"].includes(eventType)) {
    const { data, error: settleError } = await supabase.rpc("betnova_process_live_event", { p_event_id: event.id });
    if (settleError) return json({ error: "Event stored but automatic settlement failed", details: settleError.message }, 500);
    settledMarkets = Number(data ?? 0);
  }

  return json({ ok: true, event_id: event.id, settled_markets: settledMarkets });
});
