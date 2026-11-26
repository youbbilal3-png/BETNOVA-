import { useEffect, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, CheckCircle2, Clock3, KeyRound, Mail, ShieldCheck, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type Props = { onClose: () => void; onSignOut: () => void; onOpenWallet: (tab: 'deposit' | 'withdraw') => void }

export default function AccountPanel({ onClose, onSignOut, onOpenWallet }: Props) {
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [verified, setVerified] = useState(false)
  const [accountBalances, setAccountBalances] = useState<{currency:string;available_balance:number;reserved_balance:number}[]>([])
  const [bonusBalance, setBonusBalance] = useState(0)
  const [preferredCurrency, setPreferredCurrency] = useState<'DZD'|'USD'|'EUR'>('DZD')
  const [newAccountCurrency, setNewAccountCurrency] = useState<'DZD'|'USD'|'EUR'>('USD')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadAccount() {
      if (!supabase) return
      const { data, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!active || !data.user) return
      setEmail(data.user.email ?? '')
      setDisplayName(String(data.user.user_metadata?.display_name ?? data.user.user_metadata?.full_name ?? ''))
      setCreatedAt(data.user.created_at)
      setVerified(Boolean(data.user.email_confirmed_at))
      const [balances, bonus, profile] = await Promise.all([
        supabase.from('wallet_accounts').select('currency,available_balance,reserved_balance').eq('user_id', data.user.id),
        supabase.from('bonus_wallet_accounts').select('available_balance').eq('user_id', data.user.id).maybeSingle(),
        supabase.from('profiles').select('preferred_currency').eq('id', data.user.id).maybeSingle()
      ])
      if (balances.error) throw balances.error
      if (bonus.error) throw bonus.error
      if (profile.error) throw profile.error
      if (active) {
        const preferred = profile.data?.preferred_currency
        if (preferred === 'DZD' || preferred === 'USD' || preferred === 'EUR') setPreferredCurrency(preferred)
        setAccountBalances((balances.data ?? []) as {currency:string;available_balance:number;reserved_balance:number}[])
        setBonusBalance(Number(bonus.data?.available_balance ?? 0))
      }
    }
    void loadAccount().catch(caught => setError(caught instanceof Error ? caught.message : 'Could not load account details.'))
    return () => { active = false }
  }, [])

  async function addCurrencyAccount() {
    if (!supabase) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: accountError } = await supabase.rpc('betnova_open_currency_account', { p_currency: newAccountCurrency })
      if (accountError) throw accountError
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Please sign in again.')
      const { data, error: balancesError } = await supabase.from('wallet_accounts').select('currency,available_balance,reserved_balance').eq('user_id', user.id)
      if (balancesError) throw balancesError
      setAccountBalances((data ?? []) as {currency:string;available_balance:number;reserved_balance:number}[])
      setNotice(newAccountCurrency + ' account opened with a zero balance.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open currency account.')
    } finally { setBusy(false) }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ data: { display_name: displayName.trim() } })
      if (updateError) throw updateError
      setNotice('Your profile details have been saved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save profile.')
    } finally { setBusy(false) }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    if (newPassword.length < 8) { setError('Use at least 8 characters for your new password.'); return }
    if (newPassword !== confirmPassword) { setError('The passwords do not match.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) throw updateError
      setNewPassword(''); setConfirmPassword('')
      setNotice('Your password has been updated.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update password.')
    } finally { setBusy(false) }
  }

  async function resendVerification() {
    if (!supabase || !email) return
    setResending(true); setError(''); setNotice('')
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: 'https://betnova-8daa3.web.app/' } })
      if (resendError) throw resendError
      setNotice('A confirmation email has been requested. Check your inbox and spam folder.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not resend the confirmation email.')
    } finally { setResending(false) }
  }

  return <div className="account-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <button className="account-close" onClick={onClose} aria-label={t('close')}><X size={19}/></button>
      <div className="account-kicker"><ShieldCheck size={15}/> BETNOVA · {t('account_centre')}</div>
      <div className="account-heading"><span className="account-avatar"><UserRound size={25}/></span><div><h2 id="account-title">{t('my_profile')}</h2><p>{t('profile_manage')}</p></div></div>
      <div className="account-wallet-summary">
        <div className="account-wallet-summary-head"><span>{t('available_balance').toUpperCase()}</span><button type="button" onClick={() => onOpenWallet('deposit')}>{t('add_funds')}</button></div>
        <div className="account-wallet-balance-grid">
          {accountBalances.map(item => {
            const currency = item.currency
            return <div key={currency}><small>{currency}</small><strong>{new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(item.available_balance ?? 0))}</strong>{Number(item.reserved_balance ?? 0) > 0 && <small>{new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(item.reserved_balance))} {t('reserved_for_withdrawals_label')}</small>}</div>
          })}
        </div>
      </div>
        <div className="account-currency-add"><label>Open another currency account<select value={newAccountCurrency} onChange={event => setNewAccountCurrency(event.target.value as 'DZD'|'USD'|'EUR')}><option value="DZD" disabled={accountBalances.some(item=>item.currency==='DZD')}>DZD · Algerian dinar</option><option value="USD" disabled={accountBalances.some(item=>item.currency==='USD')}>USD · US dollar</option><option value="EUR" disabled={accountBalances.some(item=>item.currency==='EUR')}>EUR · Euro</option></select></label><button type="button" className="account-secondary" onClick={() => void addCurrencyAccount()} disabled={busy || accountBalances.length >= 3 || accountBalances.some(item=>item.currency===newAccountCurrency)}>Add account</button></div>
      <div className="account-wallet-summary account-bonus-summary"><div className="account-wallet-summary-head"><span>{t('bonus_separate_balance')}</span></div><div className="account-wallet-balance-grid"><div><small>{preferredCurrency}</small><strong>{new Intl.NumberFormat(undefined,{style:'currency',currency:preferredCurrency,maximumFractionDigits:preferredCurrency==='DZD'?0:2}).format(bonusBalance * (preferredCurrency==='DZD'?260:preferredCurrency==='EUR'?0.9:1))}</strong></div></div></div>
      <div className="account-wallet-actions"><button type="button" onClick={() => onOpenWallet('deposit')}><ArrowDownToLine size={17}/> {t('deposit')}</button><button type="button" onClick={() => onOpenWallet('withdraw')}><ArrowUpFromLine size={17}/> {t('withdraw')}</button></div>
      <div className="account-status-grid">
        <div><span>{t('email_status')}</span><b className={verified ? 'verified' : 'unverified'}>{verified ? <><CheckCircle2 size={15}/> {t('verified')}</>  : t('not_verified')}</b></div>
        <div><span>{t('member_since')}</span><b><Clock3 size={14}/>{createdAt ? new Date(createdAt).toLocaleDateString() : '—'}</b></div>
      </div>
      <form className="account-section" onSubmit={saveProfile}>
        <h3><UserRound size={17}/> {t('personal_information')}</h3>
        <label>{t('display_name')}<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder={t('your_name')} maxLength={60}/></label>
        <label>{t('email_address')}<div className="account-readonly"><Mail size={16}/>{email}<span>{t('sign_in_email')}</span></div></label>
        <button className="account-primary" type="submit" disabled={busy}>{t('save_profile')} <ArrowRight size={15}/></button>
      </form>
      <section className="account-section">
        <h3><Mail size={17}/> {t('email_verification')}</h3>
        <p>{verified ? t('email_confirmed') : t('email_confirm_note')}</p>
        {!verified && <button className="account-secondary" onClick={() => void resendVerification()} disabled={resending}>{resending ? t('sending') : t('resend_confirmation')}</button>}
      </section>
      <form className="account-section" onSubmit={changePassword}>
        <h3><KeyRound size={17}/> {t('password_security')}</h3>
        <label>{t('new_password')}<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder={t('password_eight_chars')} required/></label>
        <label>{t('confirm_new_password')}<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder={t('repeat_password')} required/></label>
        <button className="account-primary" type="submit" disabled={busy || !newPassword || !confirmPassword}>{t('update_password')} <ArrowRight size={15}/></button>
        <div className="account-security-note"><ShieldCheck size={16}/> {t('password_safety_note')}</div>
      </form>
      {error && <p className="account-message error" role="alert">{error}</p>}
      {notice && <p className="account-message success" role="status">{notice}</p>}
      <button className="account-signout" onClick={onSignOut}>{t('sign_out_betnova')}</button>
    </section>
  </div>
}
