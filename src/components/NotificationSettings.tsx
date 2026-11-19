import { useCallback, useEffect, useState } from 'react'
import { Bell, CalendarDays, CheckCircle2, Clock3, CreditCard, Flag, ShieldCheck, Trophy } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '../lib/supabase'
import './notification-settings.css'

type PreferenceKey = 'enabled' | 'match_start' | 'goals' | 'red_cards' | 'half_time' | 'full_time' | 'bet_settlement' | 'account_activity'
type Preferences = Record<PreferenceKey, boolean>
type NotificationRow = {
  key: Exclude<PreferenceKey, 'enabled'>
  icon: typeof Bell
  ar: string
  en: string
  fr: string
  hintAr: string
  hintEn: string
  hintFr: string
  available: boolean
}

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
  { key: 'match_start', icon: CalendarDays, ar: 'بداية المباراة', en: 'Match starting', fr: 'Début du match', hintAr: 'عند انطلاق المباراة التي تتابعها', hintEn: 'When a followed match kicks off', hintFr: 'Au coup d’envoi d’un match suivi', available: true },
  { key: 'goals', icon: Trophy, ar: 'الأهداف', en: 'Goals', fr: 'Buts', hintAr: 'بعد تأكيد الهدف وعدم وجود مراجعة VAR معلّقة', hintEn: 'After a goal is confirmed and no VAR review is pending', hintFr: 'Après confirmation du but et fin de toute vérification VAR', available: true },
  { key: 'red_cards', icon: Flag, ar: 'البطاقات الحمراء', en: 'Red cards', fr: 'Cartons rouges', hintAr: 'عند إشهار بطاقة حمراء', hintEn: 'When a red card is shown', hintFr: 'Lorsqu’un carton rouge est donné', available: true },
  { key: 'half_time', icon: Clock3, ar: 'نهاية الشوط الأول', en: 'Half-time', fr: 'Mi-temps', hintAr: 'عند نهاية الشوط الأول', hintEn: 'At the half-time whistle', hintFr: 'Au coup de sifflet de la mi-temps', available: true },
  { key: 'full_time', icon: CheckCircle2, ar: 'نهاية المباراة', en: 'Full-time', fr: 'Fin du match', hintAr: 'عند نهاية المباراة', hintEn: 'At full time', hintFr: 'Au coup de sifflet final', available: true },
  { key: 'bet_settlement', icon: CreditCard, ar: 'تسوية الرهانات', en: 'Bet settlement', fr: 'Règlement des paris', hintAr: 'قريباً — تنبيهات تسوية القسائم', hintEn: 'Coming soon — bet slip settlement alerts', hintFr: 'Bientôt — alertes de règlement des paris', available: false },
  { key: 'account_activity', icon: ShieldCheck, ar: 'نشاط الحساب', en: 'Account activity', fr: 'Activité du compte', hintAr: 'قريباً — تحديثات الإيداع والسحب وأمان الحساب', hintEn: 'Coming soon — deposit, withdrawal and account-security updates', hintFr: 'Bientôt — dépôts, retraits et sécurité du compte', available: false },
]

