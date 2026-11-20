import { useEffect, useState } from 'react'
import { Activity, LoaderCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type StatItem = { key: string; label: string; value: string | number | null }
type Snapshot = { home?: StatItem[]; away?: StatItem[]; updated_at?: string }

function numeric(value: unknown): number | null {
  const n = Number(String(value ?? '').replace('%','').replace(',','.'))
  return Number.isFinite(n) ? n : null
}
function format(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

export default function MatchStatistics({ fixtureId }: { fixtureId: string }) {
  const { t } = useLanguage()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = supabase
    if (!client) { setLoading(false); return }
    let active = true
    const load = async () => {
      const { data } = await client.from('fixture_statistics')
        .select('statistics,updated_at').eq('fixture_id', fixtureId)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (!active) return
      if (data?.statistics) setSnapshot({ ...(data.statistics as Snapshot), updated_at: data.updated_at })
      else setSnapshot(null)
      setLoading(false)
    }
    void load()
    const refreshTimer = window.setInterval(() => { void load() }, 30_000)
    const channel = client.channel('fixture-statistics-' + fixtureId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixture_statistics', filter: 'fixture_id=eq.' + fixtureId }, () => { void load() })
      .subscribe()
    return () => { active = false; window.clearInterval(refreshTimer); void client.removeChannel(channel) }
  }, [fixtureId])

  if (loading) return <div className="match-stats-state"><LoaderCircle size={16}/>{t('loading_statistics')}</div>
  if (!snapshot || !(snapshot.home?.length || snapshot.away?.length)) {
    return <div className="match-stats-empty"><Activity size={18}/><span>{t('no_statistics')}</span></div>
  }

  const home = new Map((snapshot.home ?? []).map(item => [item.key, item]))
  const away = new Map((snapshot.away ?? []).map(item => [item.key, item]))
  const keys = Array.from(new Set([...home.keys(), ...away.keys()]))
  return <section className="match-statistics">
    <div className="match-stats-heading"><div><span className="eyebrow dark">{t('match_center')}</span><h3>{t('match_statistics')}</h3></div><small>{snapshot.updated_at ? new Date(snapshot.updated_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</small></div>
    <div className="match-stats-columns"><span>{t('home')}</span><span>{t('away')}</span></div>
    {keys.map(key => {
      const h = home.get(key), a = away.get(key)
      const hv = numeric(h?.value), av = numeric(a?.value)
      const max = Math.max(hv ?? 0, av ?? 0, 1)
      const isPossession = key === 'possession' || key.endsWith('_possession')
      const hp = hv === null || av === null ? 50 : isPossession ? Math.max(0, Math.min(100, hv)) : hv / max * 100
      const ap = hv === null || av === null ? 50 : isPossession ? Math.max(0, Math.min(100, av)) : av / max * 100
      return <div className="match-stat-row" key={key}>
        <div className="match-stat-values"><b>{format(h?.value)}</b><span>{h?.label ?? a?.label ?? key.replace(/_/g,' ')}</span><b>{format(a?.value)}</b></div>
        <div className="match-stat-bars"><span><i style={{width:hp+'%'}}/></span><span><i style={{width:ap+'%'}}/></span></div>
      </div>
    })}
  </section>
}
