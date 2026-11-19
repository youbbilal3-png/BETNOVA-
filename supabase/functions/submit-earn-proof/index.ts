import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set([
  "null",
  "https://betnova-8daa3.web.app",
  "https://betnova-8daa3.firebaseapp.com",
  "capacitor://localhost",
  "http://localhost",
  "http://127.0.0.1",
]);

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

const platformHosts: Record<string, string[]> = {
  facebook: ["facebook.com", "fb.watch"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Rewards service is not configured" }, 503, origin);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Authentication required" }, 401, origin);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Invalid session" }, 401, origin);

  let body: { platform?: string; post_url?: string; proof_path?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, 400, origin);
  }

  const platform = String(body.platform ?? "").toLowerCase();
  const postUrl = String(body.post_url ?? "").trim();
  const proofPath = String(body.proof_path ?? "").trim();
  if (!platformHosts[platform] || !postUrl || !proofPath) {
    return json({ error: "Platform, post URL, and proof screenshot are required" }, 400, origin);
  }

  let parsed: URL;
  try {
    parsed = new URL(postUrl);
  } catch {
    return json({ error: "Invalid post URL" }, 400, origin);
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!["https:", "http:"].includes(parsed.protocol)
    || !platformHosts[platform].some(domain => host === domain || host.endsWith("." + domain))) {
    return json({ error: "The post URL does not match the selected platform" }, 400, origin);
  }
  if (!proofPath.startsWith(user.id + "/") || proofPath.includes("..")) {
    return json({ error: "Proof file must belong to the signed-in user" }, 403, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: proof, error: proofError } = await admin.storage.from("earn-proofs").download(proofPath);
  if (proofError || !proof) return json({ error: "Could not verify the uploaded proof screenshot" }, 400, origin);
  if (proof.size <= 0 || proof.size > 5 * 1024 * 1024
    || !["image/jpeg", "image/png", "image/webp"].includes(proof.type)) {
    return json({ error: "Proof must be a JPG, PNG, or WEBP image under 5 MB" }, 400, origin);
  }

  const digest = await crypto.subtle.digest("SHA-256", await proof.arrayBuffer());
  const proofHash = Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");

  const { data: submission, error: insertError } = await admin
    .from("earn_post_submissions")
    .insert({
      user_id: user.id,
      platform,
      post_url: parsed.toString(),
      proof_path: proofPath,
      proof_sha256: proofHash,
      reward_amount: 50,
      currency: "DZD",
      status: "pending",
    })
    .select("id,status,created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return json({ error: "This post URL or screenshot has already been submitted" }, 409, origin);
    }
    return json({ error: "Could not submit the proof for review" }, 400, origin);
  }

  return json({ submission }, 201, origin);
});
