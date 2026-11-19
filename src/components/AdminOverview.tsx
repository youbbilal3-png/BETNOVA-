import { useCallback, useEffect, useState } from 'react'
import { Activity, CalendarDays, CheckCircle2, Clock3, CreditCard, Headphones, Mail, RefreshCw, ShieldCheck, Trophy, Users, Wallet, X, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import PaymentMethodLogo from './PaymentMethodLogo'

type Props = { onClose: () => void }
type ProviderHealth = {
  sportsapi_requests_today: number
  sportsapi_daily_limit: number
  sportsapi_mapped_fixtures: number
  sportsapi_correction_holds: number
  live_markets_total: number
  live_markets_fresh: number
  prematch_markets_total: number
  prematch_markets_fresh: number
  last_market_update: string | null
  fivedollar_requests_last_hour: number
  fivedollar_request_hour_limit: number
  fivedollar_fixtures_total: number
  fivedollar_live_fixtures: number
  fivedollar_live_markets: number
  fivedollar_prematch_markets: number
  fivedollar_last_request: string | null
}
type Counts = { sports: number; competitions: number; teams: number; fixtures: number; markets: number }
type Deposit = { id: string; user_id: string; payment_method: string; amount: number; currency: string; sender_reference: string | null; proof_path: string | null; created_at: string }
type Withdrawal = { id: string; user_id: string; payment_method: string; amount: number; currency: string; destination_details: string; created_at: string }
type BonusWithdrawal = { id:string; user_id:string; payment_method:string; amount:number; currency:string; bonus_amount_usd:number; destination_details:string; created_at:string }
type PaymentMethod = { id: string; code: string; display_name: string; is_enabled: boolean; is_withdrawal_enabled: boolean; supported_currencies: string[]; instructions: Record<string, unknown> }
type SupportRequest = { id: string; user_id: string | null; full_name: string | null; email: string; category: string; subject: string; message: string; status: 'open' | 'in_progress' | 'resolved'; admin_note: string | null; created_at: string }

const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)

