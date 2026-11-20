import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const PROVIDER = "moviodds";
const API = "https://moviodds.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-betnova-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const norm = (v: unknown) => String(v ?? "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/\b(fc|cf|sc|ac|afc|club|football club)\b/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const validOdd = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 && n < 1000 ? n : null;
};
const safeText = (v: unknown) => String(v ?? "").trim();

function teamSimilarity(a: unknown, b: unknown) {
  const aa = norm(a), bb = norm(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  const ta = aa.split(" ").filter(Boolean), tb = bb.split(" ").filter(Boolean);
  const small = ta.length <= tb.length ? ta : tb;
  const large = ta.length <= tb.length ? tb : ta;
  if (small.length >= 2 && large.length - small.length <= 1 && small.every(t => large.includes(t))) return 0.88;
  const overlap = small.filter(t => large.includes(t)).length;
  const ratio = overlap / new Set([...ta, ...tb]).size;
  return ratio >= 0.8 ? ratio : 0;
}
function classify(group: string) {
  const g = norm(group);
  if (/half time\/full time/.test(g)) return "half_time_full_time";
  if (/^half time result$/.test(g)) return "half_time_result";
  if (/^half time correct score$/.test(g)) return "correct_score";
  if (/full\s*time result|fulltime result|match result|match winner/.test(g)) return "match_result";
  if (/double chance/.test(g)) return "double_chance";
  if (/draw no bet/.test(g) && !/half time|1st half|first half/.test(g)) return "draw_no_bet";
    if (/both teams to score/.test(g)) return "both_teams_score";
  if (/first team to score|team to score first|^1st goal$|^first goal$/.test(g) && !/1st half|first half|2nd half|second half|half time/.test(g)) return "first_team_to_score";
    if (/goals odd even|odd even goals/.test(g) && !/1st half|first half|2nd half|second half|half time/.test(g)) return "odd_even_goals";
  if (/^correct score$/.test(g)) return "correct_score";
  if (/^exact total goals$|^exact goals$|^(home|away) team exact goals$/.test(g)) return "exact_goals";
  if (/goal in both halves/.test(g) && !/1st half|first half|2nd half|second half|half time/.test(g)) return "goal_in_both_halves";
  if ((/^first corner$|^1st corner$/.test(g)) && !/1st half|first half|half time/.test(g)) return "first_corner";
  if (/^red card$|^red card in match$/.test(g) && !/1st half|first half|2nd half|second half|half time/.test(g)) return "red_card";
  if (/^penalty awarded$|^penalty in match$/.test(g) && !/1st half|first half|2nd half|second half|half time/.test(g)) return "penalty_awarded";
    if (/asian corners|asian handicap corners|corner handicap/.test(g) && !/1st half|first half|2nd half|second half|half time/.test(g)) return "corner_asian";
  if (!/1st half|first half|2nd half|second half|half time/.test(g) && (/^team total goals$/.test(g) || (/\sgoals$/.test(g) && !/total goals|match goals|alternative match goals/.test(g)))) return "team_total_goals";
  if (/goal line|alternative goal line|total goals|goals over under|alternative total goals|alternative match goals|match goals|first half goals/.test(g) && !/2nd half|second half/.test(g)) return "total_goals";
  if (/asian handicap/.test(g) && !/corner|card|2nd half|second half/.test(g)) return "asian_handicap";
  if (/^1st half corners$|^first half corners$/.test(g)) return "total_corners";
  if (/total corners|corners over under|corners 2 way|^corners$|match corners|alternative corners/.test(g) && !/2nd half|second half/.test(g)) return "total_corners";
  return null;
}
function selection(q: any, type: string, home: string, away: string) {
  const label = safeText(q.label);
  const side = safeText(q.side).toLowerCase();
  const n2 = safeText(q.n2).toLowerCase();
  const line = safeText(q.line || q.handicap);
  const low = label.toLowerCase();
  const homeN = norm(home), awayN = norm(away);
  let name = label || side || n2;
  let key = "";
  let marketLine: number | null = null;

  if (type === "match_result" || type === "half_time_result") {
    const who = norm(n2 || label);
    if (["1","home","1x"].includes(who) || who === homeN || who.startsWith(homeN + " ")) key = "home";
    else if (["x","draw","tie"].includes(who)) key = "draw";
    else if (["2","away"].includes(who) || who === awayN || who.startsWith(awayN + " ")) key = "away";
  } else if (type === "double_chance") {
    const v = norm(n2 || label).replace(/\s/g, "");
    if (["1x","1/x","homeordraw","draworhome","homedraw"].includes(v)) key = "home_or_draw";
    else if (["12","1/2","homeoraway","awayorhome","homeaway"].includes(v)) key = "home_or_away";
    else if (["x2","x/2","draworaway","awayordraw","drawaway"].includes(v)) key = "away_or_draw";
  } else if (type === "draw_no_bet") {
    const who = norm(label || n2);
    if (["1","home"].includes(who) || who === homeN) key = "home";
    else if (["2","away"].includes(who) || who === awayN) key = "away";
  } else if (type === "both_teams_score") {
    if (/^yes$/i.test(label)) key = "yes";
    if (/^no$/i.test(label)) key = "no";
  } else if (type === "first_team_to_score") {
    const who = norm(label || n2);
    if (who === homeN || who === "home" || who === "1") key = "home";
    else if (who === awayN || who === "away" || who === "2") key = "away";
    else if (/no goal|no scorer/.test(who)) key = "no_goal";
  } else if (type === "total_goals" || type === "total_corners") {
    const match = (line || label).match(/(\d+(?:\.\d+)?)/);
    if (match) marketLine = Number(match[1]);
    const s = side || (low.startsWith("over") ? "over" : low.startsWith("under") ? "under" : "");
    if (s === "over" || s === "o") key = marketLine === null ? "" : "over_" + marketLine.toFixed(1).replace(".", "_");
    if (s === "under" || s === "u") key = marketLine === null ? "" : "under_" + marketLine.toFixed(1).replace(".", "_");
    if (!key) {
      const m = label.match(/^(over|under)\s*(\d+(?:\.\d+)?)/i);
      if (m) {
        marketLine = Number(m[2]);
        key = m[1].toLowerCase() + "_" + marketLine.toFixed(1).replace(".", "_");
      }
    }
    name = key.startsWith("over_") ? "Over " + marketLine : key.startsWith("under_") ? "Under " + marketLine : label;
  } else if (type === "team_total_goals") {
    const team = norm(side);
    const teamKey = team === homeN || team.startsWith(homeN + " ") ? "home" : team === awayN || team.startsWith(awayN + " ") ? "away" : "";
    const m = label.match(/(over|under)\s*(\d+(?:\.\d+)?)/i);
    if (teamKey && m) {
      marketLine = Number(m[2]);
      key = teamKey + "_" + m[1].toLowerCase() + "_" + marketLine.toFixed(1).replace(".", "_");
      name = (teamKey === "home" ? home : away) + " " + m[1] + " " + marketLine;
    }
  } else if (type === "half_time_full_time") {
    const parts = label.split(/\s+-\s+/);
    const outcomeKey = (v:string) => {
      const n = norm(v);
      if (n === homeN || n === "home" || n === "1") return "home";
      if (n === awayN || n === "away" || n === "2") return "away";
      if (n === "draw" || n === "tie" || n === "x") return "draw";
      return "";
    };
    if (parts.length === 2) {
      const ht = outcomeKey(parts[0]), ft = outcomeKey(parts[1]);
      if (ht && ft) key = "ht_" + ht + "_ft_" + ft;
    }
  } else if (type === "correct_score") {
    const m = label.match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
    if (m) key = "score_" + Number(m[1]) + "_" + Number(m[2]);
  } else if (type === "exact_goals") {
    const teamGoals = label.match(/^\s*.+?\s+-\s*(\d+)\s*\+?\s*goals?\s*$/i);
    const m = (line || label).match(/^\s*(\d+)\s*(?:goals?)?\s*$/i);
    if (teamGoals) key = "goals_" + Number(teamGoals[1]);
    else if (m) key = "goals_" + Number(m[1]);
  } else if (type === "odd_even_goals") {
    const v = norm(label || n2);
    if (v === "odd") key = "odd";
    else if (v === "even") key = "even";
  } else if (type === "goal_in_both_halves" || type === "red_card" || type === "penalty_awarded") {
    const v = norm(label || n2 || side);
    if (v === "yes") key = "yes";
    else if (v === "no") key = "no";
  } else if (type === "first_corner") {
    const who = norm(n2 || label || side);
    if (who === homeN || who.startsWith(homeN + " ") || who === "home" || who === "1") key = "home";
    else if (who === awayN || who.startsWith(awayN + " ") || who === "away" || who === "2") key = "away";
  } else if (type === "asian_handicap" || type === "corner_asian") {
    const who = norm(n2 || label);
    if (["h","home","1"].includes(side) || side === homeN || side.startsWith(homeN + " ") || who === homeN || who === "home") key = "home";
    else if (["a","away","2"].includes(side) || side === awayN || side.startsWith(awayN + " ") || who === awayN || who === "away") key = "away";
    const m = (line || label).match(/[+-]?\d+(?:\.\d+)?/);
    if (m) marketLine = Number(m[0]);
  }
  const odds = validOdd(q.odds_dec);
  if (!key || odds === null) return null;
  return { key, name: name || key, odds, line: marketLine, suspended: q.suspended === true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const apiKey = Deno.env.get("moviodds_api_key") ?? "";
  if (!url || !service || !apiKey) return json({
    error: "Missing server configuration",
    has_moviodds_key: Boolean(apiKey),
  }, 503);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: cfg, error: cfgError } = await db.rpc("betnova_get_odds_sync_config");
  if (cfgError || !cfg) return json({ error: "BETNOVA sync configuration unavailable" }, 503);
  const expected = String(cfg.sync_secret ?? "");
  const supplied = req.headers.get("x-betnova-sync-secret") ?? "";
  if (!expected || expected !== supplied) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "live_bulk" ? "live_bulk" : body?.mode === "prematch_bulk" ? "prematch_bulk" : body?.mode === "preview" ? "preview" : body?.mode === "fixtures" ? "fixtures" : body?.mode === "fixtures_bulk" ? "fixtures_bulk" : body?.mode === "groups" ? "groups" : body?.mode === "snapshot_sync" ? "snapshot_sync" : body?.mode === "bulk_preview" ? "bulk_preview" : body?.mode === "bulk" ? "bulk" : "sync";
  const isLiveBulkMode = mode === "live_bulk";
  const isPrematchBulkMode = mode === "prematch_bulk";
  const isBulkMode = mode === "bulk" || mode === "bulk_preview" || mode === "fixtures_bulk" || isLiveBulkMode || isPrematchBulkMode;
  const useProvidedQuotes = isBulkMode || mode === "snapshot_sync";
  const bulkGroupBatches = [
    "40,1777,43,938,981,1178,10111,10114,10127",
    "10143,10150,10164,10202,10234,10539,10544,50138,50415,50416,50424,50432",
    "50139,50441,760,M10203,50136,50266,10235,42,1579,171,10204,10210,10224,10233,10257,10540",
  ];
  const groupBatch = Math.max(0,Math.min(bulkGroupBatches.length-1,Math.floor(Number(body?.group_batch??0)||0)));
  const bulkGroups = bulkGroupBatches[groupBatch];
  const firstUrl = isLiveBulkMode
    ? API + "/odds?sport=soccer&in_play=1&stats=1"
    : isBulkMode ? API + "/odds?sport=soccer&groups=" + bulkGroups : API + "/catalog?sport=soccer";
  let response: Response;
  try {
    response = await fetch(firstUrl, {
      headers: { "X-API-Key": apiKey, "Accept": "application/json", "Accept-Encoding": "gzip" },
      signal: AbortSignal.timeout(110000),
    });
  } catch (e) {
    return json({ ok: false, provider: PROVIDER, error: "MoviOdds request failed: " + String(e).slice(0,180) }, 502);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 250);
    return json({ ok: false, provider: PROVIDER, http_status: response.status, error: detail }, 502);
  }
  const payload = await response.json().catch(() => null);
  let matches: any[] = isBulkMode ? (Array.isArray(payload?.matches) ? payload.matches : []) : (Array.isArray(payload?.fixtures) ? payload.fixtures : []);
  if (!payload || (isBulkMode ? !Array.isArray(payload.matches) : !Array.isArray(payload.fixtures))) return json({ ok: false, provider: PROVIDER, error: "Unexpected MoviOdds response shape" }, 502);
  if (isBulkMode && !isLiveBulkMode && !isPrematchBulkMode) {
    let liveMatches: any[] = [];
    try {
      const liveResponse = await fetch(API + "/odds?sport=soccer&in_play=1&groups=" + bulkGroups + "&stats=1", {
        headers: { "X-API-Key": apiKey, "Accept": "application/json", "Accept-Encoding": "gzip" },
        signal: AbortSignal.timeout(60000),
      });
      if (!liveResponse.ok) return json({ok:false,provider:PROVIDER,error:"MoviOdds live board request failed",http_status:liveResponse.status},502);
      const livePayload = await liveResponse.json();
      liveMatches = Array.isArray(livePayload?.matches) ? livePayload.matches : [];
    } catch (e) {
      return json({ok:false,provider:PROVIDER,error:"MoviOdds live board request failed: "+String(e).slice(0,180)},502);
    }
    const combined = new Map<string,any>();
    for (const m of matches) combined.set(String(m.id),{...m,quotes:[...(Array.isArray(m.quotes)?m.quotes:[])]});
    for (const m of liveMatches) {
      const id=String(m.id), old=combined.get(id);
      if(old){old.quotes.push(...(Array.isArray(m.quotes)?m.quotes:[]));old.in_play=true;old.score=m.score??old.score;}
      else combined.set(id,{...m,quotes:[...(Array.isArray(m.quotes)?m.quotes:[])]});
    }
    matches=Array.from(combined.values());
  }
  if (mode === "groups") {
    const candidate=body?.fi ? (matches.find((m:any)=>String(m.id)===String(body.fi)) ?? {id:String(body.fi)}) : [...matches].filter((m:any)=>m.id&&m.in_play!==true&&Date.parse(m.kickoff_utc)>Date.now()).sort((a:any,b:any)=>Number(b.market_count??0)-Number(a.market_count??0))[0];
    if(!candidate) return json({ok:false,error:"No MoviOdds match available for market discovery"},404);
    const snap=await fetch(API+"/snapshot?fi="+encodeURIComponent(String(candidate.id)),{
      headers:{"X-API-Key":apiKey,"Accept":"application/json","Accept-Encoding":"gzip"},
      signal:AbortSignal.timeout(20000)
    });
    if(!snap.ok) return json({ok:false,error:"MoviOdds market discovery snapshot failed",http_status:snap.status},502);
    const data=await snap.json();
    const groupMap=new Map<string,any>();
    for(const q of (Array.isArray(data?.quotes)?data.quotes:[])){
      const id=String(q.group_id??""); if(!id) continue;
      const old=groupMap.get(id)??{group_id:id,group_name:safeText(q.group_name),quotes:0,phases:new Set<string>()};
      old.quotes++; if(q.phase) old.phases.add(String(q.phase)); groupMap.set(id,old);
    }
    return json({ok:true,mode,match:{id:candidate.id,home:candidate.home,away:candidate.away,league:candidate.league,market_count:candidate.market_count},groups:Array.from(groupMap.values()).map((g:any)=>({...g,phases:Array.from(g.phases)})).sort((a:any,b:any)=>Number(a.group_id)-Number(b.group_id)),sample_quotes:Array.from(groupMap.keys()).flatMap((id:string)=>(data?.quotes??[]).filter((q:any)=>String(q.group_id)===id).slice(0,5).map((q:any)=>({group_id:q.group_id,group_name:q.group_name,label:q.label,side:q.side,n2:q.n2,line:q.line,handicap:q.handicap,period:q.period,market_id:q.market_id,odds_dec:q.odds_dec}))),quotes_received:(data?.quotes??[]).length});
  }

  if (mode === "snapshot_sync") {
    const fixtureIds = Array.isArray(body?.fixtures) ? body.fixtures.map((x:any)=>String(x)).filter(Boolean) : body?.fi ? [String(body.fi)] : [];
    if (!fixtureIds.length || fixtureIds.length > 18) return json({ok:false,error:"Provide 1 to 18 fixture IDs"},400);
    const snapshotMatches:any[] = [], snapshotErrors:any[] = [];
    for (let i=0;i<fixtureIds.length;i++) {
      if(i>0) await new Promise(resolve=>setTimeout(resolve,2100));
      const fi=fixtureIds[i];
      try {
        const snap=await fetch(API+"/snapshot?fi="+encodeURIComponent(fi),{
          headers:{"X-API-Key":apiKey,"Accept":"application/json","Accept-Encoding":"gzip"},
          signal:AbortSignal.timeout(20000)
        });
        if(!snap.ok){snapshotErrors.push({fi,http_status:snap.status});continue;}
        const data=await snap.json();
        const quotes=Array.isArray(data?.quotes)?data.quotes:[];
        const {data:fixture,error:fixtureError}=await db.from("fixtures")
          .select("external_id,starts_at,status,home_team:teams!fixtures_home_team_id_fkey(name),away_team:teams!fixtures_away_team_id_fkey(name),competition:competitions!inner(name)")
          .eq("source_provider",PROVIDER).eq("external_id",fi).maybeSingle();
        if(fixtureError||!fixture){snapshotErrors.push({fi,error:fixtureError?.message??"Fixture not found"});continue;}
        const home=Array.isArray(fixture.home_team)?fixture.home_team[0]:fixture.home_team;
        const away=Array.isArray(fixture.away_team)?fixture.away_team[0]:fixture.away_team;
        const comp=Array.isArray(fixture.competition)?fixture.competition[0]:fixture.competition;
        snapshotMatches.push({id:fi,home:home?.name,away:away?.name,league:comp?.name,kickoff_utc:fixture.starts_at,in_play:fixture.status==="live",quotes});
      } catch(e) { snapshotErrors.push({fi,error:String(e).slice(0,160)}); }
    }
    matches=snapshotMatches;
    if(!matches.length)return json({ok:false,mode,fixtures_requested:fixtureIds.length,snapshots_with_data:0,snapshot_errors:snapshotErrors.slice(0,20)});
  }

  const { data: sport, error: sportError } = await db.from("sports")
    .select("id").eq("slug", "football").eq("is_active", true).maybeSingle();
  if (sportError || !sport) return json({ ok: false, error: "BETNOVA football catalogue unavailable" }, 503);
  const now = new Date();
  let fixtures: any[] = [];
  let fixtureError: any = null;
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await db.from("fixtures")
      .select("id,starts_at,status,source_provider,external_id,home_team:teams!fixtures_home_team_id_fkey(name),away_team:teams!fixtures_away_team_id_fkey(name),competition:competitions!inner(sport_id)")
      .eq("competition.sport_id", sport.id)
      .in("status", ["scheduled","live"])
      .gte("starts_at", new Date(now.getTime() - 5*60*60*1000).toISOString())
      .lte("starts_at", new Date(now.getTime() + 10*24*60*60*1000).toISOString())
      .range(offset, offset + 999);
    if (page.error) { fixtureError = page.error; break; }
    fixtures.push(...(page.data ?? []));
    if ((page.data ?? []).length < 1000) break;
  }
  if (fixtureError) return json({ ok: false, error: "Could not load BETNOVA football fixtures" }, 503);

  let movioddsFixturesCreated = 0;
  if (mode === "fixtures" || mode === "fixtures_bulk") {
    const eligibleAll = matches.filter((m:any) => {
      const k = Date.parse(m.kickoff_utc);
      const league = safeText(typeof m.league === "string" ? m.league : m.league?.name);
      return safeText(m.id) && safeText(m.home) && safeText(m.away) && Number.isFinite(k)
        && k >= now.getTime() - 2*60*60*1000 && k <= now.getTime() + 10*24*60*60*1000
        && !/esoccer|cyber|virtual|simulated/i.test(league);
    });
    const fixtureBatchSize = 100;
    const fixtureBatch = Math.max(0, Math.min(30, Math.floor(Number(body?.fixture_batch ?? body?.batch ?? 0) || 0)));
    const eligible = mode === "fixtures" ? eligibleAll.slice(fixtureBatch * fixtureBatchSize, (fixtureBatch + 1) * fixtureBatchSize) : eligibleAll;
    const timeBuckets = new Map<number, any[]>();
    for (const f of (fixtures ?? [])) {
      const minute = Math.floor(Date.parse(f.starts_at) / 60000);
      const list = timeBuckets.get(minute) ?? []; list.push(f); timeBuckets.set(minute, list);
    }
    const missing = eligible.filter((m:any) => {
      const kickoff = Date.parse(m.kickoff_utc), base = Math.floor(kickoff/60000);
      for (let minute=base-35; minute<=base+35; minute++) {
        for (const f of (timeBuckets.get(minute) ?? [])) {
          const h = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team;
          const a = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team;
          if (teamSimilarity(m.home,h?.name)>=0.88 && teamSimilarity(m.away,a?.name)>=0.88) return false;
        }
      }
      return true;
    });
    if (missing.length) {
      const { data: allTeams, error: teamsError } = await db.from("teams").select("id,name,source_provider,external_id").limit(10000);
      const { data: allCompetitions, error: competitionsError } = await db.from("competitions").select("id,name,source_provider,external_id").eq("sport_id",sport.id).limit(5000);
      if (teamsError || competitionsError) return json({ok:false,error:"Could not load team/competition catalogue for fixture expansion"},503);
      const teamList:any[] = allTeams ?? [];
      const competitionList:any[] = allCompetitions ?? [];
      const teamMap = new Map<string,string>();
      for (const t of teamList) teamMap.set(norm(t.name),t.id);
      const teamNames = Array.from(new Set(missing.flatMap((m:any)=>[safeText(m.home),safeText(m.away)])));
      const newTeams = teamNames.filter(name => !teamMap.has(norm(name)) && !teamList.some(t=>teamSimilarity(name,t.name)>=0.88))
        .map(name=>({name,source_provider:PROVIDER,external_id:norm(name)}));
      if (newTeams.length) {
        const {data: insertedTeams,error:insertTeamsError}=await db.from("teams").upsert(newTeams,{onConflict:"source_provider,external_id"}).select("id,name");
        if(insertTeamsError) return json({ok:false,error:"MoviOdds team catalogue insert failed"},503);
        for(const t of (insertedTeams??[])) teamMap.set(norm(t.name),t.id);
        teamList.push(...(insertedTeams??[]));
      }
      const getTeamId=(name:string)=>{
        const exact=teamMap.get(norm(name)); if(exact) return exact;
        const found=teamList.find(t=>teamSimilarity(name,t.name)>=0.88);
        return found?.id ?? null;
      };
      const leagues=Array.from(new Set(missing.map((m:any)=>safeText(typeof m.league==="string"?m.league:m.league?.name)).filter(Boolean)));
      const competitionMap=new Map<string,string>();
      for(const c of competitionList) competitionMap.set(norm(c.name),c.id);
      const newCompetitions=leagues.filter(name=>!competitionMap.has(norm(name)))
        .map(name=>({sport_id:sport.id,name,country:null,season:String(now.getUTCFullYear()),is_active:true,source_provider:PROVIDER,external_id:norm(name)}));
      if(newCompetitions.length){
        const {data:insertedComps,error:insertCompsError}=await db.from("competitions").upsert(newCompetitions,{onConflict:"source_provider,external_id"}).select("id,name");
        if(insertCompsError) return json({ok:false,error:"MoviOdds competition catalogue insert failed"},503);
        for(const c of (insertedComps??[])) competitionMap.set(norm(c.name),c.id);
      }
      const newFixtureRows:any[]=[];
      for(const m of missing){
        const league=safeText(typeof m.league==="string"?m.league:m.league?.name)||"MoviOdds Football";
        const homeId=getTeamId(safeText(m.home)), awayId=getTeamId(safeText(m.away)), competitionId=competitionMap.get(norm(league));
        if(!homeId||!awayId||!competitionId) continue;
        newFixtureRows.push({
          competition_id:competitionId,home_team_id:homeId,away_team_id:awayId,
          starts_at:new Date(m.kickoff_utc).toISOString(),status:m.in_play===true?"live":"scheduled",
          source_provider:PROVIDER,external_id:String(m.id),updated_at:new Date().toISOString()
        });
      }
      const safeFixtureRows:any[]=[];
      for(let i=0;i<newFixtureRows.length;i+=400){
        const chunk=newFixtureRows.slice(i,i+400);
        const ids=chunk.map((x:any)=>x.external_id);
        const existingSource=await db.from("fixtures").select("external_id,status")
          .eq("source_provider",PROVIDER).in("external_id",ids);
        if(existingSource.error) return json({ok:false,error:"Could not protect existing MoviOdds fixture states"},503);
        const states=new Map((existingSource.data??[]).map((x:any)=>[x.external_id,x.status]));
        safeFixtureRows.push(...chunk.filter((x:any)=>!states.has(x.external_id)||["scheduled","live"].includes(String(states.get(x.external_id)))));
      }
      for(let i=0;i<safeFixtureRows.length;i+=400){
        const {data:createdRows,error:createError}=await db.from("fixtures").upsert(safeFixtureRows.slice(i,i+400),{onConflict:"source_provider,external_id"}).select("id");
        if(createError) return json({ok:false,error:"MoviOdds fixture catalogue insert failed"},503);
        movioddsFixturesCreated+=(createdRows??[]).length;
      }
      if(newFixtureRows.length && mode !== "fixtures"){
        const refreshed=await db.from("fixtures")
          .select("id,starts_at,status,home_team:teams!fixtures_home_team_id_fkey(name),away_team:teams!fixtures_away_team_id_fkey(name),competition:competitions!inner(sport_id)")
          .eq("competition.sport_id",sport.id).in("status",["scheduled","live"])
          .gte("starts_at",new Date(now.getTime()-5*60*60*1000).toISOString())
          .lte("starts_at",new Date(now.getTime()+10*24*60*60*1000).toISOString()).limit(10000);
        if(refreshed.error) return json({ok:false,error:"Could not reload expanded fixture catalogue"},503);
        fixtures=refreshed.data??[];
      }
    }
    if (mode === "fixtures" || mode === "fixtures_bulk") return json({ok:true,provider:PROVIDER,mode,fixtures_catalog_total:eligibleAll.length,fixture_batch:fixtureBatch,fixture_batch_size:fixtureBatchSize,fixture_candidates:missing.length,moviodds_fixtures_created:movioddsFixturesCreated});
  }

  const fixtureByExternalId = new Map<string, any>();
  for (const f of (fixtures ?? [])) if (f.source_provider === PROVIDER && f.external_id) fixtureByExternalId.set(String(f.external_id),f);
  const fixtureIndex = new Map<string, any[]>();
  for (const f of (fixtures ?? [])) {
    const h = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team;
    const a = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team;
    const pair = norm(h?.name) + "|" + norm(a?.name);
    const list = fixtureIndex.get(pair) ?? [];
    list.push(f);
    fixtureIndex.set(pair, list);
  }
  const mapped: Array<{match:any; fixture:any; groups:Map<string,any>}> = [];
  const minuteIndex = new Map<number, any[]>();
  for (const f of (fixtures ?? [])) {
    const minute = Math.floor(Date.parse(f.starts_at) / 60000);
    const list = minuteIndex.get(minute) ?? []; list.push(f); minuteIndex.set(minute, list);
  }
  const batch = Math.max(0, Math.min(159, Math.floor(Number(body?.batch ?? (Math.floor(Date.now() / (2 * 60 * 60 * 1000)) % 160)) || 0)));
  const batchSize = 12;
  let matchedIndex = 0, snapshotsFetched = 0, snapshotErrors = 0, bulkMatchesWithQuotes = 0;
  const unmatchedSamples:any[]=[];
  let unmatched = 0, quoteCount = 0, supportedQuoteCount = 0;
  const supportedGroups = new Set<string>();
  for (const match of matches) {
    const home = safeText(match.home), away = safeText(match.away);
    const kickoff = Date.parse(match.kickoff_utc);
    const leagueName = safeText(typeof match.league === "string" ? match.league : match.league?.name);
    if (/esoccer|cyber|virtual|simulated/i.test(leagueName)) continue;
    if (!home || !away || !Number.isFinite(kickoff)) { unmatched++; if(unmatchedSamples.length<30) unmatchedSamples.push({id:match.id,home,away,kickoff_utc:match.kickoff_utc,league:match.league}); continue; }
    if (kickoff < now.getTime()-5*60*60*1000 || kickoff > now.getTime()+10*24*60*60*1000) continue;
    const directFixture = fixtureByExternalId.get(String(match.id));
    let candidates = directFixture ? [directFixture] : (fixtureIndex.get(norm(home) + "|" + norm(away)) ?? [])
      .filter((f:any) => Math.abs(Date.parse(f.starts_at) - kickoff) <= 35*60*1000);
    if (!candidates.length) {
      const nearby: any[] = [];
      const baseMinute = Math.floor(kickoff / 60000);
      for (let minute = baseMinute - 35; minute <= baseMinute + 35; minute++) {
        const bucket = minuteIndex.get(minute);
        if (bucket) nearby.push(...bucket);
      }
      const scored = nearby.map((f:any) => {
        const fh = Array.isArray(f.home_team) ? f.home_team[0] : f.home_team;
        const fa = Array.isArray(f.away_team) ? f.away_team[0] : f.away_team;
        const hs = teamSimilarity(home, fh?.name), as = teamSimilarity(away, fa?.name);
        return { f, score: Math.min(hs, as), time: Math.abs(Date.parse(f.starts_at) - kickoff) };
      }).filter(x => x.score >= 0.88 && x.time <= 35*60*1000)
        .sort((a,b) => {
          const priority=(p:string)=>p===PROVIDER?0:p==="sportsapi"?1:p==="the-odds-api"?2:3;
          return b.score-a.score || a.time-b.time || priority(String(a.f.source_provider??""))-priority(String(b.f.source_provider??""));
        });
      if (scored.length) candidates = [scored[0].f];
    }
    if (!candidates.length) { unmatched++; if(unmatchedSamples.length<30) unmatchedSamples.push({id:match.id,home,away,kickoff_utc:match.kickoff_utc,league:match.league}); continue; }
    candidates.sort((a:any,b:any) => Math.abs(Date.parse(a.starts_at)-kickoff)-Math.abs(Date.parse(b.starts_at)-kickoff));
    const fixture = candidates[0];
    if (isLiveBulkMode && match.in_play === true && fixture.status !== "live") {
      const { error: liveStatusError } = await db.from("fixtures")
        .update({ status: "live", updated_at: new Date().toISOString() })
        .eq("id", fixture.id)
        .in("status", ["scheduled", "live"]);
      if (!liveStatusError) fixture.status = "live";
      else console.error("MoviOdds could not promote live fixture status", fixture.id, liveStatusError.message);
    }
    const currentIndex = matchedIndex++;
    if (!isBulkMode && (currentIndex < batch * batchSize || currentIndex >= (batch + 1) * batchSize)) continue;
    let hydratedMatch: any;
    if (useProvidedQuotes) {
      hydratedMatch = { ...match, quotes: Array.isArray(match.quotes) ? match.quotes : [] };
      if (hydratedMatch.quotes.length) bulkMatchesWithQuotes++;
    } else {
      let snapshot: any = null;
      try {
        const snapResponse = await fetch(API + "/snapshot?fi=" + encodeURIComponent(String(match.id)), {
          headers: { "X-API-Key": apiKey, "Accept": "application/json", "Accept-Encoding": "gzip" },
          signal: AbortSignal.timeout(10000),
        });
        if (snapResponse.ok) snapshot = await snapResponse.json();
        else snapshotErrors++;
      } catch { snapshotErrors++; }
      hydratedMatch = { ...match, quotes: Array.isArray(snapshot?.quotes) ? snapshot.quotes : [], market_count: snapshot?.market_count ?? match.market_count };
      snapshotsFetched++;
    }
    const groups = new Map<string,any>();
    for (const q of hydratedMatch.quotes) {
      quoteCount++;
      const groupName = safeText(q.group_name);
      const type = classify(groupName);
      if (!type) continue;
      const pick = selection(q, type, home, away);
      if (!pick) continue;
      const live = match.in_play === true || q.phase === "inplay";
      if (live) {
        const groupStatus = match.group_status?.[String(q.group_id)];
        const groupReadAt = Date.parse(String(groupStatus?.polled_at ?? match.polled_at ?? ""));
        if (groupStatus?.stale === true || !Number.isFinite(groupReadAt) ||
            Date.now() - groupReadAt > 3 * 60 * 1000 || groupReadAt > Date.now() + 30000) continue;
      }
      const marketTemplate = type;
      const rawPeriod = safeText(q.period);
      const inferredPeriod = /1st half|first half|half time/.test(norm(groupName)) ? "first_half" : /2nd half|second half/.test(norm(groupName)) ? "second_half" : "";
      const period = ["first_half","second_half","full_time"].includes(rawPeriod) ? rawPeriod : inferredPeriod;
      const marketLine = (type === "asian_handicap" || type === "corner_asian") && pick.line !== null ? (pick.key === "home" ? pick.line : -pick.line) : pick.line;
      const identityLine = (type === "asian_handicap" || type === "corner_asian") && pick.line !== null ? Math.abs(pick.line) : pick.line;
      if (["asian_handicap","corner_asian","total_goals","total_corners","team_total_goals"].includes(type) && pick.line !== null && Math.round(pick.line * 2) !== pick.line * 2) continue;
      const identity = [String(q.group_id ?? ""), String(q.market_id ?? ""), safeText(q.market_key), rawPeriod, identityLine ?? ""].join("|");
      const key = type;
      const marketName = groupName + (marketLine !== null ? " · " + marketLine : "") + (rawPeriod && rawPeriod !== period ? " · " + rawPeriod : period ? " · " + period : "") + " · #" + String(q.market_id ?? q.group_id ?? "market");
      const groupKey = fixture.id + "|" + key + "|" + (live ? "live" : "prematch") + "|" + identity;
      const old = groups.get(groupKey) ?? {
        fixtureId: fixture.id, type: marketTemplate, key, name: marketName,
        line: marketLine, period: period || null, live, picks: new Map<string,any>(),
      };
      old.picks.set(pick.key, pick);
      groups.set(groupKey, old);
      supportedQuoteCount++;
      supportedGroups.add(groupName);
    }
    mapped.push({ match: hydratedMatch, fixture, groups });
  }

  if (useProvidedQuotes && mapped.length) {
    const byFixture = new Map<string,any>();
    for (const item of mapped) {
      const existing = byFixture.get(item.fixture.id);
      if (!existing) {
        byFixture.set(item.fixture.id,item);
        continue;
      }
      existing.match.quotes.push(...(item.match.quotes??[]));
      for (const [key,group] of item.groups.entries()) {
        const old=existing.groups.get(key);
        if(old){for(const [pickKey,pick] of group.picks.entries()) old.picks.set(pickKey,pick);}
        else existing.groups.set(key,group);
      }
      if(item.match.in_play===true) existing.match.in_play=true;
    }
    mapped.splice(0,mapped.length,...Array.from(byFixture.values()));
  }

  let statisticsSynced = 0;
  if (isLiveBulkMode && mapped.length) {
    const statRows = mapped.flatMap(({match,fixture}:any) => {
      const stats = match?.stats;
      if (!stats || !stats.home || !stats.away) return [];
      const labels: Record<string,string> = {
        xg:"Expected Goals", attacks:"Attacks", dangerous_attacks:"Dangerous Attacks",
        possession:"Possession", shots:"Shots", shots_on_target:"Shots on Target",
        shots_off_target:"Shots off Target", corners:"Corners", yellow_cards:"Yellow Cards",
        red_cards:"Red Cards", offsides:"Offsides", saves:"Saves", fouls:"Fouls",
        big_chances:"Big Chances", big_chances_missed:"Big Chances Missed",
        passes:"Passes", accurate_passes:"Accurate Passes", crosses:"Crosses",
        tackles:"Tackles", interceptions:"Interceptions", clearances:"Clearances"
      };
      const toItems = (side:any) => Object.entries(side ?? {})
        .filter(([key,value]) => typeof value === "number" || typeof value === "string" || value === null)
        .map(([key,value]) => ({key,label:labels[key] ?? key.split("_").map((part:string)=>part.charAt(0).toUpperCase()+part.slice(1)).join(" "),value:value as string|number|null}));
      const home = toItems(stats.home), away = toItems(stats.away);
      if (!home.length && !away.length) return [];
      const sourceTime = Date.parse(String(stats.updated_at ?? ""));
      return [{
        fixture_id:fixture.id, provider:PROVIDER,
        statistics:{sport:stats.sport ?? "soccer",home,away},
        updated_at:Number.isFinite(sourceTime) ? new Date(sourceTime).toISOString() : new Date().toISOString()
      }];
    });
    for (let offset=0;offset<statRows.length;offset+=100) {
      const {error}=await db.from("fixture_statistics").upsert(statRows.slice(offset,offset+100),{onConflict:"fixture_id,provider"});
      if(error) console.error("MoviOdds stats upsert failed",error.message);
      else statisticsSynced+=Math.min(100,statRows.length-offset);
    }
  }

  const preview = {
    ok: true, provider: PROVIDER, mode, group_batch: groupBatch, groups_requested: bulkGroups, matches_received: matches.length, batch, batch_size: useProvidedQuotes ? matches.length : batchSize, snapshots_fetched: snapshotsFetched, bulk_matches_with_quotes: bulkMatchesWithQuotes, snapshot_errors: snapshotErrors,
    matches_linked: mapped.length, unmatched_matches: unmatched, unmatched_samples: unmatchedSamples.slice(0,30),
    quotes_received: quoteCount, supported_quotes: supportedQuoteCount,
    supported_market_groups: Array.from(supportedGroups).sort(),
    moviodds_fixtures_created: movioddsFixturesCreated, statistics_synced: statisticsSynced,
    warming: payload.warming === true,
    source: payload.source ?? null,

  };
  if (mode === "preview" || mode === "bulk_preview") return json(preview);

  let marketsSynced = 0, selectionsSynced = 0, skippedSettled = 0;
  const errors: string[] = [];
  const marketTypes = Array.from(new Set(mapped.flatMap(x => Array.from(x.groups.values()).map((m:any)=>m.type))));
  if (!marketTypes.length) return json({ ...preview, mode: useProvidedQuotes ? mode : "sync", markets_synced: 0, selections_synced: 0, skipped_settled: 0, errors: [] });
  const {data:templates,error:templateError}=await db.from("market_templates")
    .select("market_key,supports_live,is_enabled,settlement_rule")
    .in("market_key",marketTypes).eq("is_enabled",true);
  if(templateError) return json({...preview,mode,error:"Could not load market templates"},503);
  const templateMap=new Map((templates??[]).map((t:any)=>[t.market_key,t]));

  const planByIdentity=new Map<string,any>();
  for(const item of mapped){
    for(const market of item.groups.values()){
      const template=templateMap.get(market.type);
      if(!template||(market.live&&!template.supports_live)) continue;
      const picks=Array.from(market.picks.values()) as any[];
      const minimumSelections=["match_result","double_chance"].includes(market.type)?3:2;
      if(picks.length<minimumSelections) continue;
      const identity=[market.fixtureId,market.key,market.name].join("|");
      const old=planByIdentity.get(identity);
      if(old){
        if(market.live&&!old.market.live) planByIdentity.set(identity,{market,picks,template,pickMap:new Map(picks.map((p:any)=>[p.key,p]))});
        else if(market.live===old.market.live) {
          for(const pick of picks) old.pickMap.set(pick.key,pick);
          old.picks=Array.from(old.pickMap.values());
        }
        continue;
      }
      planByIdentity.set(identity,{market,picks,template,pickMap:new Map(picks.map((p:any)=>[p.key,p]))});
    }
  }
  const plans=Array.from(planByIdentity.values());
  const byFixture=new Map<string,any[]>();
  for(const plan of plans){
    const list=byFixture.get(plan.market.fixtureId)??[];
    list.push(plan);byFixture.set(plan.market.fixtureId,list);
  }
  const fixturePlanGroups=Array.from(byFixture.values());
  for(let offset=0;offset<fixturePlanGroups.length;offset+=50){
    const chunkPlans=fixturePlanGroups.slice(offset,offset+50).flat();
    const timestamp=new Date().toISOString();
    const marketRows=chunkPlans.map((plan:any)=>{
      const m=plan.market,t=plan.template,picks=plan.picks;
      const allSuspended=picks.every((p:any)=>p.suspended);
      return {
        fixture_id:m.fixtureId,market_type:m.type,market_key:m.key,name:m.name,
        settlement_rule:{...(t.settlement_rule??{}),...(m.line!==null?{line:m.line}:{}),...(m.period?{period:m.period}:{})},
        is_live:m.live,is_active:true,status:allSuspended?"suspended":"open",
        source_provider:PROVIDER,external_id:[m.key,m.name,m.period??"",m.line??""].join("|"),
        last_updated_at:timestamp,suspended_at:allSuspended?timestamp:null
      };
    });
    const selectionRows=chunkPlans.flatMap((plan:any)=>plan.picks.map((pick:any)=>({
      fixture_id:plan.market.fixtureId,market_key:plan.market.key,market_name:plan.market.name,
      selection_key:pick.key,name:pick.name,odds:pick.odds,
      status:pick.suspended?"suspended":"active",updated_at:timestamp
    })));
    const {data,error}=await db.rpc("betnova_moviodds_bulk_upsert",{
      p_markets:marketRows,p_selections:selectionRows
    });
    if(error){errors.push("bulk odds database write failed: "+String(error.message??error).slice(0,180));continue;}
    marketsSynced+=Number(data?.markets_upserted??0);
    selectionsSynced+=Number(data?.selections_upserted??0);
    skippedSettled+=Number(data?.markets_skipped??0)+Number(data?.selections_skipped??0);
  }
  return json({ ...preview, mode: isBulkMode ? mode : "sync", markets_synced: marketsSynced,
    selections_synced: selectionsSynced, skipped_settled: skippedSettled,
    errors: errors.slice(0, 20) });
});
