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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (!open) return null

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
          <label>{t('email_address')}<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required/></label>
          <label>{t('password')}<span className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={t('password_minimum')} minLength={8} required/><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t('hide_password') : t('show_password')}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {notice && <div className="auth-message success" role="status">{notice}</div>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? t('please_wait') : mode === 'signup' ? t('create_account') : t('login')} <ArrowRight size={16}/></button>
        </form>
        <div className="auth-switch">{mode === 'signup' ? t('already_account') : t('new_to_betnova')} <button onClick={() => { setError(''); setNotice(''); onModeChange(mode === 'signup' ? 'login' : 'signup') }}>{mode === 'signup' ? t('login') : t('create_account')}</button></div>
        <div className="auth-footnote"><ShieldCheck size={14}/> {t('account_protected')}</div>
      </section>
    </div>
  )
}
