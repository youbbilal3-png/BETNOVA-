import { useEffect, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, CheckCircle2, Clock3, KeyRound, Mail, ShieldCheck, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = { onClose: () => void; onSignOut: () => void; onOpenWallet: (tab: 'deposit' | 'withdraw') => void }

export default function AccountPanel({ onClose, onSignOut, onOpenWallet }: Props) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [verified, setVerified] = useState(false)
  const [accountBalances, setAccountBalances] = useState<{currency:string;available_balance:number;reserved_balance:number}[]>([])
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
      const { data: balances } = await supabase.from('wallet_accounts').select('currency,available_balance,reserved_balance').eq('user_id', data.user.id)
      if (active) setAccountBalances((balances ?? []) as {currency:string;available_balance:number;reserved_balance:number}[])
    }
    void loadAccount().catch(caught => setError(caught instanceof Error ? caught.message : 'Could not load account details.'))
    return () => { active = false }
  }, [])

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
      <button className="account-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
      <div className="account-kicker"><ShieldCheck size={15}/> BETNOVA · ACCOUNT CENTRE</div>
      <div className="account-heading"><span className="account-avatar"><UserRound size={25}/></span><div><h2 id="account-title">My profile</h2><p>Manage your personal details and account security.</p></div></div>
      <div className="account-wallet-summary">
        <div className="account-wallet-summary-head"><span>WALLET BALANCE</span><button type="button" onClick={() => onOpenWallet('deposit')}>Add funds</button></div>
        <div className="account-wallet-balance-grid">
          {['DZD','USD','EUR'].map(currency => {
            const balance = accountBalances.find(item => item.currency === currency)
            return <div key={currency}><small>{currency}</small><strong>{new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(balance?.available_balance ?? 0))}</strong>{Number(balance?.reserved_balance ?? 0) > 0 && <small>{new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(balance?.reserved_balance))} reserved</small>}</div>
          })}
        </div>
      </div>
      <div className="account-wallet-actions"><button type="button" onClick={() => onOpenWallet('deposit')}><ArrowDownToLine size={17}/> Deposit</button><button type="button" onClick={() => onOpenWallet('withdraw')}><ArrowUpFromLine size={17}/> Withdraw</button></div>
      <div className="account-status-grid">
        <div><span>EMAIL STATUS</span><b className={verified ? 'verified' : 'unverified'}>{verified ? <><CheckCircle2 size={15}/> Verified</> : 'Not verified'}</b></div>
        <div><span>MEMBER SINCE</span><b><Clock3 size={14}/>{createdAt ? new Date(createdAt).toLocaleDateString() : '—'}</b></div>
      </div>
      <form className="account-section" onSubmit={saveProfile}>
        <h3><UserRound size={17}/> Personal information</h3>
        <label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your name" maxLength={60}/></label>
        <label>Email address<div className="account-readonly"><Mail size={16}/>{email}<span>Sign-in email</span></div></label>
        <button className="account-primary" type="submit" disabled={busy}>Save profile <ArrowRight size={15}/></button>
      </form>
      <section className="account-section">
        <h3><Mail size={17}/> Email verification</h3>
        <p>{verified ? 'Your email address is confirmed.' : 'Confirm your email address to help protect account access and receive important account messages.'}</p>
        {!verified && <button className="account-secondary" onClick={() => void resendVerification()} disabled={resending}>{resending ? 'Sending…' : 'Resend confirmation email'}</button>}
      </section>
      <form className="account-section" onSubmit={changePassword}>
        <h3><KeyRound size={17}/> Password & security</h3>
        <label>New password<input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="At least 8 characters" required/></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Repeat new password" required/></label>
        <button className="account-primary" type="submit" disabled={busy || !newPassword || !confirmPassword}>Update password <ArrowRight size={15}/></button>
        <div className="account-security-note"><ShieldCheck size={16}/> Never share your password or verification codes. Sign out when using a shared device.</div>
      </form>
      {error && <p className="account-message error" role="alert">{error}</p>}
      {notice && <p className="account-message success" role="status">{notice}</p>}
      <button className="account-signout" onClick={onSignOut}>Sign out of BETNOVA</button>
    </section>
  </div>
}
