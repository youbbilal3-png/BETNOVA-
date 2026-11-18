import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const PROVIDER="api-football-live";
const BASE="https://v3.football.api-sports.io";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-betnova-sync-secret","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json"};
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:cors});
const safeEqual=(a:string,b:string)=>{const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);if(x.length!==y.length)return false;let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;};
const norm=(v:unknown)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\b(fc|cf|sc|ac|afc|club|football club)\b/g,"").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const odd=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>1&&n<1000?n:null;};
const lineKey=(n:number)=>n.toFixed(1).replace(".","_").replace("-","m");
const decimalLine=(v:unknown):number|null=>{const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=20&&Math.round(n*2)===n*2?n:null;};

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!service)return reply({error:"Server configuration missing"},503);
 const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:config,error:configError}=await sb.rpc("betnova_get_provider_sync_config");
 if(configError||!config)return reply({error:"Secure API-Football config unavailable"},503);
 const expected=String(config.sync_secret??"");
 if(!expected||!safeEqual(req.headers.get("x-betnova-sync-secret")??"",expected))return reply({error:"Unauthorized"},401);
 const key=String(config.api_key??"");
 if(!key)return reply({error:"API-Football key missing from Vault"},503);
 const {data:allowed,error:budgetError}=await sb.rpc("betnova_reserve_api_football_live_request");
 if(budgetError||allowed!==true)return reply({ok:false,provider:PROVIDER,error:"Daily live-odds request budget exhausted (96/day safety cap)"},429);
 try{
  const response=await fetch(BASE+"/odds/live",{headers:{"x-apisports-key":key,"Accept":"application/json"},signal:AbortSignal.timeout(25000)});
  const raw=await response.text();let body:any;try{body=raw?JSON.parse(raw):{};}catch{body={raw:raw.slice(0,300)};}
  if(!response.ok||(body.errors&&Object.keys(body.errors).length)){
   return reply({ok:false,provider:PROVIDER,http_status:response.status,provider_error:body.errors??body.message??"API request failed",requests:1},502);
  }
  const rows=Array.isArray(body.response)?body.response:[];
  const {data:fixtures,error:fixtureError}=await sb.from("fixtures")
   .select("id,starts_at,status,home_score,away_score,home_team:teams!fixtures_home_team_id_fkey(name),away_team:teams!fixtures_away_team_id_fkey(name)")
   .eq("status","live").limit(1500);
  if(fixtureError)throw fixtureError;
  const local=fixtures??[];
  const matchedIds=new Set<string>();let matchedFixtures=0,marketsCreated=0,selectionsUpdated=0,skipped=0;
  const supportedTemplates=["match_result","both_teams_score","double_chance","total_goals"];
  const {data:templates,error:templateError}=await sb.from("market_templates").select("market_key,is_enabled").in("market_key",supportedTemplates);
  if(templateError)throw templateError;
  const enabled=new Set((templates??[]).filter((t:any)=>t.is_enabled).map((t:any)=>t.market_key));
  const save=async(item:any,fixtureId:string,book:any,bet:any,marketKey:string,marketName:string,external:string,picks:any[],line:number|null=null)=>{
   if(!enabled.has(marketKey)||picks.length<2||picks.some((x:any)=>!odd(x.price)))return;
   const {data:oldMarket,error:lookupError}=await sb.from("markets").select("id,status").eq("fixture_id",fixtureId).eq("source_provider",PROVIDER).eq("external_id",external).maybeSingle();
   if(lookupError)throw lookupError;
   if(oldMarket&&["settled","void"].includes(oldMarket.status))return;
   const now=new Date().toISOString();
   const payload={fixture_id:fixtureId,market_type:marketKey,market_key:marketKey,name:marketName,
    settlement_rule:{...(line===null?{}:{line}),period:"full_time"},is_live:true,is_active:true,status:"open",
    source_provider:PROVIDER,external_id:external,last_updated_at:now};
   let marketId=oldMarket?.id;
   if(marketId){const {error}=await sb.from("markets").update(payload).eq("id",marketId).in("status",["open","suspended"]);if(error)throw error;}
   else{const {data:created,error}=await sb.from("markets").insert(payload).select("id").single();if(error||!created)throw error??new Error("Market insert failed");marketId=created.id;marketsCreated++;}
   for(const pick of picks){
    const {data:old,error}=await sb.from("market_selections").select("id,status,result_status").eq("market_id",marketId).eq("selection_key",pick.key).maybeSingle();
    if(error)throw error;
    if(old&&(old.status!=="active"||old.result_status!=="pending"))continue;
    const selection={market_id:marketId,name:pick.name,selection_key:pick.key,odds:odd(pick.price),status:"active",result_status:"pending",updated_at:now};
    if(old){const {error:e}=await sb.from("market_selections").update(selection).eq("id",old.id);if(e)throw e;}
    else{const {error:e}=await sb.from("market_selections").insert(selection);if(e)throw e;}
    selectionsUpdated++;
   }
  };
  for(const item of rows){
   const f=item?.fixture??{},teams=item?.teams??{};
   const hn=norm(teams.home?.name),an=norm(teams.away?.name),kickoff=new Date(f.date??"").getTime();
   if(!hn||!an||!Number.isFinite(kickoff)){skipped++;continue;}
   const candidates=local.filter((x:any)=>{
    const h=Array.isArray(x.home_team)?x.home_team[0]:x.home_team,a=Array.isArray(x.away_team)?x.away_team[0]:x.away_team;
    return norm(h?.name)===hn&&norm(a?.name)===an&&Math.abs(new Date(x.starts_at).getTime()-kickoff)<=4*60*60*1000;
   });
   if(candidates.length!==1){skipped++;continue;}
   const fixtureId=candidates[0].id;matchedIds.add(fixtureId);matchedFixtures++;
   const books=Array.isArray(item.bookmakers)?item.bookmakers.slice(0,3):[];
   for(const book of books){
    const bookName=String(book.name??"Bookmaker"),bookId=String(book.id??bookName).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,24);
    for(const bet of book.bets??[]){
     const betName=String(bet.name??"").toLowerCase(),betId=String(bet.id??betName).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,24);
     const vals=(bet.values??[]).filter((v:any)=>v.suspended!==true&&odd(v.odd)!==null);
     if(!vals.length)continue;
     const choose=(pred:(v:any)=>boolean)=>{const list=vals.filter(pred);return list.find((v:any)=>v.main===true)??list[0]??null;};
     const externalBase=String(f.id??"")+"|"+bookId+"|"+betId;
     if(/both teams to score|both teams score|\bbtts\b/.test(betName)){
      const yes=choose((v:any)=>/^yes$/i.test(String(v.value))),no=choose((v:any)=>/^no$/i.test(String(v.value)));
      if(yes&&no)await save(item,fixtureId,book,bet,"both_teams_score","Both Teams To Score · "+bookName,externalBase,[{name:"Yes",key:"yes",price:yes.odd},{name:"No",key:"no",price:no.odd}]);
     }else if(/double chance/.test(betName)){
      const a=choose((v:any)=>/^(1x|home\/draw|home or draw)$/i.test(String(v.value))),b=choose((v:any)=>/^(x2|draw\/away|draw or away)$/i.test(String(v.value))),c=choose((v:any)=>/^(12|home\/away|home or away)$/i.test(String(v.value)));
      if(a&&b&&c)await save(item,fixtureId,book,bet,"double_chance","Double Chance · "+bookName,externalBase,[{name:"1X",key:"home_or_draw",price:a.odd},{name:"X2",key:"away_or_draw",price:b.odd},{name:"12",key:"home_or_away",price:c.odd}]);
     }else if(/match winner|match result|1x2|full.?time result/.test(betName)){
      const h=choose((v:any)=>/^(home|1)$/i.test(String(v.value))),d=choose((v:any)=>/^(draw|x)$/i.test(String(v.value))),a=choose((v:any)=>/^(away|2)$/i.test(String(v.value)));
      if(h&&d&&a)await save(item,fixtureId,book,bet,"match_result","Match Result · "+bookName,externalBase,[{name:"Home",key:"home",price:h.odd},{name:"Draw",key:"draw",price:d.odd},{name:"Away",key:"away",price:a.odd}]);
     }else if(/over\/under|total goals|goals over/.test(betName)&&!/team|corner|card|half time|first half|second half/.test(betName)){
      const lines=[...new Set(vals.map((v:any)=>decimalLine(v.handicap)).filter((v:any)=>v!==null))] as number[];
      for(const line of lines){
       const o=choose((v:any)=>decimalLine(v.handicap)===line&&/^over$/i.test(String(v.value))),u=choose((v:any)=>decimalLine(v.handicap)===line&&/^under$/i.test(String(v.value)));
       if(o&&u){const l=lineKey(line);await save(item,fixtureId,book,bet,"total_goals","Live Total Goals "+line+" · "+bookName,externalBase+"|"+l,[{name:"Over "+line,key:"over_"+l,price:o.odd},{name:"Under "+line,key:"under_"+l,price:u.odd}],line);}
      }
     }
    }
   }
  }
  const cutoff=new Date(Date.now()-5*60*1000).toISOString();
  const {error:suspendError}=await sb.from("markets").update({status:"suspended",is_active:false,suspended_at:new Date().toISOString()})
   .eq("source_provider",PROVIDER).eq("is_live",true).eq("status","open").lt("last_updated_at",cutoff);
  if(suspendError)throw suspendError;
  return reply({ok:true,provider:PROVIDER,mode:"live_odds",provider_fixtures:rows.length,local_live_fixtures:local.length,matched_fixtures:matchedIds.size,markets_created:marketsCreated,selections_updated:selectionsUpdated,skipped,requests:1,provider_requests_remaining:body?.results??null});
 }catch(e){console.error("api-football-live-odds-sync",e);return reply({ok:false,provider:PROVIDER,error:e instanceof Error?e.message:"Live odds sync failed"},502);}
});