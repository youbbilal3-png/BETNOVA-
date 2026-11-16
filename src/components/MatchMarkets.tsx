import { useEffect, useMemo, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Clock3, LoaderCircle, Radio, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = {
  fixtureId: string | number
  onSelect: (selection: { selectionId: string; marketId: string; marketLabel: string; selectionLabel: string; odds: string }) => void
  selectedIds: string[]
  live: boolean
}
type Selection = { id: string; name: string; odds: number; status: string; result_status: string }
type Market = { id: string; market_key: string | null; market_type: string; name: string; status: string; is_live: boolean; market_selections: Selection[] }

const categoryFor = (market: Market) => {
  const key = (market.market_key || market.market_type || '').toLowerCase()
  const name = market.name.toLowerCase()
  if (/goal|score|scorer/.test(key + ' ' + name)) return 'Goals'
  if (/corner/.test(key + ' ' + name)) return 'Corners'
  if (/card|booking|foul/.test(key + ' ' + name)) return 'Cards & fouls'
  if (/player|shot|assist/.test(key + ' ' + name)) return 'Player markets'
  if (/half|period|result|winner/.test(key + ' ' + name)) return 'Match result'
  return 'Match markets'
}

export default function MatchMarkets({ fixtureId, onSelect, selectedIds, live }: Props) {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState('Match result')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function loadMarkets() {
    if (!supabase) { setMarkets([]); setLoading(false); return }
    setError('')
    const { data, error: queryError } = await supabase
      .from('markets')
      .select('id,market_key,market_type,name,status,is_live,market_selections(id,name,odds,status,result_status)')
      .eq('fixture_id', fixtureId)
      .eq('is_active', true)
      .in('status', ['open','suspended'])
      .order('name')
    if (queryError) { setError('Could not load this match markets.'); setMarkets([]) }
    else {
      setMarkets(((data ?? []) as Market[]).map(m => ({...m, market_selections: (m.market_selections ?? []).filter(s => s.status === 'active' && s.result_status === 'pending')})))
      setLastUpdated(new Date())
    }
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    void loadMarkets()
    if (!supabase) return
    const channel = supabase.channel('match-markets-' + fixtureId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets', filter: 'fixture_id=eq.' + fixtureId }, () => { void loadMarkets() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_selections' }, () => { void loadMarkets() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [fixtureId])

  const grouped = useMemo(() => {
    const groups = new Map<string, Market[]>()
    for (const market of markets) {
      const category = categoryFor(market)
      groups.set(category, [...(groups.get(category) ?? []), market])
    }
    return Array.from(groups.entries())
  }, [markets])

  if (loading) return <div className="markets-loading"><LoaderCircle size={18}/> Loading match markets…</div>
  if (error) return <div className="markets-empty">{error}<button onClick={() => { setLoading(true); void loadMarkets() }}>Try again</button></div>
  if (!markets.length) return <div className="markets-empty"><Activity size={22}/><b>No verified odds available</b><span>Markets will appear here when active prices are supplied by a trusted data source.</span></div>

  return <div className="match-markets">
    <div className="markets-toolbar"><span>{markets.length} available markets</span><small>{lastUpdated ? 'Updated ' + lastUpdated.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : ''}</small><button onClick={() => { setLoading(true); void loadMarkets() }} aria-label="Refresh markets"><RefreshCw size={13}/></button></div>
    {grouped.map(([category, items]) => <section className="market-group" key={category}>
      <button className="market-group-head" onClick={() => setExpanded(expanded === category ? '' : category)}>
        <span>{category}</span><small>{items.length} markets</small>{expanded === category ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
      </button>
      {expanded === category && <div className="market-group-body">
        {items.map(market => <article className="market-item" key={market.id}>
          <div className="market-item-title"><b>{market.name}</b>{market.is_live && <span className="market-live-tag"><Radio size={10}/> LIVE</span>}{market.status === 'suspended' && <span className="market-suspended">Suspended</span>}</div>
          <div className="market-outcomes">{market.market_selections.map(selection => {
            const picked = selectedIds.includes(selection.id)
            return <button key={selection.id} disabled={market.status !== 'open' || picked} className={picked ? 'market-outcome picked' : 'market-outcome'} onClick={() => onSelect({selectionId:selection.id,marketId:market.id,marketLabel:market.name,selectionLabel:selection.name,odds:String(selection.odds)})}>
              <span>{selection.name}</span><b>{Number(selection.odds).toFixed(2)}</b>
            </button>
          })}</div>
        </article>)}
      </div>}
    </section>)}
    {live && <div className="markets-live-note"><Clock3 size={13}/> Live prices can change. Each bet is validated again at submission.</div>}
  </div>
}
