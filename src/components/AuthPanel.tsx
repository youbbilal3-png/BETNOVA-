import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, ShieldCheck, X } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

type AuthPanelProps = {
  open: boolean
  mode: 'login' | 'signup'
  onClose: () => void
  onModeChange: (mode: 'login' | 'signup') => void
}

export default function AuthPanel({ open, mode, onClose, onModeChange }: AuthPanelProps) {
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
      setError('Authentication is not configured yet. Add the Supabase environment variables and try again.')
      return
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.')
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
            emailRedirectTo: window.location.origin,
          },
        })
        if (signUpError) throw signUpError
        if (data.session) {
          onClose()
        } else {
          setNotice('Your account request is ready. Check your email for the confirmation link, then come back to log in.')
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
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
        <div className="auth-brand-mark"><ShieldCheck size={23}/></div>
        <div className="auth-kicker">WELCOME TO BETNOVA</div>
        <h2 id="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
        <p className="auth-subtitle">{mode === 'signup' ? 'Join the sports experience built around you.' : 'Sign in to continue to your BETNOVA account.'}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && <label>Your name<input autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="How should we call you?" required maxLength={60}/></label>}
          <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required/></label>
          <label>Password<span className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required/><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {notice && <div className="auth-message success" role="status">{notice}</div>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'} <ArrowRight size={16}/></button>
        </form>
        <div className="auth-switch">{mode === 'signup' ? 'Already have an account?' : 'New to BETNOVA?'} <button onClick={() => { setError(''); setNotice(''); onModeChange(mode === 'signup' ? 'login' : 'signup') }}>{mode === 'signup' ? 'Log in' : 'Create account'}</button></div>
        <div className="auth-footnote"><ShieldCheck size={14}/> Your account details are protected by Supabase authentication.</div>
      </section>
    </div>
  )
}
