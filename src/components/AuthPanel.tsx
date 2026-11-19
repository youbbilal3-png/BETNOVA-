import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, ShieldCheck, X } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useLanguage } from '../i18n'

type AuthPanelProps = {
  open: boolean
  mode: 'login' | 'signup'
  onClose: () => void
  onModeChange: (mode: 'login' | 'signup') => void
}

export default function AuthPanel({ open, mode, onClose, onModeChange }: AuthPanelProps) {
  const { t } = useLanguage()
  const [displayName, setDisplayName] = useState('')
  const [preferredCurrency, setPreferredCurrency] = useState<'DZD' | 'USD' | 'EUR'>('DZD')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resending, setResending] = useState(false)

  if (!open) return null

  async function handleResendConfirmation() {
    if (!supabase || !email.trim()) return
    setError('')
    setNotice('')
    setResending(true)
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: 'https://betnova-8daa3.web.app/' },
      })
      if (resendError) throw resendError
      setNotice(t('confirmation_resent'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('resend_failed'))
    } finally {
      setResending(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!supabase || !isSupabaseConfigured) {
      setError(t('auth_not_configured'))
      return
    }
    if (password.length < 8) {
      setError(t('password_too_short'))
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim(),
              country_code: 'DZ',
              preferred_currency: preferredCurrency,
            },
            emailRedirectTo: 'https://betnova-8daa3.web.app/',
          },
        })
        if (signUpError) throw signUpError
        if (data.session) {
          onClose()
        } else {
          setNotice(t('check_email'))
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
        onClose()
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('something_wrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" onClick={onClose} aria-label={t('close')}><X size={19}/></button>
        <div className="auth-brand-mark"><ShieldCheck size={23}/></div>
        <div className="auth-kicker">{t('welcome')}</div>
        <h2 id="auth-title">{mode === 'signup' ? t('create_account') : t('welcome_back')}</h2>
        <p className="auth-subtitle">{mode === 'signup' ? t('join_experience') : t('sign_in_continue')}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && <label>{t('your_name')}<input autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder={t('name_prompt')} required maxLength={60}/></label>}
          {mode === 'signup' && <label>{t('preferred_currency')}<select value={preferredCurrency} onChange={event => setPreferredCurrency(event.target.value as 'DZD' | 'USD' | 'EUR')}><option value="DZD">DZD · 25,000 DA welcome bonus</option><option value="USD">USD · $100 welcome bonus</option><option value="EUR">EUR · €90 welcome bonus</option></select></label>}
          <label>{t('email_address')}<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required/></label>
          <label>{t('password')}<span className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={t('password_minimum')} minLength={8} required/><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('hide_password') : t('show_password')}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {notice && <div className="auth-message success" role="status">{notice}</div>}
          {mode === 'signup' && notice && <button className="auth-submit" type="button" onClick={handleResendConfirmation} disabled={resending || !email.trim()}>{resending ? t('please_wait') : t('resend_confirmation')}</button>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? t('please_wait') : mode === 'signup' ? t('create_account') : t('login')} <ArrowRight size={16}/></button>
        </form>
        <div className="auth-switch">{mode === 'signup' ? t('already_account') : t('new_to_betnova')} <button onClick={() => { setError(''); setNotice(''); onModeChange(mode === 'signup' ? 'login' : 'signup') }}>{mode === 'signup' ? t('login') : t('create_account')}</button></div>
        <div className="auth-footnote"><ShieldCheck size={14}/> {t('account_protected')}</div>
      </section>
    </div>
  )
}
