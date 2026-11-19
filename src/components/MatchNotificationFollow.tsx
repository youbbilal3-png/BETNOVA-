import { useEffect, useMemo, useState } from 'react'
import { Bell, CalendarDays, CheckCircle2, Flag, ShieldCheck, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './match-notification-follow.css'

type FollowTarget = 'fixture' | 'home' | 'away'
type Target = { key: FollowTarget; type: 'fixture' | 'team'; id: string; label: string }
type EventKey = 'match_start' | 'goals' | 'red_cards' | 'half_time' | 'full_time'
type EventPrefs = Record<EventKey, boolean>
type SubscriptionRow = { target_type: string; target_id: string } & EventPrefs

const defaults: EventPrefs = { match_start: true, goals: true, red_cards: true, half_time: true, full_time: true }
const eventRows: { key: EventKey; icon: typeof Bell; ar: string; en: string; fr: string; hintAr: string; hintEn: string; hintFr: string }[] = [
  { key: 'match_start', icon: CalendarDays, ar: 'بداية المباراة', en: 'Kick-off', fr: 'Coup d’envoi', hintAr: 'عند انطلاق المباراة', hintEn: 'When the match starts', hintFr: 'Au début du match' },
  { key: 'goals', icon: Trophy, ar: 'الأهداف المؤكدة', en: 'Confirmed goals', fr: 'Buts confirmés', hintAr: 'بعد تأكيد الهدف وانتهاء مراجعة VAR', hintEn: 'Only after the goal is confirmed and VAR review is clear', hintFr: 'Après confirmation du but et fin de la vérification VAR' },
  { key: 'red_cards', icon: Flag, ar: 'البطاقات الحمراء', en: 'Red cards', fr: 'Cartons rouges', hintAr: 'عند إشهار بطاقة حمراء', hintEn: 'When a red card is shown', hintFr: 'Lorsqu’un carton rouge est montré' },
  { key: 'half_time', icon: Bell, ar: 'نهاية الشوط الأول', en: 'Half-time', fr: 'Mi-temps', hintAr: 'عند نهاية الشوط الأول', hintEn: 'At half-time', hintFr: 'À la mi-temps' },
  { key: 'full_time', icon: CheckCircle2, ar: 'نهاية المباراة', en: 'Full-time', fr: 'Fin du match', hintAr: 'عند صافرة النهاية', hintEn: 'At the final whistle', hintFr: 'Au coup de sifflet final' },
]

export default function MatchNotificationFollow({ fixtureId, homeName, awayName, language = 'en' }: {
  fixtureId: string
  homeName: string
  awayName: string
  language?: string
}) {
  const isArabic = language === 'ar'
  const isFrench = language === 'fr'
  const localize = (ar: string, en: string, fr: string) => isArabic ? ar : isFrench ? fr : en
  const [userId, setUserId] = useState<string | null>(null)
  const [targets, setTargets] = useState<Target[]>([])
  const [active, setActive] = useState<Record<FollowTarget, boolean>>({ fixture: false, home: false, away: false })
  const [prefs, setPrefs] = useState<EventPrefs>(defaults)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const activeTargetIds = useMemo(() => targets.filter(target => active[target.key]).map(target => target.id), [targets, active])
  const anyActive = activeTargetIds.length > 0

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let mounted = true
    void supabase.auth.getUser().then(({ data }) => { if (mounted) setUserId(data.user?.id ?? null) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUserId(session?.user?.id ?? null)
      setActive({ fixture: false, home: false, away: false })
      setPrefs(defaults)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !userId) { setLoading(false); return }
    let mounted = true
    setLoading(true)
    void (async () => {
      const { data: fixture, error: fixtureError } = await supabase!
        .from('fixtures').select('id,home_team_id,away_team_id').eq('id', fixtureId).maybeSingle()
      if (!mounted) return
      if (fixtureError || !fixture) {
        setMessage(localize('تعذر تحميل خيارات متابعة المباراة.', 'Could not load match follow options.', 'Impossible de charger les options de suivi du match.'))
        setLoading(false)
        return
      }
      const nextTargets: Target[] = [
        { key: 'fixture', type: 'fixture', id: fixture.id, label: localize('هذه المباراة', 'This match', 'Ce match') },
        { key: 'home', type: 'team', id: fixture.home_team_id, label: homeName },
        { key: 'away', type: 'team', id: fixture.away_team_id, label: awayName },
      ]
      setTargets(nextTargets)
      const { data: subscriptions, error } = await supabase!
        .from('notification_subscriptions').select('target_type,target_id,match_start,goals,red_cards,half_time,full_time')
        .eq('user_id', userId).in('target_id', nextTargets.map(target => target.id))
      if (!mounted) return
      if (error) setMessage(localize('تعذر تحميل اشتراكاتك.', 'Could not load your follows.', 'Impossible de charger vos suivis.'))
      else {
        const rows = (subscriptions ?? []) as SubscriptionRow[]
        setActive({
          fixture: rows.some(row => row.target_type === 'fixture' && row.target_id === fixture.id),
          home: rows.some(row => row.target_type === 'team' && row.target_id === fixture.home_team_id),
          away: rows.some(row => row.target_type === 'team' && row.target_id === fixture.away_team_id),
        })
        const preferred = rows.find(row => row.target_type === 'fixture' && row.target_id === fixture.id) ?? rows[0]
        if (preferred) setPrefs({ match_start: preferred.match_start, goals: preferred.goals, red_cards: preferred.red_cards, half_time: preferred.half_time, full_time: preferred.full_time })
      }
      setLoading(false)
    })().catch(error => {
      if (!mounted) return
      console.error('Could not load BETNOVA match notification options', error)
      setMessage(localize('تعذر تحميل خيارات التنبيه. أعد المحاولة لاحقًا.', 'Could not load alert options. Please try again.', 'Impossible de charger les alertes. Réessayez plus tard.'))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [userId, fixtureId, homeName, awayName, isArabic, isFrench])

  const toggleTarget = async (key: FollowTarget) => {
    if (!supabase || !userId) {
      setMessage(localize('سجّل الدخول أولاً لمتابعة المباريات والفرق.', 'Sign in to follow matches and teams.', 'Connectez-vous pour suivre les matchs et les équipes.'))
      return
    }
    const target = targets.find(item => item.key === key)
    if (!target) return
    setBusy(key); setMessage('')
    const currentlyActive = active[key]
    const result = currentlyActive
      ? await supabase.from('notification_subscriptions').delete().eq('user_id', userId).eq('target_type', target.type).eq('target_id', target.id)
      : await supabase.from('notification_subscriptions').upsert({
          user_id: userId, target_type: target.type, target_id: target.id, ...prefs,
        }, { onConflict: 'user_id,target_type,target_id', ignoreDuplicates: true })
    if (result.error) setMessage(localize('لم يتم حفظ التغيير. حاول مرة أخرى.', 'Could not save this change. Please try again.', 'Impossible d’enregistrer cette modification. Réessayez.'))
    else setActive(current => ({ ...current, [key]: !currentlyActive }))
    setBusy(null)
  }

  const toggleEvent = async (key: EventKey, value: boolean) => {
    if (!supabase || !userId || !activeTargetIds.length) return
    const next = { ...prefs, [key]: value }
    setBusy(key); setMessage('')
    const { error } = await supabase.from('notification_subscriptions')
      .update({ [key]: value })
      .eq('user_id', userId)
      .in('target_id', activeTargetIds)
    if (error) setMessage(localize('لم يتم حفظ التغيير. حاول مرة أخرى.', 'Could not save this change. Please try again.', 'Impossible d’enregistrer cette modification. Réessayez.'))
    else setPrefs(next)
    setBusy(null)
  }

  if (!userId) return <div className="bn-match-follow">
    <div className="bn-match-follow-title"><Bell size={17}/><b>{localize('تنبيهات المباراة والفريق', 'Match & team alerts', 'Alertes match et équipe')}</b></div>
    <p>{localize('سجّل الدخول لتحديد المباريات والأحداث التي تريد التنبيه بها.', 'Sign in to choose which matches and events you want alerts for.', 'Connectez-vous pour choisir les matchs et événements à suivre.')}</p>
  </div>

  return <div className="bn-match-follow">
    <div className="bn-match-follow-title"><Bell size={17}/><div><b>{localize('تنبيهات المباراة', 'Match notifications', 'Notifications du match')}</b><small>{localize('تابع المباراة أو أحد الفريقين، ثم اختر الأحداث التي تريد استقبالها.', 'Follow this match or either team, then choose the events you want to receive.', 'Suivez ce match ou une équipe, puis choisissez les événements à recevoir.')}</small></div></div>
    <div className="bn-match-follow-options">
      {loading ? <p className="bn-match-follow-state">{localize('جارٍ تحميل خيارات التنبيه…', 'Loading alert options…', 'Chargement des alertes…')}</p> :
        targets.map(target => <div className="bn-match-follow-option" key={target.key}>
          <span>{target.label}</span>
          <button type="button" role="switch" aria-checked={active[target.key]} disabled={busy !== null} className={active[target.key] ? 'is-on' : ''} onClick={() => void toggleTarget(target.key)}><span/></button>
        </div>)}
    </div>
    {!loading && anyActive && <div className="bn-match-follow-events">
      <b>{localize('الأحداث التي تريد التنبيه بها', 'Events to notify you about', 'Événements à signaler')}</b>
      {eventRows.map(row => {
        const Icon = row.icon
        return <div className="bn-match-follow-event" key={row.key}>
          <Icon size={16}/>
          <div><b>{localize(row.ar, row.en, row.fr)}</b><small>{localize(row.hintAr, row.hintEn, row.hintFr)}</small></div>
          <button type="button" role="switch" aria-checked={prefs[row.key]} disabled={busy !== null} className={prefs[row.key] ? 'is-on' : ''} onClick={() => void toggleEvent(row.key, !prefs[row.key])}><span/></button>
        </div>
      })}
    </div>}
    <div className="bn-match-follow-safe"><ShieldCheck size={14}/>{localize('يمكنك تغيير اختياراتك في أي وقت. لا يتم إرسال تنبيه الهدف قبل تأكيده.', 'Change your choices at any time. Goal alerts are sent only after confirmation.', 'Modifiez vos choix à tout moment. Les buts sont signalés uniquement après confirmation.')}</div>
    {message && <p className="bn-match-follow-message" role="status">{message}</p>}
  </div>
}
