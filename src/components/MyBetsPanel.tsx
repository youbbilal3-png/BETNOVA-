import { useCallback, useEffect, useState } from 'react'
import { Clock3, RefreshCw, Ticket, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type Props = { onClose: () => void }
type Leg = { market_label: string; selection_label: string; odds_snapshot: number; result_status: string }
type Bet = { id: string; stake: number; currency: string; combined_odds: number; potential_return: number; credited_payout: number; status: string; created_at: string; bet_legs: Leg[] }
const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(amount)

export default function MyBetsPanel({onClose}:Props) {
 const {t}=useLanguage()
 const [bets,setBets]=useState<Bet[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [filter,setFilter]=useState('all')

 const load=useCallback(async (showSpinner = true) => {
  if(showSpinner) setLoading(true)
  setError('')
  if(!supabase){setError(t('could_not_load_bet_history'));setLoading(false);return}
  try {
   const {data:{user},error:authError}=await supabase.auth.getUser()
   if(authError) throw authError
   if(!user){setError(t('sign_in_bets'));setBets([]);return}
   // Fetch the user's bet rows first, independently of nested PostgREST relationships.
   const {data:rows,error:betError}=await supabase
    .from('bets')
    .select('id,stake,currency,combined_odds,potential_return,credited_payout,status,created_at')
    .eq('user_id',user.id)
    .order('created_at',{ascending:false})
    .limit(100)
   if(betError) throw betError
   const base=(rows??[]) as Omit<Bet,'bet_legs'>[]
   if(base.length===0){setBets([]);return}
   const ids=base.map(b=>b.id)
   const {data:legs,error:legsError}=await supabase
    .from('bet_legs')
    .select('bet_id,market_label,selection_label,odds_snapshot,result_status')
    .in('bet_id',ids)
    .order('created_at',{ascending:true})
   if(legsError) throw legsError
   const grouped=new Map<string,Leg[]>()
   for(const leg of legs??[]){
    const list=grouped.get(leg.bet_id)??[]
    list.push({market_label:leg.market_label,selection_label:leg.selection_label,odds_snapshot:Number(leg.odds_snapshot),result_status:leg.result_status})
    grouped.set(leg.bet_id,list)
   }
   setBets(base.map(b=>({...b,bet_legs:grouped.get(b.id)??[]})))
  } catch (err) {
   console.error('[BETNOVA] My bets load failed',err)
   setError(t('could_not_load_bet_history'))
   setBets([])
  } finally {
   setLoading(false)
  }
 },[t])

 useEffect(()=>{
  void load()
  if(!supabase)return
  let userId:string|undefined
  let removeChannel:(()=>void)|undefined
  let active=true
  void supabase.auth.getUser().then(({data})=>{
   if(!active||!data.user)return
   userId=data.user.id
   const channel=supabase!.channel('my-bets-updates-'+userId)
    .on('postgres_changes',{event:'*',schema:'public',table:'bets',filter:'user_id=eq.'+userId},()=>{void load(false)})
    .subscribe()
   removeChannel=()=>{void supabase!.removeChannel(channel)}
  })
  return ()=>{active=false;removeChannel?.()}
 },[load])

 const visible=bets.filter(b=>filter==='all'||b.status===filter)
 return <div className="bets-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="bets-panel" role="dialog" aria-modal="true" aria-labelledby="my-bets-title">
   <button className="wallet-close" onClick={onClose} aria-label={t('close')}><X size={19}/></button>
   <div className="wallet-kicker"><Ticket size={15}/> BETNOVA · {t('my_bets').toUpperCase()}</div>
   <h2 id="my-bets-title">{t('my_bets')}</h2>
   <div className="bets-filters">{['all','pending','won','lost','void'].map(v=><button key={v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{v==='all'?t('all'):t(v as 'pending'|'won'|'lost'|'void')}</button>)}</div>
   {loading?<div className="markets-loading">{t('loading_markets')}</div>:error?<div className="markets-empty">{error}</div>:visible.length===0?<div className="markets-empty"><Ticket size={22}/><b>{t('no_bets')}</b><span>{t('no_bets_desc')}</span></div>:<div className="bets-list">{visible.map(b=><article className="bet-history-card" key={b.id}>
    <div className="bet-history-head"><span>#{b.id.slice(0,8)}</span><b className={'bet-status '+b.status}>{['pending','won','lost','void'].includes(b.status) ? t(b.status as 'pending'|'won'|'lost'|'void') : b.status}</b></div>
    <div className="bet-history-numbers"><div><small>{t('stake')}</small><b>{money(Number(b.stake),b.currency)}</b></div><div><small>{t('odds')}</small><b>{Number(b.combined_odds).toFixed(2)}</b></div><div><small>{b.status === 'pending' ? t('potential_return') : t('settled_payout')}</small><b>{money(Number(b.status === 'pending' ? b.potential_return : b.credited_payout ?? 0),b.currency)}</b></div></div>
    <div className="bet-history-legs">{(b.bet_legs??[]).map((leg,i)=><div key={i}><span>{leg.market_label}: <b>{leg.selection_label}</b></span><strong>{Number(leg.odds_snapshot).toFixed(2)}</strong><small>{leg.result_status}</small></div>)}</div>
    <small className="bet-history-date"><Clock3 size={11}/> {new Date(b.created_at).toLocaleString()}</small>
   </article>)}</div>}
   <button className="wallet-refresh" onClick={()=>{void load()}} disabled={loading}><RefreshCw size={13}/> {t('refresh')}</button>
  </section>
 </div>
}
