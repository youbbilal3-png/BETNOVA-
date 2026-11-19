import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Clock3, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'
import PaymentMethodLogo from './PaymentMethodLogo'

type Props = { onClose: () => void; initialTab?: 'deposit' | 'withdraw' | 'history' }
type Method = { code: string; display_name: string; is_enabled: boolean; is_withdrawal_enabled: boolean; supported_currencies: string[]; instructions: Record<string, unknown> }
type Account = { currency: string; available_balance: number; reserved_balance: number; recovery_balance: number }
type RequestRow = { id: string; payment_method: string; amount: number; currency: string; status: string; created_at: string }

const currencies = ['DZD', 'USD', 'EUR']
const formatMoney = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)

export default function WalletPanel({ onClose, initialTab = 'deposit' }: Props) {
  const { t } = useLanguage()
  const [userId, setUserId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [bonus, setBonus] = useState<{available_balance:number;reserved_balance:number}>({available_balance:0,reserved_balance:0})
  const [bonusWithdrawMode, setBonusWithdrawMode] = useState(false)
  const [methods, setMethods] = useState<Method[]>([])
  const [deposits, setDeposits] = useState<RequestRow[]>([])
  const [withdrawals, setWithdrawals] = useState<RequestRow[]>([])
  const [currency, setCurrency] = useState('DZD')
  const [method, setMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [destination, setDestination] = useState('')
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history'>(initialTab)
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
    const [a, m, d, w, b] = await Promise.all([
      supabase.from('wallet_accounts').select('currency,available_balance,reserved_balance,recovery_balance').eq('user_id', user.id),
      supabase.from('payment_methods').select('code,display_name,is_enabled,is_withdrawal_enabled,supported_currencies,instructions').order('sort_order'),
      supabase.from('deposit_requests').select('id,payment_method,amount,currency,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
      supabase.from('withdrawal_requests').select('id,payment_method,amount,currency,status,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
      supabase.from('bonus_wallet_accounts').select('available_balance,reserved_balance').eq('user_id', user.id).maybeSingle()
    ])
    for (const result of [a,m,d,w,b]) if (result.error) throw result.error
    setAccounts((a.data ?? []) as Account[])
    setMethods((m.data ?? []) as Method[])
    setDeposits((d.data ?? []) as RequestRow[])
    setWithdrawals((w.data ?? []) as RequestRow[])
    setBonus({available_balance:Number(b.data?.available_balance ?? 0),reserved_balance:Number(b.data?.reserved_balance ?? 0)})
  }

  useEffect(() => { void refresh().catch(caught => setError(caught instanceof Error ? caught.message : t('could_not_load_wallet'))) }, [])

  useEffect(() => {
    if (selectedMethod && !selectedMethod.supported_currencies.includes(currency)) {
      setCurrency(selectedMethod.supported_currencies[0] ?? 'DZD')
    }
  }, [selectedMethod, currency])

  useEffect(() => {
    if (!method) return
    const validForCurrentTab = methods.some(item =>
      item.code === method &&
      item.supported_currencies.includes(currency) &&
      (tab === 'deposit' ? item.is_enabled : tab === 'withdraw' ? item.is_withdrawal_enabled : true)
    )
    if (!validForCurrentTab) setMethod('')
  }, [methods, method, currency, tab])

  async function submitDeposit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !userId || !selectedMethod) return
    if (!proofFile) { setError('t('add_transfer_proof')'); return }
    if (!reference.trim()) { setError('t('transaction_reference')'); return }
    if (proofFile.size > 5 * 1024 * 1024) { setError('t('proof_format')'); return }
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(proofFile.type)) {
      setError('t('proof_format')'); return
    }
    const numericAmount = Number(amount)
    const depositLimits: Record<string,[number,number]> = {DZD:[500,100000],USD:[1,5000],EUR:[1,5000]}
    const [depositMin,depositMax] = depositLimits[currency]
    if (!Number.isFinite(numericAmount) || numericAmount < depositMin || numericAmount > depositMax) { setError('Deposit limits: ' + depositMin + '–' + depositMax + ' ' + currency + '.'); return }

    setBusy(true); setError(''); setNotice('')
    const extension = proofFile.name.split('.').pop()?.toLowerCase() || 'bin'
    const proofPath = `${userId}/${crypto.randomUUID()}.${extension}`
    try {
      const { error: uploadError } = await supabase.storage.from('deposit-proofs').upload(proofPath, proofFile, {
        contentType: proofFile.type, upsert: false
      })
      if (uploadError) throw uploadError
      const { error: requestError } = await supabase.rpc('betnova_request_deposit', {
        p_payment_method: selectedMethod.code,
        p_amount: numericAmount,
        p_currency: currency,
        p_sender_reference: reference.trim(),
        p_proof_path: proofPath
      })
      if (requestError) {
        await supabase.storage.from('deposit-proofs').remove([proofPath])
        throw requestError
      }
      setNotice('t('deposit_sent')')
      setAmount(''); setReference(''); setProofFile(null)
      const fileInput = document.getElementById('wallet-proof-input') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 't('could_not_load_wallet')')
    } finally { setBusy(false) }
  }

  async function submitWithdrawal(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !selectedMethod) return
    const numericAmount = Number(amount)
    const withdrawalLimits: Record<string,[number,number]> = {DZD:[1000,1500000],USD:[1.5,50000],EUR:[1.5,50000]}
    const [withdrawMin,withdrawMax] = withdrawalLimits[currency]
    if (!Number.isFinite(numericAmount) || numericAmount < withdrawMin || numericAmount > withdrawMax) { setError('Withdrawal limits: ' + withdrawMin + '–' + withdrawMax + ' ' + currency + '.'); return }
    if (!destination.trim() || destination.trim().length < 4) { setError('t('receiving_placeholder')'); return }
    if (numericAmount > Number(account?.available_balance ?? 0)) { setError('t('could_not_load_wallet')'); return }

    setBusy(true); setError(''); setNotice('')
    try {
      const { error: requestError } = await supabase.rpc('betnova_request_withdrawal', {
        p_payment_method: selectedMethod.code,
        p_amount: numericAmount,
        p_currency: currency,
        p_destination_details: destination.trim()
      })
      if (requestError) throw requestError
      setNotice('t('withdrawal_sent')')
      setAmount(''); setDestination('')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 't('could_not_load_wallet')')
    } finally { setBusy(false) }
  }

  async function submitBonusWithdrawal(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !selectedMethod) return
    const numericAmount = Number(amount)
    const limits: Record<string,[number,number]> = {DZD:[1000,1500000],USD:[1.5,50000],EUR:[1.5,50000]}
    const pair = limits[currency]; const minimum = pair[0]; const maximum = pair[1]
    const usdValue = currency === 'DZD' ? numericAmount/260 : currency === 'EUR' ? numericAmount/0.9 : numericAmount
    if (!Number.isFinite(numericAmount) || numericAmount < minimum || numericAmount > maximum) { setError('Withdrawal limits: ' + minimum + '–' + maximum + ' ' + currency + '.'); return }
    if (usdValue > bonus.available_balance + 0.0001) { setError('Insufficient available bonus balance.'); return }
    if (!destination.trim() || destination.trim().length < 4) { setError('t('receiving_placeholder')'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: requestError } = await supabase.rpc('betnova_request_bonus_withdrawal', {p_payment_method:selectedMethod.code,p_amount:numericAmount,p_currency:currency,p_destination_details:destination.trim()})
      if (requestError) throw requestError
      setNotice('t('withdrawal_sent')')
      setAmount(''); setDestination(''); await refresh()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 't('could_not_load_wallet')') }
    finally { setBusy(false) }
  }
  const instructions = selectedMethod?.instructions ?? {}
  const instructionText = typeof instructions.instructions === 'string' ? instructions.instructions : ''
  const receivingDetail = selectedMethod?.code === 'paysera'
    ? (typeof instructions.iban === 'string' ? instructions.iban : '')
    : selectedMethod?.code === 'baridimob'
      ? (typeof instructions.account_number === 'string' ? instructions.account_number : '')
      : (typeof instructions.account_id === 'string' ? instructions.account_id : typeof instructions.account_number === 'string' ? instructions.account_number : '')
  const receivingLabel = selectedMethod?.code === 'paysera' ? 'IBAN' : selectedMethod?.code === 'baridimob' ? 'CCP / Account number' : 'Receiving ID'

  return <div className="wallet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="wallet-panel" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
      <button className="wallet-close" onClick={onClose} aria-label={t('close')}><X size={19}/></button>
      <div className="wallet-kicker"><Wallet size={15}/> {t('wallet')}</div>
      <h2 id="wallet-title">{t('wallet')}</h2>
      <div className="wallet-recovery-notice"><b>{t('real_money_wallet')}</b><span>{t('deposit_manual_note')}</span></div>
      <div className="wallet-currency-row">{currencies.map(code => <button key={code} className={currency === code ? 'active' : ''} onClick={() => { setCurrency(code); setMethod('') }}>{code}</button>)}</div>
      <div className="wallet-balance-card">
        <span>{t('available_balance')} · REAL MONEY</span>
        <strong>{formatMoney(Number(account?.available_balance ?? 0), currency)}</strong>
        <small>{Number(account?.reserved_balance ?? 0) > 0 ? `${formatMoney(Number(account?.reserved_balance),currency)} {t('reserved_for_withdrawals_label')}` : t('available_wallet_balance')}</small>{Number(account?.recovery_balance ?? 0) > 0 && <div className="wallet-recovery-chip"><b>{t('recovery_balance')}</b><strong>{formatMoney(Number(account?.recovery_balance),currency)}</strong></div>}
      </div>
      <div className="wallet-balance-card wallet-bonus-balance"><span>{t('bonus_separate_balance')}</span><strong>{formatMoney(bonus.available_balance * (currency === 'DZD' ? 260 : currency === 'EUR' ? 0.9 : 1), currency)}</strong><small>{formatMoney(bonus.reserved_balance * (currency === 'DZD' ? 260 : currency === 'EUR' ? 0.9 : 1), currency)} reserved</small><small>{t('bonus_unlock_note')}</small></div>
      <div className="wallet-tabs">
        <button className={tab === 'deposit' ? 'active' : ''} onClick={() => setTab('deposit')}><ArrowDownToLine size={14}/> {t('deposit_tab')}</button>
        <button className={tab === 'withdraw' ? 'active' : ''} onClick={() => setTab('withdraw')}><ArrowUpFromLine size={14}/> {t('withdraw_tab')}</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><Clock3 size={14}/> {t('history_tab')}</button>
      </div>
      {Number(account?.recovery_balance ?? 0) > 0 && <div className="wallet-recovery-notice"><b>{t('recovery_notice')}</b><span>{t('recovery_blocks_withdrawal')}</span></div>}{error && <p className="wallet-message error">{error}</p>}
      {notice && <p className="wallet-message success">{notice}</p>}
      {tab === 'deposit' && <form className="wallet-form" onSubmit={submitDeposit}>
        <div className="wallet-method-section"><label>{t('payment_method')}</label><div className="wallet-method-grid">{methods.map(item => { const supportsCurrency = item.supported_currencies.includes(currency); const available = item.is_enabled && supportsCurrency; return <button type="button" key={item.code} disabled={!available} className={['wallet-method-card', method === item.code ? 'active' : '', !available ? 'unavailable' : ''].filter(Boolean).join(' ')} onClick={() => setMethod(item.code)} aria-pressed={method === item.code}><PaymentMethodLogo code={item.code} size={42}/><span><b>{item.display_name}</b><small>{supportsCurrency ? (available ? currency : t('not_configured')) : t('available_label') + ' ' + item.supported_currencies.join(' / ')}</small></span><i>{method === item.code ? '✓' : available ? '›' : '•'}</i></button> })}</div><small className="wallet-method-hint">{t('wallet_method_hint')}</small></div>
        {selectedMethod && <div className="wallet-instructions">
          {receivingDetail && <p className="wallet-receiving-detail"><b>{receivingLabel}</b> <span>{receivingDetail}</span><button type="button" onClick={() => { void navigator.clipboard?.writeText(receivingDetail) }}>Copy</button></p>}
          {instructionText && <p>{instructionText}</p>}
          {!receivingDetail && !instructionText && <p>{t('payment_instructions_pending')}</p>}
        </div>}
        <label>{t('amount')} ({currency})<input inputMode="decimal" type="number" min={currency === 'DZD' ? 500 : 1} max={currency === 'DZD' ? 100000 : 5000} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder={t('enter_amount')} required/></label>
        <label>{t('payment_proof')}<input id="wallet-proof-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => setProofFile(event.target.files?.[0] ?? null)}/>{proofFile && <small className="wallet-file-name">{proofFile.name}</small>}</label>
        <label>{t('transfer_reference')}<input value={reference} onChange={event => setReference(event.target.value)} placeholder={t('transaction_reference')}/></label>
        <button className="wallet-submit" disabled={busy || !selectedMethod}>{busy ? t('submitting_btn') : t('submit_deposit_request')}</button>
        <p className="wallet-footnote"><ShieldCheck size={13}/> {t('balance_after_verification')}</p>
      </form>}
      {tab === 'withdraw' && <><div className="wallet-tabs"><button type="button" className={!bonusWithdrawMode ? 'active' : ''} onClick={() => {setBonusWithdrawMode(false);setAmount('');setError('')}}>{t('real_balance')}</button><button type="button" className={bonusWithdrawMode ? 'active' : ''} onClick={() => {setBonusWithdrawMode(true);setAmount('');setError('')}}>{t('bonus_balance')}</button></div>{bonusWithdrawMode && <div className="wallet-recovery-notice"><b>{t('bonus_withdrawal_condition')}</b><span>Complete verified deposits totaling 10 USD (2,600 DZD or 9 EUR). The deposit remains in your real-money wallet. This condition never applies to real balance withdrawals.</span></div>}<form className="wallet-form" onSubmit={bonusWithdrawMode ? submitBonusWithdrawal : submitWithdrawal}>
        <div className="wallet-method-section"><label>{t('withdrawal_method')}</label><div className="wallet-method-grid">{methods.filter(item => item.is_withdrawal_enabled).map(item => { const supportsCurrency = item.supported_currencies.includes(currency); return <button type="button" key={item.code} className={['wallet-method-card', method === item.code ? 'active' : '', !supportsCurrency ? 'currency-switch' : ''].filter(Boolean).join(' ')} onClick={() => { if (!supportsCurrency) setCurrency(item.supported_currencies[0] ?? 'DZD'); setMethod(item.code) }} aria-pressed={method === item.code}><PaymentMethodLogo code={item.code} size={42}/><span><b>{item.display_name}</b><small>{supportsCurrency ? currency : t('switch_to') + ' ' + item.supported_currencies.join(' / ')}</small></span><i>{method === item.code ? '✓' : '›'}</i></button> })}</div>{methods.filter(item => item.is_withdrawal_enabled).length === 0 && <p className="wallet-method-empty">{t('not_enabled_withdrawal')}</p>}<small className="wallet-method-hint">Tap RedotPay or Paysera to switch automatically to USD/EUR. BaridiMob supports DZD; Binance supports DZD/USD/EUR.</small></div>
        <label>{t('amount')} ({currency})<input inputMode="decimal" type="number" min={currency === 'DZD' ? 1000 : 1.5} max={bonusWithdrawMode ? bonus.available_balance * (currency === 'DZD' ? 260 : currency === 'EUR' ? 0.9 : 1) : Math.min(currency === 'DZD' ? 1500000 : 50000, account?.available_balance ?? 0)} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder={t('enter_amount')} required/></label>
        <label>{t('receiving_details')}<textarea value={destination} onChange={event => setDestination(event.target.value)} placeholder={t('receiving_placeholder')} rows={3} required maxLength={1000}/></label>
        <button className="wallet-submit" disabled={busy || !selectedMethod || (bonusWithdrawMode ? bonus.available_balance <= 0 : !account || Number(account.available_balance) <= 0)}>{busy ? t('submitting_btn') : bonusWithdrawMode ? t('request_bonus_withdrawal') : t('request_withdrawal_btn')}</button>
        <p className="wallet-footnote"><ShieldCheck size={13}/> {t('withdrawal_reserved')}</p>
       </form></>}
      {tab === 'history' && <div className="wallet-history">
        {[...deposits.map(item => ({...item, kind:t('deposit_kind')})), ...withdrawals.map(item => ({...item, kind:t('withdrawal_kind')}))].sort((a,b) => +new Date(b.created_at)-+new Date(a.created_at)).map(item => <article key={item.id}><div><b>{item.kind} · {item.payment_method.toUpperCase()}</b><small>{new Date(item.created_at).toLocaleString()}</small></div><strong>{formatMoney(Number(item.amount),item.currency)}</strong><span className={item.status}>{item.status}</span></article>)}
        {deposits.length + withdrawals.length === 0 && <p className="wallet-empty">{t('no_wallet_history')}</p>}
        <button className="wallet-refresh" onClick={() => void refresh()}><RefreshCw size={13}/> {t('refresh_history')}</button>
      </div>}
    </section>
  </div>
}
