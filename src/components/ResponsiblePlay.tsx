import { useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, HeartHandshake, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type Props = { onClose: () => void; userEmail: string | null; language?: string }

export default function ResponsiblePlay({ onClose, userEmail, language = 'en' }: Props) {
  const ar = language === 'ar'
  const { t } = useLanguage()
  const [requestType, setRequestType] = useState('Temporary break')
  const [duration, setDuration] = useState('7 days')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) { setError(ar ? 'الخدمة غير متاحة حالياً. حاول لاحقاً.' : 'This service is temporarily unavailable. Please try again later.'); return }
    setBusy(true); setError('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      const email = user?.email ?? userEmail
      if (!email) throw new Error(ar ? 'يرجى تسجيل الدخول أو التواصل مع الدعم عبر البريد.' : 'Please sign in or contact support by email.')
      const message = [
        'Responsible play account request',
        'Request: ' + requestType,
        'Requested duration: ' + (requestType === 'Temporary break' ? duration : 'Please contact me to confirm'),
        details.trim() ? 'Additional details: ' + details.trim() : ''
      ].filter(Boolean).join('\n')
      const { error: insertError } = await supabase.from('support_requests').insert({
        user_id: user?.id ?? null,
        full_name: null,
        email,
        category: 'Responsible Play',
        subject: requestType + (requestType === 'Temporary break' ? ' - ' + duration : ''),
        message
      })
      if (insertError) throw insertError
      setSent(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : (ar ? 'تعذر إرسال الطلب.' : 'Could not submit your request.'))
    } finally { setBusy(false) }
  }

  return <div className="responsible-backdrop">
    <section className="responsible-page" role="dialog" aria-modal="true" aria-labelledby="responsible-title">
      <header className="responsible-topbar">
        <button type="button" onClick={onClose}><ArrowLeft size={17}/>{t('back_to_betnova')}</button>
        <b>BETNOVA <span>{t('responsible_play').toUpperCase()}</span></b>
        <button type="button" className="responsible-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
      </header>
      <div className="responsible-hero">
        <div className="responsible-hero-copy">
          <span className="responsible-kicker"><ShieldCheck size={15}/> {t('rp_title').toUpperCase()}</span>
          <h1 id="responsible-title">{t('rp_title')}<em></em></h1>
          <p>{t('rp_intro')}</p>
        </div>
        <div className="responsible-hero-mark"><div><HeartHandshake size={43}/></div><span>BETNOVA<br/>PLAYER CARE</span></div>
      </div>
      <div className="responsible-content">
        <div className="responsible-principles">
          <article><span>01</span><h3>{t('rp_budget')}</h3><p>{t('rp_budget_desc')}</p></article>
          <article><span>02</span><h3>{t('rp_time')}</h3><p>{t('rp_time_desc')}</p></article>
          <article><span>03</span><h3>{t('rp_no_chase')}</h3><p>{t('rp_no_chase_desc')}</p></article>
        </div>
        <section className="responsible-warning"><ShieldCheck size={22}/><div><b>{t('rp_reminder')}</b><p>{t('rp_reminder_desc')}</p></div></section>
        <section className="responsible-request">
          <div><span className="responsible-kicker">{t('rp_need_break').toUpperCase()}</span><h2>{t('rp_need_break')}</h2><p>{t('rp_request_desc')}</p></div>
          {sent ? <div className="responsible-success"><CheckCircle2 size={25}/><div><b>{t('support_received')}</b><p>{t('rp_received')}</p></div></div> :
            <form onSubmit={event => void submitRequest(event)}>
              <label>{t('rp_request_type')}<select value={requestType} onChange={event => setRequestType(event.target.value)}><option>Temporary break</option><option>Self-exclusion</option></select></label>
              {requestType === 'Temporary break' && <label>{t('rp_duration')}<select value={duration} onChange={event => setDuration(event.target.value)}><option>24 hours</option><option>7 days</option><option>30 days</option><option>90 days</option></select></label>}
              <label>{ar ? 'ملاحظات إضافية (اختياري)' : 'Additional details (optional)'}<textarea value={details} onChange={event => setDetails(event.target.value)} rows={3} maxLength={1000} placeholder={ar ? 'اكتب أي تفاصيل تريد مشاركتها...' : 'Share any details you would like us to know...'}/></label>
              {!userEmail && <p className="responsible-login-note">{t('rp_login_required')}</p>}
              {error && <p className="responsible-error" role="alert">{error}</p>}
              <button type="submit" disabled={busy || !userEmail}>{busy ? (ar ? 'جارٍ الإرسال...' : 'Submitting…') : (ar ? 'إرسال الطلب إلى الإدارة' : 'Send request to administration')} <ArrowLeft size={15}/></button>
              <small><Clock3 size={13}/>{t('rp_manual_note')}</small>
            </form>}
        </section>
        <footer className="responsible-footer"><ShieldCheck size={15}/>{ar ? 'BETNOVA · سلامتك ورفاهيتك أهم من اللعب.' : 'BETNOVA · Your wellbeing matters more than the game.'}</footer>
      </div>
    </section>
  </div>
}
