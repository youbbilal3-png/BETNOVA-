import { useEffect, useMemo, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Clock3, LoaderCircle, Radio, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type Props = {
  fixtureId: string | number
  onSelect: (selection: { selectionId: string; marketId: string; marketLabel: string; selectionLabel: string; odds: string }) => void
  selectedIds: string[]
  live: boolean
}
type Selection = { id: string; name: string; odds: number; status: string; result_status: string }
type Market = { id: string; market_key: string | null; market_type: string; name: string; status: string; is_live: boolean; last_updated_at: string; market_selections: Selection[] }
type LiveEvent = { id: string; event_type: string; period: string | null; minute: number | null; added_time: number | null; player_name: string | null; team: { name: string; short_name: string | null } | null }

const categoryFor = (market: Market, t: (key: any) => string) => {
  const key = (market.market_key || market.market_type || '').toLowerCase()
  const name = market.name.toLowerCase()
  if (/goal|score|scorer/.test(key + ' ' + name)) return t('goals')
  if (/corner/.test(key + ' ' + name)) return t('corners')
  if (/card|booking|foul/.test(key + ' ' + name)) return t('cards_fouls')
  if (/player|shot|assist/.test(key + ' ' + name)) return t('player_markets')
  if (/half|period|result|winner/.test(key + ' ' + name)) return t('match_result')
  return t('match_markets')
}

export default function MatchMarkets({ fixtureId, onSelect, selectedIds, live }: Props) {
  const { t } = useLanguage()
  const [markets, setMarkets] = useState<Market[]>([])
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState('Match result')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [clock, setClock] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  async function loadMarkets() {
    if (!supabase) { setMarkets([]); setLoading(false); return }
    setError('')
    const { data, error: queryError } = await supabase
      .from('markets')
      .select('id,market_key,market_type,name,status,is_live,last_updated_at,market_selections(id,name,odds,status,result_status)')
      .eq('fixture_id', fixtureId)
      .eq('is_active', true)
      .in('status', ['open','suspended'])
      .order('name')
    if (queryError) { setError(t('could_not_load_markets')); setMarkets([]) }
    else {
      setMarkets(((data ?? []) as Market[]).map(m => ({...m, market_selections: (m.market_selections ?? []).filter(s => s.status === 'active' && s.result_status === 'pending')})))
      setLastUpdated(new Date())
    }
    setLoading(false)
  }

  async function loadEvents() {
    if (!supabase) return
    const { data } = await supabase.from('fixture_events')
      .select('id,event_type,period,minute,added_time,player_name,team:teams!fixture_events_team_id_fkey(name,short_name)')
      .eq('fixture_id', fixtureId).order('occurred_at', { ascending: false }).limit(10)
    setEvents((data ?? []) as unknown as LiveEvent[])
  }

  useEffect(() => {
    setLoading(true)
    void loadMarkets()
    void loadEvents()
    if (!supabase) return
    const client = supabase
    const channel = client.channel('match-markets-' + fixtureId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets', filter: 'fixture_id=eq.' + fixtureId }, () => { void loadMarkets() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_selections' }, () => { void loadMarkets() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixture_events', filter: 'fixture_id=eq.' + fixtureId }, () => { void loadEvents() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [fixtureId])

  const grouped = useMemo(() => {
    const groups = new Map<string, Market[]>()
    for (const market of markets) {
      const category = categoryFor(market, t)
      groups.set(category, [...(groups.get(category) ?? []), market])
    }
    return Array.from(groups.entries())
  }, [markets, t])

  if (loading) return <div className="markets-loading"><LoaderCircle size={18}/> {t('loading_markets')}</div>
  if (error) return <div className="markets-empty">{error}<button onClick={() => { setLoading(true); void loadMarkets() }}>{t('try_again')}</button></div>
  if (!markets.length) return <div className="markets-empty"><Activity size={22}/><b>{t('no_verified_odds')}</b><span>{t('markets_will_appear')}</span></div>

  return <div className="match-markets">
    {live && events.length > 0 && <section className="match-event-feed"><div className="match-event-feed-head"><span><Radio size={12}/> {t('live_match_events')}</span><small>{events.length} {t('recent_updates')}</small></div>{events.map(event=><div className="match-event-row" key={event.id}><b>{event.minute !== null ? event.minute + (event.added_time ? '+' + event.added_time : '') + "'" : '•'}</b><span className={'event-dot '+event.event_type}>{event.event_type==='goal'?'⚽':event.event_type==='yellow_card'?'🟨':event.event_type==='red_card'?'🟥':event.event_type==='corner'?'◉':event.event_type==='substitution'?'↔':'•'}</span><span>{event.player_name || t(event.event_type === 'goal' ? 'goal_event' : event.event_type === 'yellow_card' ? 'yellow_card_event' : event.event_type === 'red_card' ? 'red_card_event' : event.event_type === 'corner' ? 'corner_event' : event.event_type === 'substitution' ? 'substitution_event' : 'other_event')}{event.team?.name ? ' · '+event.team.name : ''}</span></div>)}</section>}
    <div className="markets-toolbar"><span>{markets.length} {t('available_markets')}</span><small>{lastUpdated ? t('updated') + ' ' + lastUpdated.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : ''}</small><button onClick={() => { setLoading(true); void loadMarkets() }} aria-label={t('refresh_markets')}><RefreshCw size={13}/></button></div>
    {grouped.map(([category, items]) => <section className="market-group" key={category}>
      <button className="market-group-head" onClick={() => setExpanded(expanded === category ? '' : category)}>
        <span>{category}</span><small>{items.length} {t('markets_count')}</small>{expanded === category ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
      </button>
      {expanded === category && <div className="market-group-body">
        {items.map(market => {
          const updatedMs = new Date(market.last_updated_at).getTime()
          const maxAgeMs = market.is_live ? 3 * 60 * 1000 : 24 * 60 * 60 * 1000
          const priceFresh = Number.isFinite(updatedMs) && clock - updatedMs <= maxAgeMs && updatedMs <= clock + 30000
          const canBet = market.status === "open" && priceFresh
          return <article className="market-item" key={market.id}>
          <div className="market-item-title"><b>{market.name}</b>{market.is_live && <span className="market-live-tag"><Radio size={10}/> LIVE</span>}{market.status === 'suspended' && <span className="market-suspended">{t('suspended')}</span>}{market.status === 'open' && !priceFresh && <span className="market-suspended">Price expired</span>}</div>
          <div className="market-outcomes">{market.market_selections.map(selection => {
            const picked = selectedIds.includes(selection.id)
            return <button key={selection.id} disabled={!canBet || picked} className={picked ? 'market-outcome picked' : 'market-outcome'} onClick={() => onSelect({selectionId:selection.id,marketId:market.id,marketLabel:market.name,selectionLabel:selection.name,odds:String(selection.odds)})}>
              <span>{selection.name}</span><b>{Number(selection.odds).toFixed(2)}</b>
            </button>
          })}</div>
        </article>})}
      </div>}
    </section>)}
    {live && <div className="markets-live-note"><Clock3 size={13}/> {t('live_prices_warning')}</div>}
  </div>
}