export default function AdminOverview({ onClose }: Props) {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [bonusWithdrawals, setBonusWithdrawals] = useState<BonusWithdrawal[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([])
  const [supportEmail, setSupportEmail] = useState('')
  const [supportEmailDraft, setSupportEmailDraft] = useState('')
  const [supportNotes, setSupportNotes] = useState<Record<string, string>>({})
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | null>(null)
  const [providerHealthError, setProviderHealthError] = useState('')
  const [tab, setTab] = useState<'deposits' | 'withdrawals' | 'bonus' | 'support' | 'payments' | 'providers' | 'wallet'>('deposits')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [instructionDrafts, setInstructionDrafts] = useState<Record<string, Record<string, string>>>({})
  const [currencyDrafts, setCurrencyDrafts] = useState<Record<string, string[]>>({})
  const [payoutReferences, setPayoutReferences] = useState<Record<string, string>>({})
  const [ownerCreditAmount, setOwnerCreditAmount] = useState('')
  const [ownerCreditCurrency, setOwnerCreditCurrency] = useState('DZD')
  const [ownerCreditNote, setOwnerCreditNote] = useState('Owner wallet top-up')
  const [ownerWalletBalance, setOwnerWalletBalance] = useState<number | null>(null)

  const loadProviderHealth = useCallback(async () => {
    if (!supabase) {
      setProviderHealthError('Supabase is not configured.')
      return
    }
    setProviderHealthError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('betnova_admin_provider_health')
      if (rpcError) throw rpcError
      setProviderHealth(data as ProviderHealth)
    } catch (caught) {
      setProviderHealthError(caught instanceof Error ? caught.message : 'Provider health could not be loaded.')
    }
  }, [])

  const loadSupport = useCallback(async () => {
    if (!supabase) return
    const [requests, settings] = await Promise.all([
      supabase.from('support_requests').select('id,user_id,full_name,email,category,subject,message,status,admin_note,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('support_settings').select('support_email').eq('id', true).maybeSingle()
    ])
    if (requests.error) throw requests.error
    if (settings.error) throw settings.error
    setSupportRequests((requests.data ?? []) as SupportRequest[])
    setSupportEmail(String(settings.data?.support_email ?? ''))
    setSupportEmailDraft(String(settings.data?.support_email ?? ''))
  }, [])

  const loadFinance = useCallback(async () => {
    if (!supabase) return
    const [d, w, b, p] = await Promise.all([
      supabase.from('deposit_requests').select('id,user_id,payment_method,amount,currency,sender_reference,proof_path,created_at').eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('withdrawal_requests').select('id,user_id,payment_method,amount,currency,destination_details,created_at').eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('bonus_withdrawal_requests').select('id,user_id,payment_method,amount,currency,bonus_amount_usd,destination_details,created_at').eq('status','pending').order('created_at',{ascending:true}),
      supabase.from('payment_methods').select('id,code,display_name,is_enabled,is_withdrawal_enabled,supported_currencies,instructions').order('sort_order')
    ])
    if (d.error) throw d.error
    if (w.error) throw w.error
    if (b.error) throw b.error
    if (p.error) throw p.error
    setDeposits((d.data ?? []) as Deposit[])
    setWithdrawals((w.data ?? []) as Withdrawal[])
    setBonusWithdrawals((b.data ?? []) as BonusWithdrawal[])
    setMethods((p.data ?? []) as PaymentMethod[])
  }, [])

  async function refreshFinance() {
    setError('')
    setNotice('')
    try {
      await loadFinance()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh administration data.')
    }
  }

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
        await Promise.all([loadFinance(), loadProviderHealth(), loadSupport()])
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load the admin overview.')
      } finally { if (active) setChecking(false) }
    }
    void load()
    return () => { active = false }
  }, [loadFinance, loadProviderHealth, loadSupport])

  async function saveSupportEmail() {
    if (!supabase) return
    const value = supportEmailDraft.trim()
    if (value && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) { setError('Enter a valid support email address.'); return }
    setBusyId('support-email'); setError(''); setNotice('')
    try {
      const { error: updateError } = await supabase.from('support_settings').update({ support_email: value || null, updated_at: new Date().toISOString() }).eq('id', true)
      if (updateError) throw updateError
      setSupportEmail(value)
      setNotice('Public support email saved.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the support email.') }
    finally { setBusyId(null) }
  }

  async function updateSupportRequest(item: SupportRequest) {
    if (!supabase) return
    setBusyId(item.id); setError(''); setNotice('')
    try {
      const { error: updateError } = await supabase.from('support_requests').update({ status: item.status, admin_note: supportNotes[item.id] ?? item.admin_note, updated_at: new Date().toISOString() }).eq('id', item.id)
      if (updateError) throw updateError
      setNotice('Support request updated.')
      await loadSupport()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this support request.') }
    finally { setBusyId(null) }
  }

  async function loadOwnerWallet() {
    if (!supabase) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error: readError } = await supabase.from('wallet_accounts').select('available_balance').eq('user_id', user.id).eq('currency', ownerCreditCurrency).maybeSingle()
    if (readError) { setError(readError.message); return }
    setOwnerWalletBalance(Number(data?.available_balance ?? 0))
  }

  async function creditOwnerWallet() {
    if (!supabase) return
    const amount = Number(ownerCreditAmount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !ownerCreditNote.trim()) { setError('Enter a valid amount and a reason for this credit.'); return }
    setBusyId('owner-wallet'); setError(''); setNotice('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Sign in again to continue.')
      const { data, error: rpcError } = await supabase.rpc('betnova_admin_credit_wallet', { p_user_id: user.id, p_amount: amount, p_currency: ownerCreditCurrency, p_description: ownerCreditNote.trim(), p_idempotency_key: crypto.randomUUID() })
      if (rpcError) throw rpcError
      setOwnerCreditAmount('')
      setNotice('Wallet credited successfully. New balance: ' + money(Number(data), ownerCreditCurrency))
      await loadOwnerWallet()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not credit owner wallet.') }
    finally { setBusyId(null) }
  }
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

  async function reviewBonusWithdrawal(id: string, action: 'paid' | 'reject') {
    if (!supabase) return
    const payoutReference = (payoutReferences[id] ?? '').trim()
    if (action === 'paid' && payoutReference.length < 4) { setError('Enter the transfer reference before marking this bonus withdrawal paid.'); return }
    setBusyId(id); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('betnova_review_bonus_withdrawal', {p_request_id:id,p_action:action,p_admin_note:null,p_payout_reference:action === 'paid' ? payoutReference : null})
      if (rpcError) throw rpcError
      setNotice(action === 'paid' ? 'Bonus withdrawal marked paid.' : 'Bonus withdrawal rejected; bonus funds returned to the bonus wallet.')
      await loadFinance()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not review bonus withdrawal.') }
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
      const current = method.instructions ?? {}
      const draft = instructionDrafts[method.id] ?? {}
      const fieldKey = method.code === 'paysera' ? 'iban' : method.code === 'baridimob' ? 'account_number' : 'account_id'
      const fieldValue = (draft[fieldKey] ?? String(current[fieldKey] ?? '')).trim()
      const note = (draft.instructions ?? String(current.instructions ?? '')).trim()
      if (!fieldValue) throw new Error('Enter the receiving account ID / IBAN / number before saving.')
      const instructions = { ...current, [fieldKey]: fieldValue, instructions: note }
      const { error: updateError } = await supabase.from('payment_methods').update({ instructions }).eq('id', method.id)
      if (updateError) throw updateError
      setNotice(`Instructions saved for ${method.display_name}.`)
      await loadFinance()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save payment instructions.') }
    finally { setBusyId(null) }
  }

  async function toggleWithdrawalMethod(method: PaymentMethod) {
    if (!supabase) return
    setBusyId(method.id); setError(''); setNotice('')
    try {
      const { error: updateError } = await supabase.from('payment_methods').update({ is_withdrawal_enabled: !method.is_withdrawal_enabled }).eq('id', method.id)
      if (updateError) throw updateError
      setNotice(`${method.display_name} withdrawal ${method.is_withdrawal_enabled ? 'disabled' : 'enabled'}.`)
      await loadFinance()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update withdrawal method.') }
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
            <button className={tab === 'bonus' ? 'active' : ''} onClick={() => setTab('bonus')}><Wallet size={14}/> Bonus withdrawals <b>{bonusWithdrawals.length}</b></button>
            <button className={tab === 'support' ? 'active' : ''} onClick={() => { setTab('support'); void loadSupport() }}><Headphones size={14}/> Help & support <b>{supportRequests.filter(item => item.status === 'open').length}</b></button>
            <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}><ShieldCheck size={14}/> Methods</button>
            <button className={tab === 'providers' ? 'active' : ''} onClick={() => { setTab('providers'); void loadProviderHealth() }}><Activity size={14}/> Data health</button>
            <button className={tab === 'wallet' ? 'active' : ''} onClick={() => { setTab('wallet'); void loadOwnerWallet() }}><Wallet size={14}/> My wallet</button>
            <button className="admin-refresh" onClick={() => void refreshFinance()} aria-label="Refresh finance"><RefreshCw size={14}/></button>
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
          {tab === 'bonus' && <div className="admin-finance-list">
            {bonusWithdrawals.length === 0 ? <p className="admin-message">No pending bonus withdrawals.</p> : bonusWithdrawals.map(item => <article className="admin-finance-item" key={item.id}>
              <div className="admin-finance-top"><b>{money(Number(item.amount),item.currency)} · BONUS</b><span><Clock3 size={12}/> {new Date(item.created_at).toLocaleString()}</span></div>
              <p>{item.payment_method.toUpperCase()} · User {item.user_id.slice(0,8)}… · Bonus value {money(Number(item.bonus_amount_usd),'USD')}</p>
              <small>Destination: {item.destination_details}</small>
              <label className="admin-payout-reference">External transfer reference<input value={payoutReferences[item.id] ?? ''} onChange={event => setPayoutReferences(current => ({...current,[item.id]:event.target.value}))} placeholder="Transaction / transfer ID" maxLength={160}/></label>
              <div className="admin-finance-actions"><button disabled={busyId===item.id || (payoutReferences[item.id] ?? '').trim().length<4} onClick={() => void reviewBonusWithdrawal(item.id,'paid')}><CheckCircle2 size={14}/> Mark paid</button><button className="reject" disabled={busyId===item.id} onClick={() => void reviewBonusWithdrawal(item.id,'reject')}><XCircle size={14}/> Reject & return bonus</button></div>
            </article>)}
          </div>}
          {tab === 'support' && <div className="admin-finance-list">
            <article className="admin-finance-item admin-support-settings">
              <div className="admin-finance-top"><b><Mail size={15}/> Public contact email</b><span>Shown on Help & Support</span></div>
              <label className="admin-payout-reference">Official BETNOVA support email<input type="email" value={supportEmailDraft} onChange={event => setSupportEmailDraft(event.target.value)} maxLength={254} placeholder="support@your-domain.com" /></label>
              <div className="admin-finance-actions"><button disabled={busyId === 'support-email'} onClick={() => void saveSupportEmail()}>Save contact email</button></div>
            </article>
            {supportRequests.length === 0 ? <p className="admin-message">No support requests received yet.</p> : supportRequests.map(item => <article className="admin-finance-item admin-support-request" key={item.id}>
              <div className="admin-finance-top"><b>{item.subject}</b><span><Clock3 size={12}/> {new Date(item.created_at).toLocaleString()}</span></div>
              <p>{item.category} · {item.full_name || 'Visitor'} · {item.email}</p>
              <div className="admin-support-message">{item.message}</div>
              <div className="admin-support-controls"><label>Status<select value={item.status} onChange={event => setSupportRequests(current => current.map(row => row.id === item.id ? { ...row, status: event.target.value as SupportRequest['status'] } : row))}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></label><label>Administration note (optional)<textarea rows={2} value={supportNotes[item.id] ?? item.admin_note ?? ''} onChange={event => setSupportNotes(current => ({ ...current, [item.id]: event.target.value }))} maxLength={2000} placeholder="Internal note for this request" /></label></div>
              <div className="admin-finance-actions"><button onClick={() => { window.location.href = `mailto:${item.email}?subject=${encodeURIComponent('BETNOVA Support: ' + item.subject)}` }}><Mail size={14}/> Reply by email</button><button disabled={busyId === item.id} onClick={() => void updateSupportRequest(item)}><CheckCircle2 size={14}/> Save request</button></div>
            </article>)}
          </div>}
          {tab === 'wallet' && <div className="admin-finance-list">
            <article className="admin-finance-item">
              <div className="admin-finance-top"><b>Owner wallet</b><span>Administrator only</span></div>
              <p>Your personal BETNOVA wallet. Each new credit is a separate recorded transaction; the same submitted transaction cannot be duplicated.</p>
              <label className="admin-payout-reference">Currency<select value={ownerCreditCurrency} onChange={event => { setOwnerCreditCurrency(event.target.value); setOwnerWalletBalance(null) }}><option value="DZD">DZD · Algerian dinar</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option></select></label>
              <div className="admin-market-row"><span>Current available balance</span><b>{ownerWalletBalance === null ? '—' : money(ownerWalletBalance, ownerCreditCurrency)}</b></div>
              <label className="admin-payout-reference">Amount to add<input type="number" min="0.01" step="0.01" value={ownerCreditAmount} onChange={event => setOwnerCreditAmount(event.target.value)} placeholder="Enter amount" /></label>
              <label className="admin-payout-reference">Reason / note<input value={ownerCreditNote} onChange={event => setOwnerCreditNote(event.target.value)} maxLength={240} /></label>
              <div className="admin-finance-actions"><button disabled={busyId === 'owner-wallet' || !ownerCreditAmount || !ownerCreditNote.trim()} onClick={() => void creditOwnerWallet()}><Wallet size={14}/> Add funds to my wallet</button><button onClick={() => void loadOwnerWallet()}><RefreshCw size={14}/> Refresh balance</button></div>
            </article>
          </div>}
          {tab === 'providers' && <div className="admin-finance-list">
            {providerHealthError && <p className="admin-message error">{providerHealthError}</p>}
            {!providerHealth && !providerHealthError ? <p className="admin-message">Loading provider health…</p> : providerHealth && <>
              <article className="admin-finance-item">
                <div className="admin-finance-top"><b>SportsAPI live scores</b><span>{providerHealth.sportsapi_requests_today} / {providerHealth.sportsapi_daily_limit} requests today</span></div>
                <p>Mapped live fixtures: {providerHealth.sportsapi_mapped_fixtures}</p>
                <small>Automatic correction holds: {providerHealth.sportsapi_correction_holds}</small>
                <div className="admin-provider-meter"><span style={{width: Math.min(100, providerHealth.sportsapi_requests_today / Math.max(1, providerHealth.sportsapi_daily_limit) * 100) + '%'}} /></div>
                <small>Free-tier budget protection is active. Live score polling is paused until the correction workflow is validated.</small>
              </article>
              <article className="admin-finance-item">
                <div className="admin-finance-top"><b>FiveDollarFootballAPI · Bet365</b><span>{providerHealth.fivedollar_requests_last_hour} / {providerHealth.fivedollar_request_hour_limit} requests/hour</span></div>
                <p>{providerHealth.fivedollar_fixtures_total} fixtures · {providerHealth.fivedollar_live_fixtures} live now</p>
                <small>{providerHealth.fivedollar_live_markets} live markets · {providerHealth.fivedollar_prematch_markets} pre-match markets</small>
                <div className="admin-provider-meter"><span style={{width: Math.min(100, providerHealth.fivedollar_requests_last_hour / Math.max(1, providerHealth.fivedollar_request_hour_limit) * 100) + '%'}} /></div>
                <small>Live feed polls every 5 minutes. Request budget is capped below the provider's free-plan limit. Last API request: {providerHealth.fivedollar_last_request ? new Date(providerHealth.fivedollar_last_request).toLocaleString() : 'No request recorded'}</small>
              </article>
              <article className="admin-finance-item">
                <div className="admin-finance-top"><b>Live odds markets</b><span>{providerHealth.live_markets_fresh} / {providerHealth.live_markets_total} fresh</span></div>
                <p>Expired prices are automatically disabled.</p>
              </article>
              <article className="admin-finance-item">
                <div className="admin-finance-top"><b>Pre-match odds</b><span>{providerHealth.prematch_markets_fresh} / {providerHealth.prematch_markets_total} fresh</span></div>
                <small>Last market update: {providerHealth.last_market_update ? new Date(providerHealth.last_market_update).toLocaleString() : 'No update recorded'}</small>
              </article>
              <div className="admin-finance-actions"><button onClick={() => void loadProviderHealth()}><RefreshCw size={14}/> Refresh data health</button></div>
            </>}
          </div>}
          {tab === 'payments' && <div className="admin-finance-list">
            {methods.length === 0 ? <p className="admin-message">Add payment methods to the payment_methods table to configure them here.</p> : methods.map(method => <article className="admin-finance-item" key={method.id}>
              <div className="admin-finance-top admin-payment-method-top"><PaymentMethodLogo code={method.code} size={38}/><b>{method.display_name}</b><span>{method.is_enabled ? 'Deposits on' : 'Deposits off'} · {method.is_withdrawal_enabled ? 'Withdrawals on' : 'Withdrawals off'}</span></div>
              <p>{method.code} · {(currencyDrafts[method.id] ?? method.supported_currencies).join(', ')}</p>
              <div className="admin-currency-options">{['DZD','USD','EUR'].map(currency => <label key={currency}><input type="checkbox" checked={(currencyDrafts[method.id] ?? method.supported_currencies).includes(currency)} onChange={event => setCurrencyDrafts(current => ({...current,[method.id]:event.target.checked?[...(current[method.id] ?? method.supported_currencies),currency]:(current[method.id] ?? method.supported_currencies).filter(value=>value!==currency)}))}/>{currency}</label>)}</div>
              <div className="admin-finance-actions"><button disabled={busyId === method.id} onClick={() => void saveCurrencies(method)}>Save currencies</button></div>
              <label className="admin-method-instructions">{method.code === 'paysera' ? 'Paysera IBAN' : method.code === 'baridimob' ? 'BaridiMob account / CCP number' : method.code === 'redotpay' ? 'RedotPay ID' : 'Binance ID'}
                <input className="admin-instructions-editor" value={instructionDrafts[method.id]?.[method.code === 'paysera' ? 'iban' : method.code === 'baridimob' ? 'account_number' : 'account_id'] ?? String(method.instructions?.[method.code === 'paysera' ? 'iban' : method.code === 'baridimob' ? 'account_number' : 'account_id'] ?? method.instructions?.account_number ?? '')} onChange={event => { const key = method.code === 'paysera' ? 'iban' : method.code === 'baridimob' ? 'account_number' : 'account_id'; setInstructionDrafts(current => ({ ...current, [method.id]: { ...(current[method.id] ?? {}), [key]: event.target.value } })) }} placeholder={method.code === 'paysera' ? 'Enter IBAN' : method.code === 'baridimob' ? 'Enter CCP / account number' : 'Enter receiving ID'} />
              </label>
              <label className="admin-method-instructions">Additional customer instructions (optional)
                <textarea className="admin-instructions-editor" value={instructionDrafts[method.id]?.instructions ?? String(method.instructions?.instructions ?? '')} onChange={event => setInstructionDrafts(current => ({ ...current, [method.id]: { ...(current[method.id] ?? {}), instructions: event.target.value } }))} rows={3} placeholder={method.code === 'binance' || method.code === 'redotpay' ? 'Specify USDT and the exact network (e.g. TRC20) if applicable.' : 'Optional transfer notes'} />
              </label>
              <small>No real name is required. Never enter a password, private key, seed phrase or verification code. For crypto, specify the exact asset and network to prevent lost transfers. Save details before enabling deposits.</small>
              <div className="admin-finance-actions"><button disabled={busyId === method.id} onClick={() => void saveInstructions(method)}>Save instructions</button><button className="admin-method-toggle" disabled={busyId === method.id} onClick={() => void togglePaymentMethod(method)}>{method.is_enabled ? 'Disable deposits' : 'Enable deposits'}</button><button className="admin-method-toggle" disabled={busyId === method.id} onClick={() => void toggleWithdrawalMethod(method)}>{method.is_withdrawal_enabled ? 'Disable withdrawals' : 'Enable withdrawals'}</button></div>
            </article>)}
          </div>}
          <div className="admin-safety-note"><ShieldCheck size={15}/> Deposit approvals credit the wallet atomically. Withdrawals reserve funds until you mark the external transfer paid or reject the request.</div>
        </>}
    </section>
  </div>
}