export default function NotificationSettings({ language = 'en' }: { language?: string }) {
  const isArabic = language === 'ar'
  const isFrench = language === 'fr'
  const isNative = Capacitor.isNativePlatform()
  const localize = useCallback((ar: string, en: string, fr: string) => isArabic ? ar : isFrench ? fr : en, [isArabic, isFrench])
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

  useEffect(() => {
    if (!supabase || !userId) {
      setPrefs(defaults)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMessage(localize('تعذر تحميل إعدادات الإشعارات.', 'Could not load notification preferences.', 'Impossible de charger les préférences de notification.'))
        else if (data) setPrefs({
          enabled: data.enabled,
          match_start: data.match_start,
          goals: data.goals,
          red_cards: data.red_cards,
          half_time: data.half_time,
          full_time: data.full_time,
          bet_settlement: data.bet_settlement,
          account_activity: data.account_activity,
        })
        else setPrefs(defaults)
        setLoading(false)
      })
    return () => { active = false }
  }, [userId, localize])

  const toggle = useCallback(async (key: PreferenceKey, value: boolean) => {
    if (!supabase || !userId) {
      setMessage(localize('سجّل الدخول أولاً لحفظ إعداداتك.', 'Sign in first to save your preferences.', 'Connectez-vous pour enregistrer vos préférences.'))
      return
    }
    setMessage('')
    if (value && key !== 'enabled' && !isNative) {
      setMessage(localize(
        'يمكنك حفظ تفضيلاتك هنا، لكن استقبال الإشعارات يتطلب تطبيق BETNOVA على Android.',
        'You can save preferences here, but receiving push alerts requires the BETNOVA Android app.',
        'Vous pouvez enregistrer vos préférences ici, mais les notifications nécessitent l’application BETNOVA sur Android.',
      ))
    }
    if (value && isNative) {
      try {
        let permission = await PushNotifications.checkPermissions()
        if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions()
        if (permission.receive !== 'granted') {
          setMessage(localize(
            'لم تسمح بإرسال الإشعارات. يمكنك تفعيلها من إعدادات الهاتف.',
            'Notification permission was not granted. You can enable it in Android settings.',
            'Vous n’avez pas autorisé les notifications. Vous pouvez les activer dans les paramètres Android.',
          ))
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
        setMessage(localize(
          'تعذر تفعيل الإشعارات على هذا الجهاز.',
          'Could not enable notifications on this device.',
          'Impossible d’activer les notifications sur cet appareil.',
        ))
        return
      }
    }
    const next = { ...prefs, [key]: value }
    if (key === 'enabled') {
      next.enabled = value
    } else {
      const otherEnabled = rows.some(row => row.key !== key && next[row.key] && row.available)
      next.enabled = value || otherEnabled
    }
    setSaving(key)
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: userId,
      ...next,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) {
      setMessage(localize('لم يتم حفظ التغيير. حاول مرة أخرى.', 'Could not save this change. Please try again.', 'Impossible d’enregistrer cette modification. Réessayez.'))
    } else {
      setPrefs(next)
    }
    setSaving(null)
  }, [userId, prefs, isNative, localize])

  if (!userId) {
    return <section className="bn-notification-settings">
      <div className="bn-notification-heading"><Bell size={18}/><div><b>{localize('الإشعارات', 'Notifications', 'Notifications')}</b><small>{localize('سجّل الدخول لإدارة تنبيهاتك.', 'Sign in to manage your alerts.', 'Connectez-vous pour gérer vos alertes.')}</small></div></div>
    </section>
  }

  return <section className="bn-notification-settings">
    <div className="bn-notification-heading">
      <Bell size={18}/>
      <div><b>{localize('إعدادات الإشعارات', 'Notification preferences', 'Préférences de notification')}</b><small>{localize('اختر الأحداث التي تريد أن يصلك تنبيه عند حدوثها.', 'Choose which events you want to hear about.', 'Choisissez les événements pour lesquels vous souhaitez recevoir une alerte.')}</small></div>
    </div>
    <div className="bn-notification-master">
      <div><b>{localize('تفعيل الإشعارات', 'Enable notifications', 'Activer les notifications')}</b><small>{localize('إيقافه يعطّل جميع التنبيهات.', 'Turn off to disable all alerts.', 'Désactivez pour couper toutes les alertes.')}</small></div>
      <button type="button" role="switch" aria-checked={prefs.enabled} disabled={loading || saving !== null} className={prefs.enabled ? 'is-on' : ''} onClick={() => void toggle('enabled', !prefs.enabled)}><span/></button>
    </div>
    <div className="bn-notification-list">
      {rows.map(row => {
        const Icon = row.icon
        return <div className="bn-notification-row" key={row.key}>
          <Icon size={17}/>
          <div><b>{localize(row.ar, row.en, row.fr)}</b><small>{localize(row.hintAr, row.hintEn, row.hintFr)}</small></div>
          <button type="button" role="switch" aria-checked={row.available && prefs[row.key]} disabled={loading || saving !== null || !prefs.enabled || !row.available} className={prefs[row.key] && row.available ? 'is-on' : ''} onClick={() => void toggle(row.key, !prefs[row.key])}><span/></button>
        </div>
      })}
    </div>
    {!isNative && <p className="bn-notification-footnote">{localize(
      'ملاحظة: إعدادات الاستقبال الفعلي ستعمل عند استخدام تطبيق BETNOVA على Android.',
      'Note: actual push delivery will be available in the BETNOVA Android app.',
      'Remarque : les notifications push seront disponibles dans l’application BETNOVA sur Android.',
    )}</p>}
    {message && <p className="bn-notification-message" role="status">{message}</p>}
    {loading && <p className="bn-notification-footnote">{localize('جارٍ تحميل الإعدادات…', 'Loading preferences…', 'Chargement des préférences…')}</p>}
  </section>
}
