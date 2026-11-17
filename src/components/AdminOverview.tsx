import { useCallback, useEffect, useState } from 'react'
import { Activity, CalendarDays, CheckCircle2, Clock3, CreditCard, RefreshCw, ShieldCheck, Trophy, Users, Wallet, X, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = { onClose: () => void }
type Counts = { sports: number; competitions: number; teams: number; fixtures: number; markets: number }
type Deposit = { id: string; user_id: string; payment_method: string; amount: number; currency: string; sender_reference: string | null; proof_path: string | null; created_at: string }
type Withdrawal = { id: string; user_id: string; payment_method: string; amount: number; currency: string; destination_details: string; created_at: string }
type PaymentMethod = { id: string; code: string; display_name: string; is_enabled: boolean; supported_currencies: string[]; instructions: Record<string, unknown> }

const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)

export default function AdminOverview({ onClose }: Props) {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [tab, setTab] = useState<'deposits' | 'withdrawals' | 'payments'>('deposits')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [instructionDrafts, setInstructionDrafts] = useState<Record<string, string>>({})
  const [currencyDrafts, setCurrencyDrafts] = useState<Record<string, string[]>>({})
  const [payoutReferences, setPayoutReferences] = useState<Record<string, string>>({})

  const loadFinance = useCallback(async () => {
    if (!supabase) return
    const [d, w, p] = await Promise.all([
      supabase.from('deposit_requests').select('id,user_id,payment_method,amount,currency,sender_reference,proof_path,created_at').eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('withdrawal_requests').select('id,user_id,payment_method,amount,currency,destination_details,created_at').eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('payment_methods').select('id,code,display_name,is_enabled,supported_currencies,instructions').order('sort_order')
    ])
    if (d.error) throw d.error
    if (w.error) throw w.error
    if (p.error) throw p.error
    setDeposits((d.data ?? []) as Deposit[])
    setWithdrawals((w.data ?? []) as Withdrawal[])
    setMethods((p.data ?? []) as PaymentMethod[])
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      const client = supabase
      if (!client) { if (active) { setError('Supabase is not configured.'); setChecking(false) }; return }
      try {
        const { data: { user }, error: userError } = await client.auth.getUser()
        if (userError) throw userError
        if (!user) { if (active) { setIsAdmin(false); setChecking(false) }; return }
        const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle()
        if (profileError) throw profileError
        if (!active) return
        const allowed = profile?.role === 'admin'
        setIsAdmin(allowed)
        if (!allowed) { setChecking(false); return }
        const names = ['sports', 'competitions', 'teams', 'fixtures', 'markets'] as const
        const results = await Promise.all(names.map(name => client.from(name).select('id', { count: 'exact', head: true })))
        const failed = results.find(result => result.error)
        if (failed?.error) throw failed.error
        if (active) setCounts({
          sports: results[0].count ?? 0, competitions: results[1].count ?? 0,
          teams: results[2].count ?? 0, fixtures: results[3].count ?? 0, markets: results[4].count ?? 0,
        })
        await loadFinance()
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load the admin overview.')
      } finally { if (active) setChecking(false) }
    }
    void load()
    return () => { active = false }
  }, [loadFinance])

  async function openDepositProof(path: string) {
    if (!supabase) return
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    const { data, error: signedError } = await supabase.storage.from('deposit-proofs').createSignedUrl(path, 300)
    if (signedError || !data?.signedUrl) {
      if (tab) tab.close()
      setError('Could not open the payment proof.')
      return
    }
    if (tab) tab.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }

  async function reviewDeposit(id: string, approve: boolean) {
    if (!supabase) return
    setBusyId(id); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('betnova_review_deposit', { p_request_id: id, p_approve: approve, p_admin_note: null })
      if (rpcError) throw rpcError
      setNotice(approve ? 'Deposit approved and wallet credited.' : 'Deposit rejected.')
      await loadFinance()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not review deposit.') }
    finally { setBusyId(null) }
  }

  async function reviewWithdrawal(id: string, action: 'paid' | 'reject') {
    if (!supabase) return
    const payoutReference = (payoutReferences[id] ?? '').trim()
    if (action === 'paid' && payoutReference.length < 4) {
      setError('Enter the external transfer reference before marking this withdrawal paid.')
      return
    }
    setBusyId(id); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('betnova_review_withdrawal', {
        p_request_id: id, p_action: action, p_admin_note: null, p_payout_reference: action === 'paid' ? payoutReference : null
      })
      if (rpcError) throw rpcError
      setNotice(action === 'paid' ? 'Withdrawal marked paid. Confirm the external transfer was completed.' : 'Withdrawal rejected and reserved funds released.')
      await loadFinance()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not review withdrawal.') }
    finally { setBusyId(null) }
  }

  async function saveCurrencies(method: PaymentMethod) {
    if (!supabase) return
    const currencies = currencyDrafts[method.id] ?? method.supported_currencies
    if (!currencies.length) { setError('Select at least one supported currency.'); return }
    setBusyId(method.id); setError(''); setNotice('')
    try {
      const { error: updateError } = await supabase.from('payment_methods').update({ supported_currencies: currencies }).eq('id', method.id)
      if (updateError) throw updateError
      setNotice(`Currencies saved for ${method.display_name}.`)
      await loadFinance()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save supported currencies.') }
    finally { setBusyId(null) }
  }

  async function saveInstructions(method: PaymentMethod) {
    if (!supabase) return
    setBusyId(method.id); setError(''); setNotice('')
    try {
      const instructions = JSON.parse(instructionDrafts[method.id] ?? JSON.stringify(method.instructions))
      if (!instructions || typeof instructions !== 'object' || Array.isArray(instructions)) throw new Error('Instructions must be a JSON object.')
      const { error: updateError } = await supabase.from('payment_methods').update({ instructions }).eq('id', method.id)
      if (updateError) throw updateError
      setNotice(`Instructions saved for ${method.display_name}.`)
      await loadFinance()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save payment instructions.') }
    finally { setBusyId(null) }
  }

  async function togglePaymentMethod(method: PaymentMethod) {
    if (!supabase) return
    const hasInstructions = Object.values(method.instructions ?? {}).some(value => typeof value === 'string' && value.trim().length > 0)
    if (!method.is_enabled && !hasInstructions) {
      setError('Add and save the receiving account details before enabling this payment method.')
      return
    }
    setBusyId(method.id); setError(''); setNotice('')
    try {
      const { error: updateError } = await supabase.from('payment_methods').update({ is_enabled: !method.is_enabled }).eq('id', method.id)
      if (updateError) throw updateError
      setNotice(`${method.display_name} ${method.is_enabled ? 'disabled' : 'enabled'}.`)
      await loadFinance()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update payment method.') }
    finally { setBusyId(null) }
  }

  return <div className="admin-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <button className="admin-close" onClick={onClose} aria-label="Close administration"><X size={19}/></button>
      <div className="admin-kicker"><ShieldCheck size={14}/> BETNOVA CONTROL CENTER</div>
      <h2 id="admin-title">Administration</h2>
      {checking ? <p className="admin-message">Verifying your administrator access…</p> :
        error && !isAdmin ? <p className="admin-message error">{error}</p> :
        !isAdmin ? <p className="admin-message">This account does not have administrator permissions.</p> :
        <>
          <div className="admin-count-grid">
            <div><Activity size={17}/><b>{counts?.sports ?? '—'}</b><span>Sports</span></div>
            <div><Trophy size={17}/><b>{counts?.competitions ?? '—'}</b><span>Competitions</span></div>
            <div><Users size={17}/><b>{counts?.teams ?? '—'}</b><span>Teams</span></div>
            <div><CalendarDays size={17}/><b>{counts?.fixtures ?? '—'}</b><span>Fixtures</span></div>
          </div>
          <div className="admin-market-row"><span>Markets configured</span><b>{counts?.markets ?? '—'}</b></div>
          <div className="admin-finance-tabs">
            <button className={tab === 'deposits' ? 'active' : ''} onClick={() => setTab('deposits')}><Wallet size={14}/> Deposits <b>{deposits.length}</b></button>
            <button className={tab === 'withdrawals' ? 'active' : ''} onClick={() => setTab('withdrawals')}><CreditCard size={14}/> Withdrawals <b>{withdrawals.length}</b></button>
            <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}><ShieldCheck size={14}/> Methods</button>
            <button className="admin-refresh" onClick={() => void loadFinance()} aria-label="Refresh finance"><RefreshCw size={14}/></button>
          </div>
          {error && <p className="admin-message error">{error}</p>}
          {notice && <p className="admin-message success">{notice}</p>}
          {tab === 'deposits' && <div className="admin-finance-list">
            {deposits.length === 0 ? <p className="admin-message">No pending deposits.</p> : deposits.map(item => <article className="admin-finance-item" key={item.id}>
              <div className="admin-finance-top"><b>{money(Number(item.amount), item.currency)}</b><span><Clock3 size={12}/> {new Date(item.created_at).toLocaleString()}</span></div>
              <p>{item.payment_method.toUpperCase()} · User {item.user_id.slice(0, 8)}…</p>
              {item.sender_reference && <small>Reference: {item.sender_reference}</small>}
              {item.proof_path && <small>Payment proof uploaded</small>}
              <div className="admin-finance-actions">{item.proof_path && <button onClick={() => void openDepositProof(item.proof_path!)}>View proof</button>}<button disabled={busyId === item.id} onClick={() => void reviewDeposit(item.id, true)}><CheckCircle2 size={14}/> Confirm received</button><button className="reject" disabled={busyId === item.id} onClick={() => void reviewDeposit(item.id, false)}><XCircle size={14}/> Reject</button></div>
            </article>)}
          </div>}
          {tab === 'withdrawals' && <div className="admin-finance-list">
            {withdrawals.length === 0 ? <p className="admin-message">No pending withdrawals.</p> : withdrawals.map(item => <article className="admin-finance-item" key={item.id}>
              <div className="admin-finance-top"><b>{money(Number(item.amount), item.currency)}</b><span><Clock3 size={12}/> {new Date(item.created_at).toLocaleString()}</span></div>
              <p>{item.payment_method.toUpperCase()} · User {item.user_id.slice(0, 8)}…</p>
              <small>Destination: {item.destination_details}</small>
              <label className="admin-payout-reference">External transfer reference<input value={payoutReferences[item.id] ?? ''} onChange={event => setPayoutReferences(current => ({ ...current, [item.id]: event.target.value }))} placeholder="Transaction / transfer ID" maxLength={160} /></label>
              <div className="admin-finance-actions"><button disabled={busyId === item.id || (payoutReferences[item.id] ?? '').trim().length < 4} onClick={() => void reviewWithdrawal(item.id, 'paid')}><CheckCircle2 size={14}/> Mark paid</button><button className="reject" disabled={busyId === item.id} onClick={() => void reviewWithdrawal(item.id, 'reject')}><XCircle size={14}/> Reject & release</button></div>
            </article>)}
          </div>}
          {tab === 'payments' && <div className="admin-finance-list">
            {methods.length === 0 ? <p className="admin-message">Add payment methods to the payment_methods table to configure them here.</p> : methods.map(method => <article className="admin-finance-item" key={method.id}>
              <div className="admin-finance-top"><b>{method.display_name}</b><span>{method.is_enabled ? 'Enabled' : 'Disabled'}</span></div>
              <p>{method.code} · {(currencyDrafts[method.id] ?? method.supported_currencies).join(', ')}</p>
              <div className="admin-currency-options">{['DZD','USD','EUR'].map(currency => <label key={currency}><input type="checkbox" checked={(currencyDrafts[method.id] ?? method.supported_currencies).includes(currency)} onChange={event => setCurrencyDrafts(current => ({...current,[method.id]:event.target.checked?[...(current[method.id] ?? method.supported_currencies),currency]:(current[method.id] ?? method.supported_currencies).filter(value=>value!==currency)}))}/>{currency}</label>)}</div>
              <div className="admin-finance-actions"><button disabled={busyId === method.id} onClick={() => void saveCurrencies(method)}>Save currencies</button></div>
              <textarea className="admin-instructions-editor" value={instructionDrafts[method.id] ?? JSON.stringify(method.instructions, null, 2)} onChange={event => setInstructionDrafts(current => ({ ...current, [method.id]: event.target.value }))} rows={4} aria-label={`Instructions for ${method.display_name}`} />
              <div className="admin-finance-actions"><button disabled={busyId === method.id} onClick={() => void saveInstructions(method)}>Save instructions</button><button className="admin-method-toggle" disabled={busyId === method.id} onClick={() => void togglePaymentMethod(method)}>{method.is_enabled ? 'Disable method' : 'Enable method'}</button></div>
            </article>)}
          </div>}
          <div className="admin-safety-note"><ShieldCheck size={15}/> Deposit approvals credit the wallet atomically. Withdrawals reserve funds until you mark the external transfer paid or reject the request.</div>
        </>}
    </section>
  </div>
}
