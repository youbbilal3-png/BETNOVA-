import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-betnova-notification-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemBytes(pem: string) {
  const clean = pem.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(clean);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

async function getFirebaseAccessToken(clientEmail: string, privateKey: string) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Firebase OAuth failed (${response.status})`);
  const result = await response.json();
  cachedAccessToken = { value: result.access_token, expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000 };
  return cachedAccessToken.value;
}

const categoryByEvent: Record<string, "match_start" | "goals" | "red_cards" | "half_time" | "full_time"> = {
  match_start: "match_start",
  goal: "goals",
  red_card: "red_cards",
  half_time: "half_time",
  full_time: "full_time",
};

const copy: Record<string, { title: string; body: string }> = {
  match_start: { title: "BETNOVA • بداية المباراة", body: "انطلقت المباراة التي تتابعها." },
  goals: { title: "BETNOVA • هدف / Goal", body: "تم تسجيل هدف في المباراة التي تتابعها." },
  red_cards: { title: "BETNOVA • بطاقة حمراء", body: "تم إشهار بطاقة حمراء في المباراة التي تتابعها." },
  half_time: { title: "BETNOVA • نهاية الشوط الأول", body: "انتهى الشوط الأول من المباراة التي تتابعها." },
  full_time: { title: "BETNOVA • نهاية المباراة", body: "انتهت المباراة التي تتابعها." },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("BETNOVA_NOTIFICATION_DISPATCH_SECRET") ?? "";
  const suppliedSecret = req.headers.get("x-betnova-notification-secret") ?? "";
  if (!expectedSecret || suppliedSecret.length !== expectedSecret.length) return json({ error: "Unauthorized" }, 401);
  let diff = 0;
  for (let i = 0; i < expectedSecret.length; i++) diff |= expectedSecret.charCodeAt(i) ^ suppliedSecret.charCodeAt(i);
  if (diff !== 0) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");
  const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL");
  const firebasePrivateKey = Deno.env.get("FIREBASE_PRIVATE_KEY");
  if (!supabaseUrl || !serviceKey || !firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
    return json({ error: "Push delivery is not configured" }, 503);
  }

  let payload: { event_id?: string; verified?: boolean };
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!payload.event_id || !/^[0-9a-f-]{36}$/i.test(payload.event_id)) return json({ error: "Invalid event ID" }, 400);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: event, error: eventError } = await supabase
    .from("fixture_events")
    .select("id,fixture_id,event_type,team_id,minute,player_name")
    .eq("id", payload.event_id)
    .maybeSingle();
  if (eventError || !event) return json({ error: "Event not found" }, 404);

  const category = categoryByEvent[event.event_type];
  if (!category) return json({ ok: true, skipped: "unsupported_event" });
  if (event.event_type === "goal" && payload.verified !== true) return json({ error: "Goal is not verified for notification" }, 409);

  const { data: fixture, error: fixtureError } = await supabase
    .from("fixtures").select("id,home_team_id,away_team_id").eq("id", event.fixture_id).maybeSingle();
  if (fixtureError || !fixture) return json({ error: "Fixture not found" }, 404);

  const targetIds = [event.fixture_id, event.team_id].filter(Boolean);
  const { data: follows, error: followsError } = await supabase
    .from("notification_subscriptions").select("user_id,target_type,target_id")
    .in("target_id", targetIds);
  if (followsError) return json({ error: "Could not load match follows" }, 500);

  const interestedUsers = new Set((follows ?? []).filter(row =>
    (row.target_type === "fixture" && row.target_id === event.fixture_id) ||
    (row.target_type === "team" && event.team_id && row.target_id === event.team_id)
  ).map(row => row.user_id));
  if (interestedUsers.size === 0) return json({ ok: true, sent: 0, skipped: "no_followers" });

  const { data: preferences, error: preferencesError } = await supabase
    .from("notification_preferences").select("user_id")
    .eq("enabled", true).eq(category, true).in("user_id", [...interestedUsers]);
  if (preferencesError) return json({ error: "Could not load notification preferences" }, 500);
  const userIds = (preferences ?? []).map(row => row.user_id);
  if (userIds.length === 0) return json({ ok: true, sent: 0, skipped: "notifications_disabled" });

  const { data: devices, error: devicesError } = await supabase
    .from("device_push_tokens").select("token,user_id").in("user_id", userIds);
  if (devicesError) return json({ error: "Could not load registered devices" }, 500);
  const devicesByUser = new Map<string, string[]>();
  for (const device of devices ?? []) {
    devicesByUser.set(device.user_id, [...(devicesByUser.get(device.user_id) ?? []), device.token]);
  }

  let accessToken: string;
  try { accessToken = await getFirebaseAccessToken(firebaseClientEmail, firebasePrivateKey); }
  catch (error) {
    console.error("Firebase authorization failed", error);
    return json({ error: "Firebase authorization failed" }, 502);
  }

  const message = copy[category];
  let sentUsers = 0;
  let skippedUsers = 0;
  let failedUsers = 0;
  for (const userId of userIds) {
    const tokens = devicesByUser.get(userId) ?? [];
    // Do not permanently log a missing device: the user may register a phone later.
    if (tokens.length === 0) {
      skippedUsers++;
      continue;
    }

    let claimId: string | null = null;
    const { data: newClaim, error: claimError } = await supabase.from("notification_delivery_log")
      .insert({ event_id: event.id, user_id: userId, category, status: "pending" })
      .select("id").maybeSingle();

    if (!claimError && newClaim) {
      claimId = newClaim.id;
    } else if (claimError?.code === "23505") {
      // Permit safe retries after a failed send or a worker that died while pending.
      // A fresh pending claim and every sent claim remain protected from duplicates.
      const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: existing, error: existingError } = await supabase.from("notification_delivery_log")
        .select("id,status,created_at")
        .eq("event_id", event.id).eq("user_id", userId).eq("category", category)
        .maybeSingle();
      if (existingError) {
        console.error("Could not inspect previous notification delivery", existingError.message);
        skippedUsers++;
        continue;
      }
      if (existing?.status === "failed" || (existing?.status === "pending" && existing.created_at < staleBefore)) {
        const { data: retryClaim, error: retryError } = await supabase.from("notification_delivery_log")
          .update({ status: "pending", sent_at: null, last_error: null, created_at: new Date().toISOString() })
          .eq("id", existing.id).eq("status", existing.status)
          .select("id").maybeSingle();
        if (retryError) console.error("Could not reclaim notification delivery", retryError.message);
        claimId = retryClaim?.id ?? null;
      }
    } else if (claimError) {
      console.error("Notification delivery claim failed", claimError.message);
    }

    if (!claimId) { skippedUsers++; continue; }

    let delivered = 0;
    let lastError = "";
    for (const token of tokens) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(firebaseProjectId)}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: { category, fixture_id: event.fixture_id, event_id: event.id, route: "/" },
            android: {
              priority: "HIGH",
              notification: { channel_id: "betnova_alerts", sound: "default" },
            },
          },
        }),
      });
      if (response.ok) {
        delivered++;
      } else {
        const details = await response.text();
        lastError = `FCM ${response.status}: ${details.slice(0, 220)}`;
        if (details.includes("UNREGISTERED")) {
          await supabase.from("device_push_tokens").delete().eq("token", token);
        }
      }
    }

    if (delivered > 0) {
      await supabase.from("notification_delivery_log").update({ status: "sent", sent_at: new Date().toISOString(), last_error: null }).eq("id", claimId);
      sentUsers++;
    } else {
      await supabase.from("notification_delivery_log").update({ status: "failed", last_error: lastError.slice(0, 500) || "FCM delivery failed" }).eq("id", claimId);
      failedUsers++;
    }
  }

  return json({ ok: true, sent_users: sentUsers, skipped_users: skippedUsers, failed_users: failedUsers });
});
