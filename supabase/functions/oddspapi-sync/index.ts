import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const PROVIDER="oddspapi";
const API="https://api.oddspapi.io/v4/";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-betnova-sync-secret","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
function safeEqual(a:string,b:string){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);if(x.length!==y.length)return false;let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;}
async function api(path:string,key:string){const u=new URL(path,API);u.searchParams.set("apiKey",key);const r=await fetch(u,{headers:{accept:"application/json"},signal:AbortSignal.timeout(35000)});const t=await r.text();let data:any;try{data=t?JSON.parse(t):null;}catch{throw new Error("OddsPapi returned non-JSON response ("+r.status+")");}if(!r.ok){const detail=data?.message??data?.error??data??"request failed";throw new Error("OddsPapi HTTP "+r.status+": "+(typeof detail==="string"?detail:JSON.stringify(detail)).slice(0,250));}return data;}
function norm(s:any){return String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|afc|sc|ac|as|fk|sv|club|the)\b/g," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");}
function similarity(a:string,b:string){if(a===b)return 1;const A=new Set(a.split(" ")),B=new Set(b.split(" "));const inter=[...A].filter(x=>B.has(x)).length;return inter/Math.max(1,new Set([...A,...B]).size);}
function odd(v:any){const n=Number(v);return Number.isFinite(n)&&n>1&&n<1000?n:null;}
function lineKey(n:number){return n.toFixed(1).replace(".","_").replace("-","m");}
function outcomeKey(type:string,label:string):string|null{
 const x=norm(label).replace(/ /g,"");
 if(type==="1x2")return x==="1"||x==="home"?"home":x==="x"||x==="draw"?"draw":x==="2"||x==="away"?"away":null;
 if(type==="bothteamsscore")return x==="yes"?"yes":x==="no"?"no":null;
 if(type==="doublechance")return x==="1x"?"home_or_draw":x==="12"?"home_or_away":x==="2x"||x==="x2"?"away_or_draw":null;
 if(type==="drawnobet")return x==="1"||x==="home"?"home":x==="2"||x==="away"?"away":null;
 if(type==="totals"||type==="totals-corners"||type==="teamtotals-team1"||type==="teamtotals-team2")return x==="over"?"over":x==="under"?"under":null;
 if(type==="spreads"||type==="spreads-corners")return x==="1"||x==="home"?"home":x==="2"||x==="away"?"away":null;
 if(type==="oddeven")return x==="odd"?"odd":x==="even"?"even":null;
 if(type==="correctscore"||type==="exactscore"){const m=String(label).match(/^(\d+)\s*[:\-]\s*(\d+)$/);return m?"score_"+m[1]+"_"+m[2]:null;}
 return null;
}
function marketSpec(meta:any):{key:string;period?:string;line:number|null;required:number}|null{
 const type=String(meta.market_type??"").toLowerCase(),period=String(meta.period??"").toLowerCase();
 const line=meta.handicap===null||meta.handicap===undefined?NaN:Number(meta.handicap);
 const n=Number.isFinite(line)?line:null;
 const halfLine=(n:number|null)=>n!==null&&Math.abs(n*2-Math.round(n*2))<0.0001;
 if(type==="1x2"&&period==="fulltime")return {key:"match_result",line:null,required:3};
 if(type==="bothteamsscore"&&period==="fulltime")return {key:"both_teams_score",line:null,required:2};
 if(type==="doublechance"&&period==="fulltime")return {key:"double_chance",line:null,required:3};
 if(type==="drawnobet"&&period==="fulltime")return {key:"draw_no_bet",line:null,required:2};
 if(type==="totals"&&(period==="fulltime"||period==="p1")&&halfLine(n))return {key:"total_goals",period:period==="p1"?"first_half":undefined,line:n,required:2};
 if(type==="teamtotals-team1"&&period==="fulltime"&&halfLine(n))return {key:"team_total_goals",line:n,required:2};
 if(type==="teamtotals-team2"&&period==="fulltime"&&halfLine(n))return {key:"team_total_goals",line:n,required:2};
 if(type==="spreads"&&(period==="fulltime"||period==="p1")&&halfLine(n))return {key:"asian_handicap",period:period==="p1"?"first_half":undefined,line:n,required:2};
 if(type==="spreads-corners"&&period==="fulltime"&&halfLine(n))return {key:"corner_asian",line:n,required:2};
 if(type==="totals-corners"&&(period==="fulltime"||period==="p1")&&halfLine(n))return {key:"total_corners",period:period==="p1"?"first_half":undefined,line:n,required:2};
 if((type==="correctscore"||type==="exactscore")&&period==="fulltime")return {key:"correct_score",line:null,required:Array.isArray(meta.outcomes)?meta.outcomes.length:0};
 if(type==="oddeven"&&period==="fulltime")return {key:"odd_even_goals",line:null,required:2};
 return null;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 const body=await req.json().catch(()=>({}));
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!service)return reply({error:"Server configuration incomplete"},503);
 const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:cfg,error}=await sb.rpc("betnova_get_odds_sync_config");
 if(error||!cfg)return reply({error:"Secure provider configuration unavailable"},503);
 if(!cfg.sync_secret||!safeEqual(req.headers.get("x-betnova-sync-secret")??"",String(cfg.sync_secret)))return reply({error:"Unauthorized"},401);
 const key=String(cfg.oddspapi_api_key??"");if(!key)return reply({error:"OddsPapi key missing in Vault"},503);
 const mode=String(body.mode??"account");
 try{
  if(mode==="account"){
   const a=await api("account",key),subs=Array.isArray(a?.subscriptions)?a.subscriptions:[];
   return reply({ok:true,provider:PROVIDER,account:{language:a?.language_name,subscriptions:subs.map((s:any)=>({active:s.is_active,valid_from:s.valid_from,valid_until:s.valid_until,bookmakers:s.bookmakers,sport_ids:s.sport_ids,websocket_access:s.websocket_access,request_limit:s.request_limit,request_count:s.request_count,remaining_requests:Math.max(0,Number(s.request_limit??0)-Number(s.request_count??0))}))}});
  }
  if(mode==="catalog"){
   const [sports,markets,bookmakers,tournaments]=await Promise.all([api("sports",key),api("markets?language=en",key),api("bookmakers",key),api("tournaments?sportId=10",key)]);
   const sportRows=Array.isArray(sports)?sports:[],mRows=Array.isArray(markets)?markets.filter((x:any)=>Number(x.sportId??10)===10):[],tRows=Array.isArray(tournaments)?tournaments:[];
   if(mRows.length){const {error:e}=await sb.from("oddspapi_market_catalog").upsert(mRows.map((m:any)=>({market_id:Number(m.marketId),market_name:String(m.marketName??m.marketId),market_type:m.marketType??null,period:m.period??null,handicap:m.handicap??null,player_prop:!!m.playerProp,outcomes:Array.isArray(m.outcomes)?m.outcomes:[],synced_at:new Date().toISOString()})),{onConflict:"market_id"});if(e)throw e;}
   if(tRows.length){const {error:e}=await sb.from("oddspapi_tournament_catalog").upsert(tRows.map((t:any)=>({tournament_id:Number(t.tournamentId),tournament_slug:t.tournamentSlug??null,tournament_name:String(t.tournamentName??t.tournamentId),category_slug:t.categorySlug??null,category_name:t.categoryName??null,future_fixtures:t.futureFixtures??null,upcoming_fixtures:t.upcomingFixtures??null,live_fixtures:t.liveFixtures??null,synced_at:new Date().toISOString()})),{onConflict:"tournament_id"});if(e)throw e;}
   return reply({ok:true,sports_count:sportRows.length,tournaments_saved:tRows.length,markets_saved:mRows.length,bookmakers_count:Array.isArray(bookmakers)?bookmakers.length:0});
  }
  if(mode!=="sync")return reply({error:"Unsupported mode. Use account, catalog or sync."},400);
  // The free account is pre-match only. Check remaining quota before every billable request.
  const account=await api("account",key),sub=(Array.isArray(account?.subscriptions)?account.subscriptions:[]).find((x:any)=>x.is_active);
  if(!sub)return reply({ok:false,error:"No active OddsPapi subscription"});
  const remaining=Number(sub.request_limit??0)-Number(sub.request_count??0);
  if(remaining<=3)return reply({ok:false,quota_low:true,remaining_requests:remaining,message:"Sync paused to protect the remaining monthly quota."});
  const {data:state,error:stateError}=await sb.from("oddspapi_sync_state").select("*").eq("id",1).maybeSingle();
  if(stateError)throw stateError;
  const {data:tournaments,error:tError}=await sb.from("oddspapi_tournament_catalog").select("tournament_id,tournament_name,category_name,future_fixtures,upcoming_fixtures").gt("future_fixtures",0);
  if(tError)throw tError;
  const all=Array.isArray(tournaments)?tournaments:[];
  const priority=(t:any)=>{const c=String(t.category_name??"").toLowerCase(),n=String(t.tournament_name??"").toLowerCase();let p=3;
   if(/england|spain|germany|italy|france|international/.test(c))p=0;
   if(/algeria|morocco|tunisia|egypt|saudi|united arab emirates|qatar|portugal|netherlands|belgium|turkey|scotland|brazil|argentina|mexico|usa/.test(c))p=1;
   if(/premier league|laliga|serie a|bundesliga|ligue 1|champions league|europa league|conference league|world cup|nations league|cup/.test(n))p=Math.max(0,p-1);
   if(/u\s?\d{2}|youth|amateur|reserve|regional|junior/.test(n+" "+c))p+=3;
   return p;};
  all.sort((a:any,b:any)=>priority(a)-priority(b)||Number(b.upcoming_fixtures??0)-Number(a.upcoming_fixtures??0)||Number(b.future_fixtures??0)-Number(a.future_fixtures??0));
  if(!all.length)return reply({ok:true,message:"No eligible soccer tournaments in the cached catalogue."});
  const prioritized=all.slice(0,150);
  const cursor=Number(state?.tournament_cursor??0)%prioritized.length;
  const selected=[0,1,2].map(i=>prioritized[(cursor+i)%prioritized.length]).filter(Boolean);
  const bookmakers=["1xbet"];
  const callCount=Number(state?.call_count??0);
  const bookmaker=bookmakers[callCount%bookmakers.length];
  const ids=selected.map((x:any)=>Number(x.tournament_id));
  const oddsData=await api("odds-by-tournaments?"+new URLSearchParams({bookmaker,tournamentIds:ids.join(","),language:"en",verbosity:"3"}).toString(),key);
  const events=Array.isArray(oddsData)?oddsData:Array.isArray(oddsData?.data)?oddsData.data:[];
  const now=new Date();
  const {data:fixtures,error:fError}=await sb.from("fixtures").select("id,starts_at,status,home_team_id,away_team_id").eq("status","scheduled").gte("starts_at",now.toISOString()).lte("starts_at",new Date(now.getTime()+14*86400000).toISOString()).limit(1200);
  if(fError)throw fError;
  const idsTeams=[...new Set((fixtures??[]).flatMap((f:any)=>[f.home_team_id,f.away_team_id]))];
  const teams:any[]=[];
  for(let i=0;i<idsTeams.length;i+=150){const {data:part,error:teamError}=await sb.from("teams").select("id,name").in("id",idsTeams.slice(i,i+150));if(teamError)throw teamError;if(part)teams.push(...part);}
  const teamMap=new Map(teams.map((t:any)=>[t.id,norm(t.name)]));
  const local=(fixtures??[]).map((f:any)=>({...f,homeNorm:teamMap.get(f.home_team_id)??"",awayNorm:teamMap.get(f.away_team_id)??""}));
  const {data:catalog,error:catError}=await sb.from("oddspapi_market_catalog").select("market_id,market_name,market_type,period,handicap,player_prop,outcomes");
  if(catError)throw catError;
  const metaMap=new Map((catalog??[]).map((m:any)=>[Number(m.market_id),m]));
  let matched=0,unmatched=0,marketsSaved=0,selectionsSaved=0,staleSkipped=0,unsupported=0;
  const errors:string[]=[];
  for(const event of events){
   if(!event?.hasOdds||Number(event.statusId)!==0)continue;
   const start=new Date(String(event.startTime));if(!Number.isFinite(start.getTime())||start.getTime()<=Date.now())continue;
   const h=norm(event.participant1Name),a=norm(event.participant2Name);if(!h||!a)continue;
   const candidates=local.map((f:any)=>{const dt=Math.abs(new Date(f.starts_at).getTime()-start.getTime());return {f,dt,hs:similarity(h,f.homeNorm),as:similarity(a,f.awayNorm)};})
    .filter((x:any)=>x.dt<=120*60000&&x.hs>=0.78&&x.as>=0.78)
    .sort((x:any,y:any)=>(y.hs+y.as-x.hs-x.as)||x.dt-y.dt);
   if(!candidates.length|| (candidates.length>1&&Math.abs((candidates[0].hs+candidates[0].as)-(candidates[1].hs+candidates[1].as))<0.08&&Math.abs(candidates[0].dt-candidates[1].dt)<15*60000)){unmatched++;continue;}
   const fixture=candidates[0].f;matched++;
   const {error:linkError}=await sb.from("oddspapi_fixture_links").upsert({provider_fixture_id:String(event.fixtureId),fixture_id:fixture.id,provider_start_time:start.toISOString(),last_seen_at:now.toISOString(),match_confidence:Number(((candidates[0].hs+candidates[0].as)/2).toFixed(3))},{onConflict:"provider_fixture_id"});
   if(linkError){errors.push("fixture link: "+linkError.message.slice(0,100));continue;}
   const book=event.bookmakerOdds?.[bookmaker];if(!book||book.suspended)continue;
   const rawMarkets=book.markets&&typeof book.markets==="object"?Object.entries(book.markets):[];
   for(const [marketId,raw] of rawMarkets){
    const meta=metaMap.get(Number(marketId));if(!meta||meta.player_prop){unsupported++;continue;}
    const spec=marketSpec(meta);if(!spec||!Array.isArray(meta.outcomes)||spec.required<2){unsupported++;continue;}
    const marketData:any=raw;if(marketData.marketActive===false)continue;
    const picks:any[]=[];let marketUpdated=0,valid=true;
    for(const out of meta.outcomes){
     const outcome=marketData.outcomes?.[String(out.outcomeId)];const players=outcome?.players&&typeof outcome.players==="object"?Object.values(outcome.players):[];
     const player:any=players.find((v:any)=>v?.active!==false&&v?.playerName==null&&odd(v?.price)!==null);
     if(!player){valid=false;break;}
     const changed=Date.parse(String(player.changedAt??event.updatedAt??""));
     if(!Number.isFinite(changed)||changed>Date.now()+30000||Date.now()-changed>24*3600000){valid=false;staleSkipped++;break;}
     marketUpdated=Math.max(marketUpdated,changed);
     let sk=outcomeKey(String(meta.market_type),String(out.outcomeName));
     if(!sk){valid=false;break;}
     if(meta.market_type==="teamtotals-team1"||meta.market_type==="teamtotals-team2")sk=(meta.market_type==="teamtotals-team1"?"home_":"away_")+sk;
     if(meta.market_type==="totals"||meta.market_type==="totals-corners"||meta.market_type==="teamtotals-team1"||meta.market_type==="teamtotals-team2")sk+="_"+lineKey(Number(spec.line));
     picks.push({name:String(out.outcomeName),key:sk,odds:odd(player.price)});
    }
    if(!valid||picks.length!==spec.required||picks.some((x:any)=>!x.odds))continue;
    const lineText=spec.line===null?"":" "+spec.line;
    const periodText=spec.period==="first_half"?" · 1H":"";
    const marketName="OddsPapi · "+bookmaker+" · "+String(meta.market_name)+lineText+periodText;
    const {data:existing,error:findError}=await sb.from("markets").select("id,status").eq("fixture_id",fixture.id).eq("market_key",spec.key).eq("name",marketName).maybeSingle();
    if(findError){errors.push("market lookup: "+findError.message.slice(0,100));continue;}
    if(existing&&existing.status!=="open"&&existing.status!=="suspended")continue;
    const updatedAt=new Date(marketUpdated).toISOString();
    const payload={fixture_id:fixture.id,market_type:spec.key,market_key:spec.key,name:marketName,settlement_rule:{...(spec.line===null?{}:{line:spec.line}),...(spec.period?{period:spec.period}:{})},is_live:false,is_active:true,status:"open",suspended_at:null,source_provider:PROVIDER,external_id:String(event.fixtureId)+":"+String(marketId)+":"+bookmaker,last_updated_at:updatedAt};
    const saved=existing?await sb.from("markets").update(payload).eq("id",existing.id).select("id").single():await sb.from("markets").insert(payload).select("id").single();
    if(saved.error||!saved.data){errors.push("market save: "+String(saved.error?.message??"no row").slice(0,100));continue;}
    marketsSaved++;
    for(const pick of picks){
     const {data:old,error:oldError}=await sb.from("market_selections").select("id,status,result_status").eq("market_id",saved.data.id).eq("selection_key",pick.key).maybeSingle();
     if(oldError){errors.push("selection lookup: "+oldError.message.slice(0,100));continue;}
     if(old&&(old.status!=="active"||old.result_status!=="pending"))continue;
     const sp={market_id:saved.data.id,name:pick.name,selection_key:pick.key,odds:pick.odds,status:"active",result_status:"pending",updated_at:updatedAt};
     const wr=old?await sb.from("market_selections").update(sp).eq("id",old.id):await sb.from("market_selections").insert(sp);
     if(wr.error)errors.push("selection save: "+wr.error.message.slice(0,100));else selectionsSaved++;
    }
   }
  }
  const nextCursor=(cursor+selected.length)%prioritized.length;
  const {error:stateSaveError}=await sb.from("oddspapi_sync_state").upsert({id:1,tournament_cursor:nextCursor,call_count:callCount+1,last_sync_at:now.toISOString(),last_bookmaker:bookmaker},{onConflict:"id"});
  if(stateSaveError)errors.push("state update: "+stateSaveError.message.slice(0,100));
  const staleBefore=new Date(Date.now()-24*3600000).toISOString();
  const {error:suspendError}=await sb.from("markets").update({status:"suspended",suspended_at:now.toISOString()}).eq("source_provider",PROVIDER).eq("is_live",false).eq("status","open").lt("last_updated_at",staleBefore);
  if(suspendError)errors.push("stale suspension: "+suspendError.message.slice(0,100));
  const accountAfter=await api("account",key),afterSub=(Array.isArray(accountAfter?.subscriptions)?accountAfter.subscriptions:[]).find((x:any)=>x.is_active);
  const afterRemaining=afterSub?Math.max(0,Number(afterSub.request_limit??0)-Number(afterSub.request_count??0)):null;
  return reply({ok:true,provider:PROVIDER,mode,bookmaker,tournament_ids:ids,tournaments:selected.map((x:any)=>x.tournament_name),provider_events:events.length,matched_fixtures:matched,unmatched_events:unmatched,markets_saved:marketsSaved,selections_saved:selectionsSaved,stale_skipped:staleSkipped,unsupported_markets:unsupported,remaining_requests:afterRemaining,monthly_limit:Number(afterSub?.request_limit??0),live_odds_available:!!afterSub?.bookmakers?.[bookmaker]?.has_live_odds,errors:errors.slice(0,12)});
 }catch(e){const detail=e instanceof Error?e.message:JSON.stringify(e);console.error("oddspapi-sync",detail);return reply({ok:false,provider:PROVIDER,mode,error:String(detail??"Sync failed").slice(0,600)},502);}
});