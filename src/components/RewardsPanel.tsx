import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Gift, History, Link2, RefreshCw, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './rewards-center.css'

type Props = { onClose: () => void; language?: string }
type Claim = { id: string; currency: string; total_staked?: number; cashback_amount?: number; total_deposited?: number; reward_amount?: number; created_at: string }
type Referral = { referred_user_id: string; status: string; created_at: string }

const isArabic = (language?: string) => language === 'ar'
const money = (amount: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)

export default function RewardsPanel({ onClose, language = 'en' }: Props) {
  const ar = isArabic(language)
  const [loading, setLoading] = useState(true)
  const [bonusUsd, setBonusUsd] = useState<number | null>(null)
  const [cashback, setCashback] = useState<Claim[]>([])
  const [depositClaims, setDepositClaims] = useState<Claim[]>([])
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [referralCode, setReferralCode] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) { setError(ar ? 'الخدمة غير متاحة حاليًا.' : 'Rewards service is not configured.'); setLoading(false); return }
    setLoading(true); setError('')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) { setError(ar ? 'سجّل الدخول لعرض مكافآتك.' : 'Sign in to view your rewards.'); setLoading(false); return }
    const [bonus, weekly, deposits, referralRows, code] = await Promise.all([
      supabase.from('bonus_wallet_accounts').select('available_balance').eq('user_id', user.id).maybeSingle(),
      supabase.from('weekly_cashback_claims').select('id,currency,total_staked,cashback_amount,created_at').eq('user_id', user.id).order('week_start', { ascending: false }).limit(12),
      supabase.from('deposit_streak_claims').select('id,currency,total_deposited,reward_amount,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),
      supabase.from('referrals').select('referred_user_id,status,created_at').eq('referrer_user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.rpc('betnova_get_referral_code'),
    ])
    if (!bonus.error) setBonusUsd(Number(bonus.data?.available_balance ?? 0))
    if (!weekly.error) setCashback((weekly.data ?? []) as Claim[])
    if (!deposits.error) setDepositClaims((deposits.data ?? []) as Claim[])
    if (!referralRows.error) setReferrals((referralRows.data ?? []) as Referral[])
    if (!code.error) setReferralCode(String(code.data ?? ''))
    const failures = [weekly.error, deposits.error, referralRows.error, code.error].filter(Boolean)
    if (failures.length) setError(ar ? 'بعض برامج المكافآت لم تُفعّل بعد. ستظهر تفاصيلها هنا بعد تفعيلها.' : 'Some reward services are awaiting activation. Their details will appear here once enabled.')
    setLoading(false)
  }, [ar])

  useEffect(() => { void load() }, [load])

  const referralLink = referralCode ? `https://betnova-8daa3.web.app/?ref=${referralCode}` : ''
  async function copyReferral() {
    if (!referralLink) return
    try { await navigator.clipboard.writeText(referralLink); setCopied(true) }
    catch { setError(ar ? 'تعذر نسخ الرابط على هذا الجهاز.' : 'Could not copy the link on this device.') }
  }

  return <div className="rewards-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="rewards-panel" dir={ar ? "rtl" : "ltr"} role="dialog" aria-modal="true" aria-labelledby="rewards-title">
      <button className="rewards-close" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}><X size={19}/></button>
      <div className="rewards-kicker"><Sparkles size={15}/> BETNOVA · REWARDS</div>
      <h2 id="rewards-title">{ar ? 'مركز المكافآت' : 'Rewards Center'}</h2>
      <p className="rewards-intro">{ar ? 'كل المكافآت وشروط استحقاقها وسجل ما حصلت عليه.' : 'Your rewards, eligibility rules, and reward history in one place.'}</p>
      {loading ? <p className="rewards-message">{ar ? 'جارٍ تحميل المكافآت…' : 'Loading rewards…'}</p> : <>
        {error && <p className="rewards-message">{error}</p>}
        <article className="reward-card welcome">
          <div className="reward-card-icon"><Gift size={20}/></div>
          <div><span className="reward-eyebrow">{ar ? 'مكافأة الترحيب' : 'WELCOME BONUS'}</span><h3>{ar ? 'مكافأة ترحيبية حتى 100 دولار' : 'Up to $100 welcome bonus'}</h3>
            <p>{ar ? 'القيمة عند التسجيل: 25,000 دج لعملة DZD، أو 100 دولار لعملة USD، أو 90 يورو لعملة EUR. تُضاف إلى محفظة المكافآت المنفصلة وليست رصيدًا نقديًا، وتخضع لشروط المكافأة.' : 'Signup values: 25,000 DZD for DZD accounts, $100 for USD accounts, or €90 for EUR accounts. Credited to the separate bonus wallet, not cash balance; bonus terms apply.'}</p>
            {bonusUsd !== null && <b className="reward-balance">{money(bonusUsd, 'USD')} {ar ? 'رصيد المكافآت الحالي' : 'current bonus balance'}</b>}
          </div>
        </article>
        <article className="reward-card">
          <div className="reward-card-icon"><Wallet size={20}/></div>
          <div><span className="reward-eyebrow">{ar ? 'استرداد أسبوعي نقدي' : 'WEEKLY CASHBACK'}</span><h3>5%</h3>
            <p>{ar ? 'تحصل على 5% من إجمالي المبالغ التي راهنت بها خلال الأسبوع المكتمل السابق. تُحسب الرهانات المقبولة فقط، ولا تُحسب الإيداعات أو الأرباح. يضاف الاسترداد إلى المحفظة النقدية بنفس العملة.' : 'Get 5% of the total accepted stakes you placed during the previous completed week. Deposits and winnings are excluded. Cashback is credited to your real-money wallet in the same currency.'}</p>
          </div>
        </article>
        <article className="reward-card">
          <div className="reward-card-icon"><RefreshCw size={20}/></div>
          <div><span className="reward-eyebrow">{ar ? 'مكافأة الإيداع المتتالي' : 'FIVE-DEPOSIT STREAK'}</span><h3>5%</h3>
            <p>{ar ? 'بعد إتمام 5 إيداعات ناجحة متتالية بالعملة نفسها، تحصل على 5% من مجموع مبالغ الإيداعات الخمسة. لا تُحتسب طلبات الإيداع المرفوضة أو غير المؤكدة.' : 'After 5 consecutive approved deposits in the same currency, earn 5% of their combined value. Pending or rejected deposits do not qualify.'}</p>
          </div>
        </article>
        <article className="reward-card">
          <div className="reward-card-icon"><Link2 size={20}/></div>
          <div><span className="reward-eyebrow">{ar ? 'مكافأة الإحالة' : 'REFERRAL REWARD'}</span><h3>100 DZD</h3>
            <p>{ar ? 'عن كل مستخدم جديد يسجل عبر رابطك، بعد تأكيد بريده الإلكتروني ومراجعة الاستحقاق.' : 'For each new user who registers through your link, after email verification and eligibility review.'}</p>
            <div className="referral-share">
              <span>{referralCode || (ar ? 'رابط الإحالة غير متاح بعد' : 'Referral link not active yet')}</span>
              <button type="button" disabled={!referralLink} onClick={() => void copyReferral()}>{copied ? (ar ? 'تم النسخ' : 'Copied') : (ar ? 'نسخ الرابط' : 'Copy link')}</button>
            </div>
            <small>{ar ? `الإحالات: ${referrals.length} · المقبولة: ${referrals.filter(item => item.status === 'approved').length}` : `Invites: ${referrals.length} · Approved: ${referrals.filter(item => item.status === 'approved').length}`}</small>
          </div>
        </article>
        <article className="reward-card">
          <div className="reward-card-icon"><ShieldCheck size={20}/></div>
          <div><span className="reward-eyebrow">{ar ? 'اكسب من النشر' : 'EARN FROM SOCIAL POSTS'}</span><h3>50 DZD</h3>
            <p>{ar ? 'لكل منشور مقبول على Facebook أو Instagram أو TikTok أو YouTube، مع إرسال رابط المنشور وصورة إثبات. تتم المراجعة قبل إضافة المكافأة إلى الرصيد النقدي.' : 'For each approved post on Facebook, Instagram, TikTok, or YouTube. Submit the post URL and a screenshot; approval is required before cash credit.'}</p>
          </div>
        </article>
        <div className="rewards-history">
          <h3><History size={17}/> {ar ? 'سجل الاسترداد الأسبوعي' : 'Weekly cashback history'}</h3>
          {cashback.length ? cashback.map(item => <div className="reward-history-row" key={item.id}><span>{new Date(item.created_at).toLocaleDateString()}</span><b>{money(Number(item.cashback_amount ?? 0), item.currency)}</b><small>{ar ? 'رهانات' : 'Staked'}: {money(Number(item.total_staked ?? 0), item.currency)}</small></div>) : <p>{ar ? 'لا توجد عمليات استرداد مسجلة بعد.' : 'No cashback claims recorded yet.'}</p>}
          <h3><History size={17}/> {ar ? 'مكافآت الإيداع' : 'Deposit streak rewards'}</h3>
          {depositClaims.length ? depositClaims.map(item => <div className="reward-history-row" key={item.id}><span>{new Date(item.created_at).toLocaleDateString()}</span><b>{money(Number(item.reward_amount ?? 0), item.currency)}</b><small>{ar ? 'مجموع الإيداعات' : 'Deposited'}: {money(Number(item.total_deposited ?? 0), item.currency)}</small></div>) : <p>{ar ? 'لا توجد مكافآت إيداع مسجلة بعد.' : 'No deposit streak rewards recorded yet.'}</p>}
        </div>
      </>}
      <p className="rewards-disclaimer">{ar ? 'المكافآت لا تضمن الربح ولا ينبغي أن تدفعك إلى زيادة الرهانات أو مطاردة الخسائر. تطبق شروط الأهلية والتحقق والقوانين المحلية.' : 'Rewards do not guarantee profit and should never be a reason to increase stakes or chase losses. Eligibility, verification, and local laws apply.'}</p>
      <button className="rewards-done" onClick={onClose}>{ar ? 'إغلاق' : 'Close'} <ArrowRight size={15}/></button>
    </section>
  </div>
}
