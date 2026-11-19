import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Clock3, LoaderCircle, Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n'

type Props = {
  fixtureId: string | number
  onSelect: (selection: { selectionId: string; marketId: string; marketKey: string; marketLabel: string; selectionLabel: string; odds: string }) => void
  selectedIds: string[]
  live: boolean
  deferLoad?: boolean
}
type Selection = { id: string; name: string; odds: number; status: string; result_status: string }
type Market = { id: string; market_key: string | null; market_type: string; name: string; status: string; is_live: boolean; last_updated_at: string; settlement_rule: Record<string, unknown> | null; market_selections: Selection[] }
type LiveEvent = { id: string; event_type: string; period: string | null; minute: number | null; added_time: number | null; player_name: string | null; team: { name: string; short_name: string | null } | null }

const cleanMarketName = (raw: string) => String(raw ?? '')
  .replace(/\b(oddspapi|oddsapi|apifootball|5dollarfootballapi|pinnacle|bet\s?365|1xbet|unibet|leovegas|pmu|winamax|marathon\s?bet|nordic\s?bet|bwin|betfair|william\s?hill|betway|888sport|stake|betano|parimatch|dafabet|10bet|sportingbet)\b/gi, '')
  .replace(/\s*[·|–—-]\s*/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim()
  .replace(/^[:.\s]+|[:.\s]+$/g, '') || 'Market';
const marketIdentity = (market: Market) => {
  const key = String(market.market_key || market.market_type || '').toLowerCase();
  if (key === 'match_result') return key + '|full-time';
  if (['both_teams_score','btts','double_chance','first_team_to_score'].includes(key)) return key;
  if (['total_goals','total_corners','total_cards','total_shots','shots_on_target','asian_handicap','handicap'].includes(key)) {
    const ruleLine = market.settlement_rule?.line;
    const match = market.name.match(/(\d+(?:\.\d+)?)(?!.*\d)/);
    const line = Number(ruleLine ?? match?.[1]);
    if (Number.isFinite(line)) return key + '|' + line.toFixed(2);
  }
  return key + '|' + cleanMarketName(market.name).toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, ' ').trim();
};

const categoryFor = (market: Market, t: (key: any) => string, language: string) => {
  const key = (market.market_key || market.market_type || '').toLowerCase()
  const name = market.name.toLowerCase()
  const value = key + ' ' + name
  const labels: Record<string, Record<string, string>> = {
    btts: {en:'Both Teams To Score',ar:'كلا الفريقين يسجلان',fr:'Les deux équipes marquent',es:'Ambos equipos marcan',pt:'Ambas as equipas marcam',de:'Beide Teams treffen',it:'Entrambe le squadre segnano',tr:'İki takım da gol atar',nl:'Beide teams scoren',ru:'Обе команды забьют',zh:'双方均进球',ja:'両チーム得点',ko:'양 팀 득점',id:'Kedua tim mencetak gol',hi:'दोनों टीमें स्कोर करेंगी',ur:'دونوں ٹیمیں گول کریں'},
    double: {en:'Double Chance',ar:'الفرصة المزدوجة',fr:'Double chance',es:'Doble oportunidad',pt:'Dupla hipótese',de:'Doppelte Chance',it:'Doppia chance',tr:'Çifte şans',nl:'Dubbele kans',ru:'Двойной шанс',zh:'双重机会',ja:'ダブルチャンス',ko:'더블 찬스',id:'Peluang ganda',hi:'डबल चांस',ur:'ڈبل چانس'},
    events: {en:'Match Events',ar:'أحداث المباراة',fr:'Événements du match',es:'Eventos del partido',pt:'Eventos da partida',de:'Spielereignisse',it:'Eventi della partita',tr:'Maç olayları',nl:'Wedstrijdgebeurtenissen',ru:'События матча',zh:'比赛事件',ja:'試合イベント',ko:'경기 이벤트',id:'Peristiwa pertandingan',hi:'मैच की घटनाएँ',ur:'میچ کے واقعات'}
  }
  const label = (group: keyof typeof labels) => labels[group][language] || labels[group].en
  if (/both.?teams?.?to?.?score|btts/.test(value)) return label('btts')
  if (/double.?chance|double_chance/.test(value)) return label('double')
  if (/corner/.test(value)) return t('corners')
  if (/yellow.?card|red.?card|card|booking/.test(value)) return t('cards_fouls')
  if (/shot|player|assist/.test(value)) return t('player_markets')
  if (/offside|foul|penalt|var|substitution/.test(value)) return label('events')
  if (/goal|scorer|total_score|over.?under/.test(value)) return t('goals')
  if (/half|period|result|winner|handicap|match.?outcome/.test(value)) return t('match_result')
  return t('match_markets')
}

