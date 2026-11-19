import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, ImagePlus, ShieldCheck, UploadCloud, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './rewards-center.css'

type Props = { onClose: () => void; language?: string }
type Submission = { id: string; platform: string; post_url: string; status: 'pending'|'approved'|'rejected'; reward_amount: number; created_at: string }

export default function EarnPanel({ onClose, language = 'en' }: Props) {
  const ar = language === 'ar'
  const [platform, setPlatform] = useState('facebook')
  const [postUrl, setPostUrl] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [items, setItems] = useState<Submission[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!supabase) { setMessage(ar ? 'الخدمة غير متاحة حاليًا.' : 'Earn service is not configured.'); setLoading(false); return }
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) { setMessage(ar ? 'سجّل الدخول لإرسال إثباتاتك.' : 'Sign in to submit your proof.'); setLoading(false); return }
    const { data, error } = await supabase.from('earn_post_submissions')
      .select('id,platform,post_url,status,reward_amount,created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30)
    if (error) setMessage(ar ? 'ميزة Earn بانتظار التفعيل.' : 'Earn submissions are awaiting activation.')
    else setItems((data ?? []) as Submission[])
    setLoading(false)
  }, [ar])

  useEffect(() => { void load() }, [load])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !proof) return
    let parsed: URL
    try { parsed = new URL(postUrl.trim()) } catch { setMessage(ar ? 'أدخل رابط منشور صحيحًا.' : 'Enter a valid post URL.'); return }
    if (!['http:','https:'].includes(parsed.protocol)) { setMessage(ar ? 'الرابط غير صالح.' : 'Invalid post URL.'); return }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const allowedHosts: Record<string,string[]> = {
      facebook: ['facebook.com','fb.watch'],
      instagram: ['instagram.com'],
      tiktok: ['tiktok.com'],
      youtube: ['youtube.com','youtu.be'],
    }
    if (!allowedHosts[platform]?.some(domain => host === domain || host.endsWith('.' + domain))) {
      setMessage(ar ? 'يجب أن يكون الرابط من المنصة المختارة.' : 'The URL must belong to the selected platform.')
      return
    }
    if (proof.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(proof.type)) {
      setMessage(ar ? 'الصورة يجب أن تكون JPG أو PNG أو WEBP وأقل من 5 ميغابايت.' : 'Use a JPG, PNG, or WEBP image under 5 MB.'); return
    }
    setBusy(true); setMessage('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error(ar ? 'سجّل الدخول أولاً.' : 'Please sign in first.')
      const extension = proof.type === 'image/png' ? 'png' : proof.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('earn-proofs').upload(path, proof, { contentType: proof.type, upsert: false })
      if (uploadError) throw uploadError
      const { error: submitError } = await supabase.functions.invoke('submit-earn-proof', {
        body: { platform, post_url: parsed.toString(), proof_path: path },
      })
      if (submitError) {
        await supabase.storage.from('earn-proofs').remove([path])
        throw submitError
      }
      setPostUrl(''); setProof(null)
      const input = document.getElementById('earn-proof-file') as HTMLInputElement | null
      if (input) input.value = ''
      setMessage(ar ? 'تم إرسال الإثبات للمراجعة. ستضاف 50 دج إلى رصيدك النقدي بعد الموافقة.' : 'Proof submitted for review. 50 DZD will be added to your cash wallet after approval.')
      await load()
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : (ar ? 'تعذر إرسال الإثبات.' : 'Could not submit proof.'))
    } finally { setBusy(false) }
  }

  const statusLabel = (status: string) => ar ? status === 'approved' ? 'مقبول' : status === 'rejected' ? 'مرفوض' : 'قيد المراجعة' : status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending review'

  return <div className="rewards-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="rewards-panel earn-panel" dir={ar ? "rtl" : "ltr"} role="dialog" aria-modal="true" aria-labelledby="earn-title">
      <button className="rewards-close" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}><X size={19}/></button>
      <div className="rewards-kicker"><UploadCloud size={15}/> BETNOVA · EARN</div>
      <h2 id="earn-title">{ar ? 'اربح من نشاطك' : 'Earn with BETNOVA'}</h2>
      <p className="rewards-intro">{ar ? 'انشر محتوى BETNOVA على منصاتك، ثم أرسل الرابط وصورة إثبات.' : 'Share BETNOVA content on your social platforms, then submit the post URL and screenshot.'}</p>
      <div className="earn-rate"><b>50 DZD</b><span>{ar ? 'لكل منشور تتم الموافقة عليه' : 'per approved post'}</span></div>
      <div className="earn-platforms"><span>Facebook</span><span>Instagram</span><span>TikTok</span><span>YouTube</span></div>
      <form className="earn-form" onSubmit={submit}>
        <label>{ar ? 'المنصة' : 'Platform'}
          <select value={platform} onChange={event => setPlatform(event.target.value)}>
            <option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="youtube">YouTube</option>
          </select>
        </label>
        <label>{ar ? 'رابط المنشور العام' : 'Public post URL'}
          <input type="url" required value={postUrl} onChange={event => setPostUrl(event.target.value)} placeholder="https://…"/>
        </label>
        <label className="earn-upload" htmlFor="earn-proof-file">
          <ImagePlus size={22}/><b>{proof ? proof.name : (ar ? 'أرفق لقطة شاشة للإثبات' : 'Attach a proof screenshot')}</b>
          <small>{ar ? 'JPG أو PNG أو WEBP · حتى 5 ميغابايت' : 'JPG, PNG, or WEBP · up to 5 MB'}</small>
          <input id="earn-proof-file" type="file" accept="image/jpeg,image/png,image/webp" required onChange={event => setProof(event.target.files?.[0] ?? null)}/>
        </label>
        <p className="earn-review-note"><ShieldCheck size={15}/>{ar ? 'تتم مراجعة الرابط والصورة لمنع التكرار والاحتيال. لا تُضاف المكافأة قبل الموافقة.' : 'Links and screenshots are reviewed to prevent duplicate or fraudulent submissions. Rewards are not credited before approval.'}</p>
        {message && <p className="rewards-message" role="status">{message}</p>}
        <button className="rewards-done" type="submit" disabled={busy || loading || !proof}>{busy ? (ar ? 'جارٍ الإرسال…' : 'Submitting…') : (ar ? 'إرسال للمراجعة' : 'Submit for review')} <ArrowRight size={15}/></button>
      </form>
      <div className="rewards-history">
        <h3><CheckCircle2 size={17}/>{ar ? 'طلباتي السابقة' : 'My submissions'}</h3>
        {loading ? <p>{ar ? 'جارٍ التحميل…' : 'Loading…'}</p> : items.length ? items.map(item => <div className="reward-history-row" key={item.id}>
          <span>{item.platform.toUpperCase()} · {new Date(item.created_at).toLocaleDateString()}</span>
          <b>{statusLabel(item.status)}</b><small>{item.status === 'approved' ? '50 DZD' : item.status === 'pending' ? (ar ? 'بانتظار المراجعة' : 'Awaiting review') : (ar ? 'لم تُمنح مكافأة' : 'No reward issued')}</small>
        </div>) : <p>{ar ? 'لم ترسل أي منشورات بعد.' : 'No submissions yet.'}</p>}
      </div>
    </section>
  </div>
}
