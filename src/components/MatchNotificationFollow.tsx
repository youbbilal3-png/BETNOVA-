import { useEffect, useState } from 'react'
import { Bell, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './match-notification-follow.css'

type FollowTarget = 'fixture' | 'home' | 'away'
type Target = { key: FollowTarget; type: 'fixture' | 'team'; id: string; label: string }

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
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<FollowTarget | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    let mounted = true
    void supabase.auth.getUser().then(({ data }) => { if (mounted) setUserId(data.user?.id ?? null) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUserId(session?.user?.id ?? null)
      setActive({ fixture: false, home: false, away: false })
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
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
        .from('notification_subscriptions').select('target_type,target_id').eq('user_id', userId)
        .in('target_id', nextTargets.map(target => target.id))
      if (!mounted) return
      if (error) setMessage(localize('تعذر تحميل اشتراكاتك.', 'Could not load your follows.', 'Impossible de charger vos suivis.'))
      else {
        const rows = subscriptions ?? []
        setActive({
          fixture: rows.some(row => row.target_type === 'fixture' && row.target_id === fixture.id),
          home: rows.some(row => row.target_type === 'team' && row.target_id === fixture.home_team_id),
          away: rows.some(row => row.target_type === 'team' && row.target_id === fixture.away_team_id),
        })
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

  const toggle = async (key: FollowTarget) => {
    if (!supabase || !userId) {
      setMessage(localize('سجّل الدخول أولاً لمتابعة المباريات والفرق.', 'Sign in to follow matches and teams.', 'Connectez-vous pour suivre les matchs et les équipes.'))
      return
    }
    const target = targets.find(item => item.key === key)
    if (!target) return
    setBusy(key)
    setMessage('')
    const currentlyActive = active[key]
    const result = currentlyActive
      ? await supabase.from('notification_subscriptions').delete().eq('user_id', userId).eq('target_type', target.type).eq('target_id', target.id)
      : await supabase.from('notification_subscriptions').upsert({
          user_id: userId, target_type: target.type, target_id: target.id,
        }, { onConflict: 'user_id,target_type,target_id', ignoreDuplicates: true })
    if (result.error) setMessage(localize('لم يتم حفظ التغيير. حاول مرة أخرى.', 'Could not save this change. Please try again.', 'Impossible d’enregistrer cette modification. Réessayez.'))
    else setActive(current => ({ ...current, [key]: !currentlyActive }))
    setBusy(null)
  }

  if (!userId) return <div className="bn-match-follow"><div className="bn-match-follow-title"><Bell size={17}/><b>{localize('تنبيهات المباراة والفريق', 'Match & team alerts', 'Alertes match et équipe')}</b></div><p>{localize('سجّل الدخول لتتمكن من متابعة هذه المباراة أو أي من الفريقين.', 'Sign in to follow this match or either team.', 'Connectez-vous pour suivre ce match ou l’une des deux équipes.')}</p></div>

  return <div className="bn-match-follow">
    <div className="bn-match-follow-title"><Bell size={17}/><div><b>{localize('متابعة وتنبيهات', 'Follow & get alerts', 'Suivre et recevoir des alertes')}</b><small>{localize('اختر المباراة أو الفرق التي تريد متابعتها.', 'Choose this match or teams to follow.', 'Choisissez ce match ou les équipes à suivre.')}</small></div></div>
    <div className="bn-match-follow-options">
      {loading ? <p className="bn-match-follow-state">{localize('جارٍ تحميل خيارات التنبيه…', 'Loading alert options…', 'Chargement des alertes…')}</p> :
        targets.length ? targets.map(target => <div className="bn-match-follow-option" key={target.key}>
          <span>{target.label}</span>
          <button type="button" role="switch" aria-checked={active[target.key]} disabled={busy !== null} className={active[target.key] ? 'is-on' : ''} onClick={() => void toggle(target.key)}><span/></button>
        </div>) :
        <p className="bn-match-follow-state">{message || localize('خيارات التنبيه غير متاحة لهذه المباراة حاليًا.', 'Alert options are not available for this match right now.', 'Les alertes ne sont pas disponibles pour ce match.')}</p>}
    </div>
    <div className="bn-match-follow-safe"><ShieldCheck size={14}/>{localize('يمكنك تغيير اختياراتك في أي وقت.', 'You can change these follows at any time.', 'Vous pouvez modifier vos suivis à tout moment.')}</div>
    {message && <p className="bn-match-follow-message" role="status">{message}</p>}
  </div>
}
