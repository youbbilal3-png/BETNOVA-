import { useEffect, useState } from 'react'
import { Clock3, RefreshCw, Ticket, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type Props = { onClose: () => void }
type Leg = { market_label: string; selection_label: string; odds_snapshot: number; result_status: string; fixtures?: { home_score: number | null; away_score: number | null; status: string } | null }
type Bet = { id: string; stake: number; currency: string; combined_odds: number; potential_return: number; status: string; created_at: string; bet_legs: Leg[] }
const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(amount)

export default function MyBetsPanel({onClose}:Props) {
 const {t}=useLanguage()
 const [bets,setBets]=useState<Bet[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [filter,setFilter]=useState('all')
 async function load(){
  if(!supabase){setLoading(false);return}
  const {data:{user}}=await supabase.auth.getUser()
  if(!user){setError(t('sign_in_bets'));setLoading(false);return}
  const {data,error}=await supabase.from('bets').select('id,stake,currency,combined_odds,potential_return,status,created_at,bet_legs(market_label,selection_label,odds_snapshot,result_status,fixtures(home_score,away_score,status))').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50)
  if(error){setError(t('could_not_load_bet_history'));setBets([])}else{setBets((data??[]) as unknown as Bet[]);setError('')}
  setLoading(false)
 }
 useEffect(()=>{
  void load()
  if(!supabase)return
  const client=supabase
  const channel=client.channel('my-bets-updates').on('postgres_changes',{event:'*',schema:'public',table:'bets'},()=>{void load()}).subscribe()
  return ()=>{void client.removeChannel(channel)}
 },[])
 const visible=bets.filter(b=>filter==='all'||b.status===filter)
 return <div className="bets-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="bets-panel" role="dialog" aria-modal="true" aria-labelledby="my-bets-title">
   <button className="wallet-close" onClick={onClose} aria-label="Close bets"><X size={19}/></button>
   <div className="wallet-kicker"><Ticket size={15}/> BETNOVA · MY ACTIVITY</div>
   <h2 id="my-bets-title">{t('my_bets')}</h2>
   <div className="bets-filters">{['all','pending','won','lost','void'].map(v=><button key={v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{v==='all'?t('all'):t(v as 'pending'|'won'|'lost'|'void')}</button>)}</div>
   {loading?<div className="markets-loading">{t('loading_markets')}</div>:error?<div className="markets-empty">{error}</div>:visible.length===0?<div className="markets-empty"><Ticket size={22}/><b>{t('no_bets')}</b><span>{t('no_bets_desc')}</span></div>:<div className="bets-list">{visible.map(b=><article className="bet-history-card" key={b.id}>
    <div className="bet-history-head"><span>#{b.id.slice(0,8)}</span><b className={'bet-status '+b.status}>{b.status}</b></div>
    <div className="bet-history-numbers"><div><small>{t('stake')}</small><b>{money(Number(b.stake),b.currency)}</b></div><div><small>{t('odds')}</small><b>{Number(b.combined_odds).toFixed(2)}</b></div><div><small>{t('potential_return')}</small><b>{money(Number(b.potential_return),b.currency)}</b></div></div>
    <div className="bet-history-legs">{(b.bet_legs??[]).map((leg,i)=><div key={i}><span>{leg.market_label}: <b>{leg.selection_label}</b></span><strong>{Number(leg.odds_snapshot).toFixed(2)}</strong><small>{leg.result_status}</small></div>)}</div>
    <small className="bet-history-date"><Clock3 size={11}/> {new Date(b.created_at).toLocaleString()}</small>
   </article>)}</div>}
   <button className="wallet-refresh" onClick={()=>{setLoading(true);void load()}}><RefreshCw size={13}/> {t('refresh')}</button>
  </section>
 </div>
}
