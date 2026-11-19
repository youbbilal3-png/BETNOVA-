import { useCallback, useEffect, useState } from 'react'
import { Bell, CalendarDays, CheckCircle2, Clock3, CreditCard, Flag, ShieldCheck, Trophy } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../lib/supabase'
import './notification-settings.css'

type PreferenceKey = 'enabled' | 'match_start' | 'goals' | 'red_cards' | 'half_time' | 'full_time' | 'bet_settlement' | 'account_activity'
type Preferences = Record<PreferenceKey, boolean>
type NotificationRow = { key: Exclude<PreferenceKey, 'enabled'>; icon: typeof Bell; ar: string; en: string; hintAr: string; hintEn: string; available: boolean }

const defaults: Preferences = {
  enabled: false,
  match_start: false,
  goals: false,
  red_cards: false,
  half_time: false,
  full_time: false,
  bet_settlement: false,
  account_activity: false,
}

const rows: NotificationRow[] = [
  { key: 'match_start', icon: CalendarDays, ar: 'بداية المباراة', en: 'Match starting', hintAr: 'عند انطلاق المباراة التي تتابعها', hintEn: 'When a followed match kicks off' },
  { key: 'goals', icon: Trophy, ar: 'الأهداف', en: 'Goals', hintAr: 'بعد تأكيد الهدف وعدم وجود مراجعة VAR معلّقة', hintEn: 'After a goal is confirmed and no VAR review is pending' },
  { key: 'red_cards', icon: Flag, ar: 'البطاقات الحمراء', en: 'Red cards', hintAr: 'عند إشهار بطاقة حمراء', hintEn: 'When a red card is shown' },
  { key: 'half_time', icon: Clock3, ar: 'نهاية الشوط الأول', en: 'Half-time', hintAr: 'عند نهاية الشوط الأول', hintEn: 'At the half-time whistle' },
  { key: 'full_time', icon: CheckCircle2, ar: 'نهاية المباراة', en: 'Full-time', hintAr: 'عند نهاية المباراة', hintEn: 'At full time' },
  { key: 'bet_settlement', icon: CreditCard, ar: 'تسوية الرهانات', en: 'Bet settlement', hintAr: 'قريباً — تنبيهات تسوية القسائم', hintEn: 'Coming soon — bet slip settlement alerts', available: false },
  { key: 'account_activity', icon: ShieldCheck, ar: 'نشاط الحساب', en: 'Account activity', hintAr: 'قريباً — تحديثات الإيداع والسحب وأمان الحساب', hintEn: 'Coming soon — deposit, withdrawal and account-security updates', available: false },
]

export default function NotificationSettings({ language = 'en' }: { language?: string }) {
  const isArabic = language === 'ar'
  const isNative = Capacitor.isNativePlatform()
  const [userId, setUserId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Preferences>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<PreferenceKey | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    let active = true
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id ?? null)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const toggle = useCallback(async (key: PreferenceKey, value: boolean) => {
    if (!supabase || !userId) {
      setMessage(isArabic ? 'سجّل الدخول أولاً لحفظ إعداداتك.' : 'Sign in first to save your preferences.')
      return
    }
    setMessage('')
    if (value && key !== 'enabled' && !isNative) {
      setMessage(isArabic ? 'يمكنك حفظ تفضيلاتك هنا، لكن استقبال الإشعارات يتطلب تطبيق BETNOVA على Android.' : 'You can save preferences here, but receiving push alerts requires the BETNOVA Android app.')
    }
    if (value && isNative) {
      try {
        let permission = await PushNotifications.checkPermissions()
        if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions()
        if (permission.receive !== 'granted') {
          setMessage(isArabic ? 'لم تسمح بإرسال الإشعارات. يمكنك تفعيلها من إعدادات الهاتف.' : 'Notification permission was not granted. You can enable it in Android settings.')
          return
        }
        await PushNotifications.createChannel({
          id: 'betnova_alerts',
          name: 'BETNOVA Alerts',
          description: 'Match events and account notifications',
          importance: 4,
          visibility: 1,
          sound: 'default',
          vibration: true,
        })
        await PushNotifications.register()
      } catch {
        setMessage(isArabic ? 'تعذر تفعيل الإشعارات على هذا الجهاز.' : 'Could not enable notifications on this device.')
        return
      }
    }
    const next = { ...prefs, [key]: value }
    if (key === 'enabled') {
      next.enabled = value
    } else {
      const otherEnabled = rows.some(row => row.key !== key && next[row.key])
      next.enabled = value || otherEnabled
    }
    setSaving(key)
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: userId,
      ...next,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) {
      setMessage(isArabic ? 'لم يتم حفظ التغيير. حاول مرة أخرى.' : 'Could not save this change. Please try again.')
    } else {
      setPrefs(next)
    }
    setSaving(null)
  }, [userId, prefs, isNative, isArabic])

  if (!userId) {
    return <section className="bn-notification-settings">
      <div className="bn-notification-heading"><Bell size={18}/><div><b>{isArabic ? 'الإشعارات' : 'Notifications'}</b><small>{isArabic ? 'سجّل الدخول لإدارة تنبيهاتك.' : 'Sign in to manage your alerts.'}</small></div></div>
    </section>
  }

  return <section className="bn-notification-settings">
    <div className="bn-notification-heading">
      <Bell size={18}/>
      <div><b>{isArabic ? 'إعدادات الإشعارات' : 'Notification preferences'}</b><small>{isArabic ? 'اختر الأحداث التي تريد أن يصلك تنبيه عند حدوثها.' : 'Choose which events you want to hear about.'}</small></div>
    </div>
    <div className="bn-notification-master">
      <div><b>{isArabic ? 'تفعيل الإشعارات' : 'Enable notifications'}</b><small>{isArabic ? 'إيقافه يعطّل جميع التنبيهات.' : 'Turn off to disable all alerts.'}</small></div>
      <button type="button" role="switch" aria-checked={prefs.enabled} disabled={loading || saving !== null} className={prefs.enabled ? 'is-on' : ''} onClick={() => void toggle('enabled', !prefs.enabled)}><span/></button>
    </div>
    <div className="bn-notification-list">
      {rows.map(row => {
        const Icon = row.icon
        return <div className="bn-notification-row" key={row.key}>
          <Icon size={17}/>
          <div><b>{isArabic ? row.ar : row.en}</b><small>{isArabic ? row.hintAr : row.hintEn}</small></div>
          <button type="button" role="switch" aria-checked={prefs[row.key]} disabled={loading || saving !== null || !prefs.enabled || !row.available} className={prefs[row.key] && row.available ? 'is-on' : ''} onClick={() => void toggle(row.key, !prefs[row.key])}><span/></button>
        </div>
      })}
    </div>
    {!isNative && <p className="bn-notification-footnote">{isArabic ? 'ملاحظة: إعدادات الاستقبال الفعلي ستعمل عند استخدام تطبيق BETNOVA على Android.' : 'Note: actual push delivery will be available in the BETNOVA Android app.'}</p>}
    {message && <p className="bn-notification-message" role="status">{message}</p>}
    {loading && <p className="bn-notification-footnote">{isArabic ? 'جارٍ تحميل الإعدادات…' : 'Loading preferences…'}</p>}
  </section>
}
