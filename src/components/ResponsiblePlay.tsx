import { useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, HeartHandshake, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = { onClose: () => void; userEmail: string | null; language?: string }

export default function ResponsiblePlay({ onClose, userEmail, language = 'en' }: Props) {
  const ar = language === 'ar'
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
        <button type="button" onClick={onClose}><ArrowLeft size={17}/>{ar ? 'العودة إلى BETNOVA' : 'Back to BETNOVA'}</button>
        <b>BETNOVA <span>RESPONSIBLE PLAY</span></b>
        <button type="button" className="responsible-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
      </header>
      <div className="responsible-hero">
        <div className="responsible-hero-copy">
          <span className="responsible-kicker"><ShieldCheck size={15}/> {ar ? 'اللعب الواعي يبدأ منك' : 'PLAY SMART. STAY IN CONTROL.'}</span>
          <h1 id="responsible-title">{ar ? 'اللعب يجب أن يبقى متعة.' : 'Keep the game enjoyable.'}<em>{ar ? ' صحتك أولويتنا.' : ' Your wellbeing comes first.'}</em></h1>
          <p>{ar ? 'BETNOVA تشجع على الترفيه المسؤول. لا تراهن أبداً بأموال تحتاجها، ولا تحاول تعويض الخسائر بمزيد من الرهانات.' : 'BETNOVA encourages a balanced approach to entertainment. Never stake money you need for essentials, and never chase losses by placing more bets.'}</p>
        </div>
        <div className="responsible-hero-mark"><div><HeartHandshake size={43}/></div><span>BETNOVA<br/>PLAYER CARE</span></div>
      </div>
      <div className="responsible-content">
        <div className="responsible-principles">
          <article><span>01</span><h3>{ar ? 'ضع ميزانية مسبقاً' : 'Set a firm budget'}</h3><p>{ar ? 'حدد مبلغاً يمكنك تحمل خسارته، ولا تتجاوزه.' : 'Decide what you can afford to lose before you start. Never exceed it.'}</p></article>
          <article><span>02</span><h3>{ar ? 'راقب وقتك' : 'Watch your time'}</h3><p>{ar ? 'خذ فترات راحة منتظمة ولا تجعل اللعب يؤثر على حياتك اليومية.' : 'Take regular breaks and keep play from interfering with daily life.'}</p></article>
          <article><span>03</span><h3>{ar ? 'لا تطارد الخسائر' : 'Never chase losses'}</h3><p>{ar ? 'الخسارة ليست سبباً لزيادة الرهانات أو الاقتراض.' : 'A loss is not a reason to increase stakes or borrow money.'}</p></article>
        </div>
        <section className="responsible-warning"><ShieldCheck size={22}/><div><b>{ar ? 'تذكّر' : 'A helpful reminder'}</b><p>{ar ? 'إذا شعرت أن اللعب خرج عن سيطرتك، توقف واطلب المساعدة من شخص تثق به أو من خدمة دعم مختصة في بلدك.' : 'If play feels difficult to control, stop and speak with someone you trust or a qualified support service in your country.'}</p></div></section>
        <section className="responsible-request">
          <div><span className="responsible-kicker">{ar ? 'أدوات طلب المساعدة' : 'TAKE A STEP BACK'}</span><h2>{ar ? 'هل تحتاج إلى استراحة؟' : 'Need a break from play?'}</h2><p>{ar ? 'يمكنك إرسال طلب إلى إدارة BETNOVA للحصول على استراحة مؤقتة أو طلب الاستبعاد الذاتي. سيظهر الطلب في صندوق الدعم لدى الإدارة.' : 'Send the BETNOVA team a request for a temporary break or self-exclusion. Your request will be delivered to the administration support inbox.'}</p></div>
          {sent ? <div className="responsible-success"><CheckCircle2 size={25}/><div><b>{ar ? 'تم استلام طلبك' : 'Request received'}</b><p>{ar ? 'وصل طلبك إلى الإدارة للمراجعة والتواصل معك. هذا الطلب لا يوقف الحساب تلقائياً.' : 'The administration has received your request and will contact you. This submission does not automatically suspend or restrict your account.'}</p></div></div> :
            <form onSubmit={event => void submitRequest(event)}>
              <label>{ar ? 'نوع الطلب' : 'Request type'}<select value={requestType} onChange={event => setRequestType(event.target.value)}><option>Temporary break</option><option>Self-exclusion</option></select></label>
              {requestType === 'Temporary break' && <label>{ar ? 'مدة الاستراحة المطلوبة' : 'Requested break duration'}<select value={duration} onChange={event => setDuration(event.target.value)}><option>24 hours</option><option>7 days</option><option>30 days</option><option>90 days</option></select></label>}
              <label>{ar ? 'ملاحظات إضافية (اختياري)' : 'Additional details (optional)'}<textarea value={details} onChange={event => setDetails(event.target.value)} rows={3} maxLength={1000} placeholder={ar ? 'اكتب أي تفاصيل تريد مشاركتها...' : 'Share any details you would like us to know...'}/></label>
              {!userEmail && <p className="responsible-login-note">{ar ? 'يجب تسجيل الدخول لإرسال طلب مرتبط بحسابك.' : 'Sign in is required to submit an account-related request.'}</p>}
              {error && <p className="responsible-error" role="alert">{error}</p>}
              <button type="submit" disabled={busy || !userEmail}>{busy ? (ar ? 'جارٍ الإرسال...' : 'Submitting…') : (ar ? 'إرسال الطلب إلى الإدارة' : 'Send request to administration')} <ArrowLeft size={15}/></button>
              <small><Clock3 size={13}/>{ar ? 'الطلبات تتم مراجعتها يدوياً. لا يعتبر الحساب موقوفاً حتى تؤكد الإدارة ذلك.' : 'Requests are reviewed manually. Your account is not restricted until the administration confirms the action.'}</small>
            </form>}
        </section>
        <footer className="responsible-footer"><ShieldCheck size={15}/>{ar ? 'BETNOVA · سلامتك ورفاهيتك أهم من اللعب.' : 'BETNOVA · Your wellbeing matters more than the game.'}</footer>
      </div>
    </section>
  </div>
}
