import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Clock3, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type Props = { onClose: () => void }
type Method = { code: string; display_name: string; supported_currencies: string[]; instructions: Record<string, unknown> }
type Account = { currency: string; available_balance: number; reserved_balance: number; recovery_balance: number }
type RequestRow = { id: string; payment_method: string; amount: number; currency: string; status: string; created_at: string }

const currencies = ['DZD', 'USD', 'EUR']
const formatMoney = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)

export default function WalletPanel({ onClose }: Props) {
  const { t } = useLanguage()
  const [userId, setUserId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [methods, setMethods] = useState<Method[]>([])
  const [deposits, setDeposits] = useState<RequestRow[]>([])
  const [withdrawals, setWithdrawals] = useState<RequestRow[]>([])
  const [currency, setCurrency] = useState('DZD')
  const [method, setMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [destination, setDestination] = useState('')
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedMethod = useMemo(() => methods.find(item => item.code === method), [methods, method])
  const account = accounts.find(item => item.currency === currency)

  async function refresh() {
    if (!supabase) return
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    if (!user) throw new Error(t('sign_in_wallet'))
    setUserId(user.id)
    const [a, m, d, w] = await Promise.all([
      supabase.from('wallet_accounts').select('currency,available_balance,reserved_balance,recovery_balance').eq('user_id', user.id),
      supabase.from('payment_methods').select('code,display_name,supported_currencies,instructions').eq('is_enabled', true).order('sort_order'),
      supabase.from('deposit_requests').select('id,payment_method,amount,currency,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
      supabase.from('withdrawal_requests').select('id,payment_method,amount,currency,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8)
    ])
    for (const result of [a,m,d,w]) if (result.error) throw result.error
    setAccounts((a.data ?? []) as Account[])
    setMethods((m.data ?? []) as Method[])
    setDeposits((d.data ?? []) as RequestRow[])
    setWithdrawals((w.data ?? []) as RequestRow[])
  }

  useEffect(() => { void refresh().catch(caught => setError(caught instanceof Error ? caught.message : t('could_not_load_wallet'))) }, [])

  useEffect(() => {
    if (selectedMethod && !selectedMethod.supported_currencies.includes(currency)) {
      setCurrency(selectedMethod.supported_currencies[0] ?? 'DZD')
    }
  }, [selectedMethod, currency])

  async function submitDeposit(event: FormEvent) {
    event.preventDefault()
    setNotice('Preview only: deposits are disabled until legal authorization and payment compliance are verified.')
    return
    if (!supabase || !userId || !selectedMethod) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) { setError(t('valid_deposit_amount')); return }
    if (!proofFile && !reference.trim()) { setError(t('add_transfer_proof')); return }
    if (proofFile && (proofFile.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp','application/pdf'].includes(proofFile.type))) { setError(t('proof_format')); return }
    setBusy(true); setError(''); setNotice('')
    try {
      let proofPath: string | null = null
      if (proofFile) {
        proofPath = userId + '/' + crypto.randomUUID() + '-' + proofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const { error: uploadError } = await supabase.storage.from('deposit-proofs').upload(proofPath, proofFile, { contentType: proofFile.type, upsert: false })
        if (uploadError) throw uploadError
      }
      const { error: insertError } = await supabase.from('deposit_requests').insert({
        user_id: userId, payment_method: method, amount: value, currency,
        sender_reference: reference.trim() || null, proof_path: proofPath, status: 'pending'
      })
      if (insertError) {
        if (proofPath) await supabase.storage.from('deposit-proofs').remove([proofPath])
        throw insertError
      }
      setNotice(t('deposit_sent'))
      setAmount(''); setReference(''); setProofFile(null); const fileInput = document.getElementById('wallet-proof-input') as HTMLInputElement | null; if (fileInput) fileInput.value = ''
      await refresh()
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('could_not_load_wallet')) }
    finally { setBusy(false) }
  }

  async function submitWithdrawal(event: FormEvent) {
    event.preventDefault()
    setNotice('Preview only: withdrawals are disabled until legal authorization and payment compliance are verified.')
    return
    if (!supabase) return
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0 || !method || !destination.trim()) { setError(t('complete_withdrawal')); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('betnova_request_withdrawal', {
        p_payment_method: method, p_amount: value, p_currency: currency, p_destination_details: destination.trim()
      })
      if (rpcError) throw rpcError
      setNotice(t('withdrawal_sent'))
      setAmount(''); setDestination('')
      await refresh()
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('could_not_load_wallet')) }
    finally { setBusy(false) }
  }

  const instructions = selectedMethod?.instructions ?? {}
  const instructionText = typeof instructions.instructions === 'string' ? instructions.instructions : ''
  const accountName = typeof instructions.account_name === 'string' ? instructions.account_name : ''
  const accountNumber = typeof instructions.account_number === 'string' ? instructions.account_number : ''

  return <div className="wallet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="wallet-panel" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
      <button className="wallet-close" onClick={onClose} aria-label={t('close')}><X size={19}/></button>
      <div className="wallet-kicker"><Wallet size={15}/> BETNOVA WALLET</div>
      <h2 id="wallet-title">{t('wallet')}</h2>
      <div className="wallet-recovery-notice"><b>Preview wallet</b><span>Balances are illustrative. Deposits and withdrawals are disabled until licensing, legal compliance, and secure payment controls are verified.</span></div>
      <div className="wallet-currency-row">{currencies.map(code => <button key={code} className={currency === code ? 'active' : ''} onClick={() => { setCurrency(code); setMethod('') }}>{code}</button>)}</div>
      <div className="wallet-balance-card">
        <span>{t('available_balance')}</span>
        <strong>{formatMoney(Number(account?.available_balance ?? 0), currency)}</strong>
        <small>{Number(account?.reserved_balance ?? 0) > 0 ? `${formatMoney(Number(account?.reserved_balance),currency)} reserved for withdrawals` : t('available_wallet_balance')}</small>{Number(account?.recovery_balance ?? 0) > 0 && <div className="wallet-recovery-chip"><b>{t('recovery_balance')}</b><strong>{formatMoney(Number(account?.recovery_balance),currency)}</strong></div>}
      </div>
      <div className="wallet-tabs">
        <button className={tab === 'deposit' ? 'active' : ''} onClick={() => setTab('deposit')}><ArrowDownToLine size={14}/> {t('deposit_tab')}</button>
        <button className={tab === 'withdraw' ? 'active' : ''} onClick={() => setTab('withdraw')}><ArrowUpFromLine size={14}/> {t('withdraw_tab')}</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><Clock3 size={14}/> {t('history_tab')}</button>
      </div>
      {Number(account?.recovery_balance ?? 0) > 0 && <div className="wallet-recovery-notice"><b>{t('recovery_notice')}</b><span>{t('recovery_blocks_withdrawal')}</span></div>}{error && <p className="wallet-message error">{error}</p>}
      {notice && <p className="wallet-message success">{notice}</p>}
      {tab === 'deposit' && <form className="wallet-form" onSubmit={submitDeposit}>
        <label>{t('payment_method')}<select value={method} onChange={event => setMethod(event.target.value)} required><option value="">{t('choose_method')}</option>{methods.filter(item => item.supported_currencies.includes(currency)).map(item => <option key={item.code} value={item.code}>{item.display_name}</option>)}</select></label>
        {selectedMethod && <div className="wallet-instructions">
          {accountName && <p><b>{t('account_name')}</b> {accountName}</p>}
          {accountNumber && <p><b>{t('transfer_details')}</b> {accountNumber}</p>}
          {instructionText && <p>{instructionText}</p>}
          {!accountName && !accountNumber && !instructionText && <p>{t('payment_instructions_pending')}</p>}
        </div>}
        <label>{t('amount')} ({currency})<input inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder={t('enter_amount')} required/></label>
        <label>{t('payment_proof')}<input id="wallet-proof-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setProofFile(event.target.files?.[0] ?? null)}/>{proofFile && <small className="wallet-file-name">{proofFile.name}</small>}</label>
        <label>{t('transfer_reference')}<input value={reference} onChange={event => setReference(event.target.value)} placeholder={t('transaction_reference')}/></label>
        <button className="wallet-submit" disabled={true}>Preview only</button>
        <p className="wallet-footnote"><ShieldCheck size={13}/> {t('balance_after_verification')}</p>
      </form>}
      {tab === 'withdraw' && <form className="wallet-form" onSubmit={submitWithdrawal}>
        <label>{t('withdrawal_method')}<select value={method} onChange={event => setMethod(event.target.value)} required><option value="">{t('choose_method')}</option>{methods.filter(item => item.supported_currencies.includes(currency)).map(item => <option key={item.code} value={item.code}>{item.display_name}</option>)}</select></label>
        <label>{t('amount')} ({currency})<input inputMode="decimal" type="number" min="0.01" max={account?.available_balance ?? 0} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder={t('enter_amount')} required/></label>
        <label>{t('receiving_details')}<textarea value={destination} onChange={event => setDestination(event.target.value)} placeholder={t('receiving_placeholder')} rows={3} required maxLength={1000}/></label>
        <button className="wallet-submit" disabled={true}>Preview only</button>
        <p className="wallet-footnote"><ShieldCheck size={13}/> {t('withdrawal_reserved')}</p>
      </form>}
      {tab === 'history' && <div className="wallet-history">
        {[...deposits.map(item => ({...item, kind:t('deposit_kind')})), ...withdrawals.map(item => ({...item, kind:t('withdrawal_kind')}))].sort((a,b) => +new Date(b.created_at)-+new Date(a.created_at)).map(item => <article key={item.id}><div><b>{item.kind} · {item.payment_method.toUpperCase()}</b><small>{new Date(item.created_at).toLocaleString()}</small></div><strong>{formatMoney(Number(item.amount),item.currency)}</strong><span className={item.status}>{item.status}</span></article>)}
        {deposits.length + withdrawals.length === 0 && <p className="wallet-empty">{t('no_wallet_history')}</p>}
        <button className="wallet-refresh" onClick={() => void refresh()}><RefreshCw size={13}/> {t('refresh_history')}</button>
      </div>}
    </section>
  </div>
}