export default function MatchMarkets({ fixtureId, onSelect, selectedIds, live, deferLoad = false }: Props) {
  const { t, language } = useLanguage()
  const [markets, setMarkets] = useState<Market[]>([])
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [loading, setLoading] = useState(!deferLoad)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)


  const outcomeWords: Record<string, string[]> = {
    en:['Win 1','Draw','Win 2','Over','Under','Yes','No'],
    ar:['فوز 1','تعادل','فوز 2','أكثر من','أقل من','نعم','لا'],
    fr:['Victoire 1','Nul','Victoire 2','Plus de','Moins de','Oui','Non'],
    es:['Gana 1','Empate','Gana 2','Más de','Menos de','Sí','No'],
    pt:['Vitória 1','Empate','Vitória 2','Mais de','Menos de','Sim','Não'],
    de:['Sieg 1','Unentschieden','Sieg 2','Über','Unter','Ja','Nein'],
    it:['Vittoria 1','Pareggio','Vittoria 2','Over','Under','Sì','No'],
    tr:['1 Kazanır','Beraberlik','2 Kazanır','Üst','Alt','Evet','Hayır'],
    nl:['Winst 1','Gelijkspel','Winst 2','Meer dan','Minder dan','Ja','Nee'],
    ru:['Победа 1','Ничья','Победа 2','Больше','Меньше','Да','Нет'],
    zh:['主队胜','平局','客队胜','大于','小于','是','否'],
    ja:['ホーム勝利','引き分け','アウェイ勝利','オーバー','アンダー','はい','いいえ'],
    ko:['홈 승','무승부','원정 승','오버','언더','예','아니요'],
    id:['Menang 1','Seri','Menang 2','Lebih dari','Kurang dari','Ya','Tidak'],
    hi:['जीत 1','ड्रॉ','जीत 2','से अधिक','से कम','हाँ','नहीं'],
    ur:['جیت 1','برابری','جیت 2','سے زیادہ','سے کم','ہاں','نہیں']
  }
  const ow = outcomeWords[language] || outcomeWords.en
  const displaySelection = (raw: string) => {
    const value = raw.trim()
    const normalized = value.toLowerCase()
    if (normalized === 'home' || normalized === '1' || normalized === 'win 1') return ow[0]
    if (normalized === 'draw' || normalized === 'x') return ow[1]
    if (normalized === 'away' || normalized === '2' || normalized === 'win 2') return ow[2]
    const total = value.match(/^(over|under)\s*(.*)$/i)
    if (total) return (total[1].toLowerCase() === 'over' ? ow[3] : ow[4]) + ' ' + total[2]
    if (normalized === 'yes') return ow[5]
    if (normalized === 'no') return ow[6]
    return value
  }

  async function loadMarkets() {
    if (!supabase) { setMarkets([]); setLoading(false); return }
    setError('')
    const { data, error: queryError } = await supabase
      .from('markets')
      .select('id,market_key,market_type,name,status,is_live,last_updated_at,settlement_rule,market_selections(id,name,odds,status,result_status)')
      .eq('fixture_id', fixtureId)
      .eq('is_active', true)
      .in('status', ['open','suspended'])
      .order('name')
    if (queryError) { setError(t('could_not_load_markets')); setMarkets([]) }
    else {
      const cleaned = ((data ?? []) as Market[]).map(m => {
        const marketSelections = (m.market_selections ?? []).filter(s => s.status === 'active' && s.result_status === 'pending' && Number.isFinite(Number(s.odds)) && Number(s.odds) > 1)
        if (m.market_key === 'match_result' || m.market_type === 'match_result') {
          const rank = (name: string) => {
            const value = name.trim().toLowerCase()
            return ['home','1','win 1'].includes(value) ? 0 : ['draw','x'].includes(value) ? 1 : ['away','2','win 2'].includes(value) ? 2 : 3
          }
          marketSelections.sort((left,right)=>rank(left.name)-rank(right.name))
        } else if (m.market_key === 'double_chance' || m.market_type === 'double_chance') {
          const rank = (name: string) => {
            const value = name.trim().toLowerCase().replace(/\\s+/g, '')
            return value === '1x' ? 0 : value === '12' ? 1 : value === 'x2' ? 2 : 3
          }
          marketSelections.sort((left,right)=>rank(left.name)-rank(right.name))
        }
        return {...m, name: cleanMarketName(m.name), market_selections: marketSelections}
      });
      const unique = new Map<string, Market>();
      for (const market of cleaned) {
        if (!market.market_selections.length) continue;
        const key = marketIdentity(market);
        const previous = unique.get(key);
        if (!previous || Date.parse(market.last_updated_at) > Date.parse(previous.last_updated_at)) unique.set(key, market);
      }
      setMarkets(Array.from(unique.values()))
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
    if (!deferLoad) {
      setLoading(true)
      void loadMarkets().then(() => setHasLoaded(true))
      void loadEvents()
      return
    }
    const node = containerRef.current
    if (!node || hasLoaded || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      setLoading(true)
      void loadMarkets().then(() => setHasLoaded(true))
    }, { rootMargin: '140px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [fixtureId, deferLoad, hasLoaded])

  useEffect(() => {
    if (!supabase || !hasLoaded) return
    const client = supabase
    const channel = client.channel('match-markets-' + fixtureId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets', filter: 'fixture_id=eq.' + fixtureId }, () => { void loadMarkets() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_selections' }, () => { void loadMarkets() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixture_events', filter: 'fixture_id=eq.' + fixtureId }, () => { void loadEvents() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [fixtureId, hasLoaded])

  const grouped = useMemo(() => {
    const groups = new Map<string, Market[]>()
    for (const market of markets) {
      const category = categoryFor(market, t, language)
      groups.set(category, [...(groups.get(category) ?? []), market])
    }
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }))
      .sort((a, b) => {
        const rank = (label: string) => /goal|both teams/i.test(label) ? 0 : /match|result/i.test(label) ? 1 : /corner/i.test(label) ? 2 : /card/i.test(label) ? 3 : /shot|player/i.test(label) ? 4 : 5
        return rank(a.category) - rank(b.category)
      })
  }, [markets, t, language])

  const defaultCategories = [t('goals'), t('match_result'), t('corners'), t('cards_fouls'), t('player_markets'), t('match_markets')]
  const categoryNames = grouped.map(group => group.category)
  async function toggleCategory(category: string) {
    const opening = expanded !== category
    setExpanded(opening ? category : '')
    if (opening && !hasLoaded) {
      setLoading(true)
      await loadMarkets()
      setHasLoaded(true)
    }
    if (opening && live && events.length === 0) void loadEvents()
  }

  if (error && !hasLoaded) return <div className="markets-empty">{error}<button onClick={() => { setLoading(true); void loadMarkets().then(() => setHasLoaded(true)) }}>{t('try_again')}</button></div>

  return <div ref={containerRef} className="match-markets match-markets-card">
    {live && events.length > 0 && <section className="match-event-feed"><div className="match-event-feed-head"><span><Radio size={12}/> {t('live_match_events')}</span><small>{events.length} {t('recent_updates')}</small></div>{events.map(event=><div className="match-event-row" key={event.id}><b>{event.minute !== null ? event.minute + (event.added_time ? '+' + event.added_time : '') + "'" : '•'}</b><span className={'event-dot '+event.event_type}>{event.event_type==='goal'?'⚽':event.event_type==='yellow_card'?'🟨':event.event_type==='red_card'?'🟥':event.event_type==='corner'?'◉':event.event_type==='substitution'?'↔':'•'}</span><span>{event.player_name || t(event.event_type === 'goal' ? 'goal_event' : event.event_type === 'yellow_card' ? 'yellow_card_event' : event.event_type === 'red_card' ? 'red_card_event' : event.event_type === 'corner' ? 'corner_event' : event.event_type === 'substitution' ? 'substitution_event' : 'other_event')}{event.team?.name ? ' · '+event.team.name : ''}</span></div>)}</section>}
    {hasLoaded && markets.length > 0 && <div className="match-card-market-heading"><span>{language === 'ar' ? 'أسواق المباراة' : 'Match markets'}</span><small>{markets.length + ' ' + t('available_markets')}</small></div>}
    {categoryNames.map(category => {
      const isOpen = expanded === category
      const items = grouped.find(group => group.category === category)?.items ?? []
      return <section className={'match-card-market-accordion' + (isOpen ? ' open' : '')} key={category}>
        <button type="button" className="match-card-market-trigger" aria-expanded={isOpen} onClick={() => void toggleCategory(category)}>
          <span>{category}</span><small>{hasLoaded ? items.length + ' ' + t('markets_count') : ''}</small><ChevronDown size={16}/>
        </button>
        {isOpen && <div className="match-card-market-panel">
          {loading ? <div className="match-card-market-empty"><LoaderCircle size={14}/> {t('loading_markets')}</div> : items.length === 0 ? <div className="match-card-market-empty">{language === 'ar' ? 'لا توجد أسعار متاحة لهذا السوق حاليًا' : 'No odds currently supplied for this market'}</div> : items.map(market => {
            const updatedMs = new Date(market.last_updated_at).getTime()
            const maxAgeMs = market.is_live ? 7 * 60 * 1000 : 24 * 60 * 60 * 1000
            const priceFresh = Number.isFinite(updatedMs) && Date.now() - updatedMs <= maxAgeMs && updatedMs <= Date.now() + 30000
            const canBet = market.status === 'open' && priceFresh && (live ? market.is_live : !market.is_live)
            return <article className="market-item" data-market-key={(market.market_key || market.market_type || '').toLowerCase()} key={market.id}>
              <div className="market-item-title"><b>{market.name}</b>{market.is_live && <span className="market-live-tag"><Radio size={10}/> {t('live')}</span>}{market.status === 'suspended' && <span className="market-suspended">{t('suspended')}</span>}{market.status === 'open' && !priceFresh && <span className="market-suspended">{t('price_expired')}</span>}</div>
              <div className="market-outcomes">{market.market_selections.map(selection => {
                const picked = selectedIds.includes(selection.id)
                return <button key={selection.id} type="button" disabled={!canBet && !picked} aria-pressed={picked} className={picked ? 'market-outcome picked' : 'market-outcome'} onClick={() => onSelect({selectionId:selection.id,marketId:market.id,marketKey:market.market_key || market.market_type,marketLabel:cleanMarketName(market.name),selectionLabel:displaySelection(selection.name),odds:String(selection.odds)})}>
                  <span>{displaySelection(selection.name)}</span><b>{Number(selection.odds).toFixed(2)}</b>
                </button>
              })}</div>
            </article>
          })}
        </div>}
      </section>
    })}
    {hasLoaded && markets.length === 0 && <div className="match-card-market-empty">{language === 'ar' ? 'لا توجد أسعار متاحة لهذه المباراة حاليًا' : 'No markets available for this match right now'}</div>}
    {live && <div className="markets-live-note"><Clock3 size={13}/> {t('live_prices_warning')}</div>}
  </div>
}
