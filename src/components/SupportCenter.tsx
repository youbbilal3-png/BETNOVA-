import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, CircleHelp, Mail, MessageCircle, Send, ShieldCheck, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type Props = { onClose: () => void; userEmail: string | null }

export default function SupportCenter({ onClose, userEmail }: Props) {
  const { t } = useLanguage()
  const [supportEmail, setSupportEmail] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState(userEmail ?? '')
  const [category, setCategory] = useState('Account & profile')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let active = true
    async function loadContact() {
      if (!supabase) return
      const { data } = await supabase.from('support_settings').select('support_email').eq('id', true).maybeSingle()
      if (active && data?.support_email) setSupportEmail(String(data.support_email))
    }
    void loadContact()
    return () => { active = false }
  }, [])

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) { setError(t('something_wrong')); return }
    if (message.trim().length < 12) { setError(t('something_wrong')); return }
    setBusy(true); setError('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const { error: insertError } = await supabase.from('support_requests').insert({
        user_id: user?.id ?? null,
        full_name: name.trim() || null,
        email: email.trim(),
        category,
        subject: subject.trim(),
        message: message.trim()
      })
      if (insertError) throw insertError
      setSent(true)
      setSubject(''); setMessage('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('something_wrong'))
    } finally { setBusy(false) }
  }

  function composeEmail() {
    if (!supportEmail) return
    const params = new URLSearchParams({ subject: 'BETNOVA Support' })
    window.location.href = `mailto:${supportEmail}?${params.toString()}`
  }

  return <div className="support-backdrop">
    <section className="support-page" role="dialog" aria-modal="true" aria-labelledby="support-title">
      <header className="support-topbar">
        <button type="button" onClick={onClose} className="support-back"><ArrowLeft size={17}/> {t('support_back')}</button>
        <button type="button" onClick={onClose} className="support-close" aria-label={t('close_support')}><X size={19}/></button>
      </header>
      <div className="support-hero">
        <div className="support-hero-glow"/>
        <div className="support-brand"><img src="/betnova-icon.svg" alt="BETNOVA logo"/><span>BETNOVA</span><i>{t('support_title')}</i></div>
        <div className="support-hero-copy">
          <span className="support-eyebrow"><Sparkles size={14}/> {t('support_eyebrow')}</span>
          <h1 id="support-title">{t('support_title')}</h1>
          <p>{t('support_hero_desc')}</p>
          <div className="support-hero-points"><span><ShieldCheck size={15}/> {t('support_account_assist')}</span><span><MessageCircle size={15}/> {t('support_direct_requests')}</span></div>
        </div>
        <div className="support-hero-orbit"><div className="support-orbit-ring"/><div className="support-orbit-core"><CircleHelp size={38}/></div><span>BETNOVA<br/>SUPPORT</span></div>
      </div>

      <div className="support-content">
        <div className="support-section-heading"><span>CONTACT OPTIONS</span><h2>{t('support_how_help')}</h2><p>{t('support_choose_method')}</p></div>
        <div className="support-contact-grid">
          <article className="support-contact-card support-email-card">
            <div className="support-card-icon"><Mail size={21}/></div>
            <span className="support-card-kicker">{t('support_send_email').toUpperCase()}</span>
            <h3>{t('support_send_email')}</h3>
            <p>{t('support_email_hint')}</p>
            {supportEmail ? <><strong className="support-email-address">{supportEmail}</strong><button type="button" onClick={composeEmail}>{t('support_compose_email')} <ArrowRight size={16}/></button></> : <span className="support-email-pending">{t('support_email_pending')}</span>}
          </article>
          <article className="support-contact-card support-request-card">
            <div className="support-card-icon"><MessageCircle size={21}/></div>
            <span className="support-card-kicker">{t('support_request_title').toUpperCase()}</span>
            <h3>{t('support_request_title')}</h3>
            <p>{t('support_request_desc')}</p>
            <a href="#support-form">{t('support_submit_request')} <ArrowRight size={16}/></a>
          </article>
        </div>

        <section className="support-form-card" id="support-form">
          <div className="support-form-heading"><div><span className="support-card-kicker">WE’RE LISTENING</span><h2>{t('support_request_title')}</h2><p>{t('support_request_desc')}</p></div><div className="support-form-mark"><Send size={22}/></div></div>
          {sent ? <div className="support-success"><CheckCircle2 size={25}/><div><b>{t('support_received')}</b><p>Thank you for contacting BETNOVA. {t('support_how_help')} has been added to the support inbox.</p></div><button type="button" onClick={() => setSent(false)}>{t('support_send_another')}</button></div> :
            <form onSubmit={event => void submitRequest(event)} className="support-form">
              <div className="support-form-row"><label>{t('your_name')} <span>{t('support_optional')}</span><input value={name} onChange={event => setName(event.target.value)} maxLength={100} placeholder={t('your_name')}/></label><label>{t('email_address')}<input type="email" required value={email} onChange={event => setEmail(event.target.value)} maxLength={254} placeholder="you@example.com"/></label></div>
              <div className="support-form-row"><label>{t('support_request_title')}<select value={category} onChange={event => setCategory(event.target.value)}><option>Account & profile</option><option>Deposit</option><option>Withdrawal</option><option>Wallet & balance</option><option>Sports & markets</option><option>Games</option><option>Technical issue</option><option>Other</option></select></label><label>{t('support_request_title')}<input required value={subject} onChange={event => setSubject(event.target.value)} maxLength={140} placeholder="Briefly describe your issue"/></label></div>
              <label className="support-message-label">{t('support_how_help')}<textarea required value={message} onChange={event => setMessage(event.target.value)} minLength={12} maxLength={4000} rows={5} placeholder="Write the details of your request here…"/></label>
              {error && <p className="support-error" role="alert">{error}</p>}
              <div className="support-submit-row"><small><ShieldCheck size={14}/> {t('support_private_note')}</small><button type="submit" disabled={busy}>{busy ? t('sending') : t('support_send')} <Send size={15}/></button></div>
            </form>}
        </section>
        <div className="support-footer-note"><ShieldCheck size={15}/> BETNOVA Support · Please never send passwords, card PINs, private keys or verification codes.</div>
      </div>
    </section>
  </div>
}
