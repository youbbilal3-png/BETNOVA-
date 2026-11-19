import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, Gift, RefreshCw, ShieldCheck, X, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './admin-rewards.css'

type Props = { onClose: () => void }
type EarnItem = { id:string; user_id:string; platform:string; post_url:string; proof_path:string; status:string; created_at:string }
type ReferralItem = { referred_user_id:string; referrer_user_id:string; referral_code:string; status:string; created_at:string }

export default function AdminRewardsPanel({ onClose }: Props) {
  const [earn, setEarn] = useState<EarnItem[]>([])
  const [referrals, setReferrals] = useState<ReferralItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<Record<string,string>>({})
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!supabase) { setMessage('Supabase is not configured.'); setLoading(false); return }
    setLoading(true); setMessage('')
    const [e,r] = await Promise.all([
      supabase.from('earn_post_submissions').select('id,user_id,platform,post_url,proof_path,status,created_at').eq('status','pending').order('created_at',{ascending:true}).limit(100),
      supabase.from('referrals').select('referred_user_id,referrer_user_id,referral_code,status,created_at').eq('status','pending').order('created_at',{ascending:true}).limit(100),
    ])
    if (e.error) setMessage(e.error.message)
    else setEarn((e.data ?? []) as EarnItem[])
    if (r.error) setMessage(current => current ? current + ' · ' + r.error!.message : r.error!.message)
    else setReferrals((r.data ?? []) as ReferralItem[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function openProof(path:string) {
    if (!supabase) return
    const { data,error } = await supabase.storage.from('earn-proofs').createSignedUrl(path,90)
    if (error) { setMessage(error.message); return }
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }

  async function reviewEarn(item:EarnItem, action:'approve'|'reject') {
    if (!supabase) return
    setBusy(item.id); setMessage('')
    const { error } = await supabase.rpc('betnova_review_earn_submission',{
      p_submission_id:item.id,p_action:action,p_review_note:note[item.id]?.trim() || null,
    })
    if (error) setMessage(error.message)
    else { setEarn(rows => rows.filter(row => row.id !== item.id)); setMessage(action==='approve'?'Approved · 50 DZD credited to the cash wallet.':'Submission rejected; no reward was credited.') }
    setBusy(null)
  }

  async function reviewReferral(item:ReferralItem, action:'approve'|'reject') {
    if (!supabase) return
    setBusy(item.referred_user_id); setMessage('')
    const { error } = await supabase.rpc('betnova_review_referral',{
      p_referred_user_id:item.referred_user_id,p_action:action,p_review_note:note[item.referred_user_id]?.trim() || null,
    })
    if (error) setMessage(error.message)
    else { setReferrals(rows => rows.filter(row => row.referred_user_id !== item.referred_user_id)); setMessage(action==='approve'?'Referral approved · 100 DZD credited to the referrer cash wallet.':'Referral rejected; no reward was credited.') }
    setBusy(null)
  }

  return <div className="admin-rewards-backdrop" onMouseDown={event => { if(event.target===event.currentTarget) onClose() }}>
    <section className="admin-rewards-panel" role="dialog" aria-modal="true" aria-labelledby="admin-rewards-title">
      <button className="admin-rewards-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
      <div className="admin-rewards-kicker"><ShieldCheck size={15}/> BETNOVA · REWARDS REVIEW</div>
      <h2 id="admin-rewards-title">Earn & referral review</h2>
      <p>Review evidence before issuing cash-wallet rewards. Approval is recorded once and cannot be repeated.</p>
      {message && <div className="admin-rewards-message" role="status">{message}</div>}
      <div className="admin-rewards-section-title"><b>Social post submissions</b><span>{earn.length} pending</span><button onClick={() => void load()} aria-label="Refresh"><RefreshCw size={14}/></button></div>
      {loading ? <p className="admin-rewards-empty">Loading…</p> : earn.length ? earn.map(item => <article className="admin-rewards-item" key={item.id}>
        <b>{item.platform.toUpperCase()} · 50 DZD</b><small>User {item.user_id.slice(0,8)}… · {new Date(item.created_at).toLocaleString()}</small>
        <a href={item.post_url} target="_blank" rel="noreferrer">Open public post <ExternalLink size={12}/></a>
        <button className="admin-rewards-proof" onClick={() => void openProof(item.proof_path)}>View screenshot proof</button>
        <textarea rows={2} value={note[item.id] ?? ''} onChange={event => setNote(current => ({...current,[item.id]:event.target.value}))} placeholder="Internal review note (optional)"/>
        <div><button disabled={busy===item.id} onClick={() => void reviewEarn(item,'approve')}><CheckCircle2 size={14}/> Approve & credit</button><button className="reject" disabled={busy===item.id} onClick={() => void reviewEarn(item,'reject')}><XCircle size={14}/> Reject</button></div>
      </article>) : <p className="admin-rewards-empty">No pending social submissions.</p>}
      <div className="admin-rewards-section-title"><b>Referral registrations</b><span>{referrals.length} pending</span></div>
      {referrals.length ? referrals.map(item => <article className="admin-rewards-item" key={item.referred_user_id}>
        <b><Gift size={14}/> 100 DZD referral</b><small>Referrer {item.referrer_user_id.slice(0,8)}… · New account {item.referred_user_id.slice(0,8)}…</small>
        <small>Code {item.referral_code} · {new Date(item.created_at).toLocaleString()}</small>
        <textarea rows={2} value={note[item.referred_user_id] ?? ''} onChange={event => setNote(current => ({...current,[item.referred_user_id]:event.target.value}))} placeholder="Internal review note (optional)"/>
        <div><button disabled={busy===item.referred_user_id} onClick={() => void reviewReferral(item,'approve')}><CheckCircle2 size={14}/> Verify & credit</button><button className="reject" disabled={busy===item.referred_user_id} onClick={() => void reviewReferral(item,'reject')}><XCircle size={14}/> Reject</button></div>
      </article>) : <p className="admin-rewards-empty">No pending referrals.</p>}
    </section>
  </div>
}
