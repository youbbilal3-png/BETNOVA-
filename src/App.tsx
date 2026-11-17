import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownUp, ArrowRight, Bell, CircleHelp, Clock3, Flame, Globe2, Menu, Search, ShieldCheck, Sparkles, Star, Trophy, Wallet, X } from 'lucide-react'
import AuthPanel from './components/AuthPanel'
import AdminOverview from './components/AdminOverview'
import WalletPanel from './components/WalletPanel'
import MatchMarkets from './components/MatchMarkets'
import MyBetsPanel from './components/MyBetsPanel'
import { languages, useLanguage } from './i18n'
import { supabase } from './lib/supabase'

type Match = {
  id: string | number
  league: string
  country: string
  time: string
  home: string
  away: string
  homeMark: string
  awayMark: string
  odds: string[]
  featured?: boolean
  status?: string
  score?: string
  kickoff?: string
  dateLabel?: string
}

const sports = ['Football', 'Basketball', 'Tennis', 'Ice Hockey', 'Volleyball']
const leagues = ['All matches', 'Popular', 'England', 'Spain', 'Italy', 'Germany']

export default function App() {
  const { language, setLanguage, t } = useLanguage()
  const [sport, setSport] = useState('Football')
  const [eventView, setEventView] = useState<'upcoming' | 'live' | 'results'>('upcoming')
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [showFavorites, setShowFavorites] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const usingDemoData = false
  const [league, setLeague] = useState('All matches')
  const [selected, setSelected] = useState<{ match: Match; label: string; odd: string; selectionId: string; marketId: string }[]>([])
  const [betStake, setBetStake] = useState('')
  const [betCurrency, setBetCurrency] = useState('DZD')
  const [betBusy, setBetBusy] = useState(false)
  const [betMessage, setBetMessage] = useState('')
  const [mobileSlip, setMobileSlip] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [matchLoadError, setMatchLoadError] = useState<string | null>(null)
  const [detailMatch, setDetailMatch] = useState<Match | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [betsOpen, setBetsOpen] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user.email ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true

    async function loadFixtures() {
      setLoadingMatches(true)
      setMatchLoadError(null)

      if (!supabase) {
        if (active) {
          setMatches([])
          setLoadingMatches(false)
        }
        return
      }

      try {
        const sportSlug = sport.toLowerCase().replace(/\s+/g, '-')
        const { data: sportRow, error: sportError } = await supabase
          .from('sports')
          .select('id')
          .eq('slug', sportSlug)
          .eq('is_active', true)
          .maybeSingle()

        if (sportError) throw sportError
        if (!sportRow) {
          if (active) {
            setMatches([])
          }
          return
        }

        let fixtureQuery = supabase
          .from('fixtures')
          .select(`
            id, starts_at, status, home_score, away_score,
            competitions!inner(name, country, sport_id),
            home_team:teams!fixtures_home_team_id_fkey(name, short_name),
            away_team:teams!fixtures_away_team_id_fkey(name, short_name),
            markets(market_type, status, market_selections(name, odds, status))
          `)
          .eq('competitions.sport_id', sportRow.id)
        if (eventView === 'live') {
          // Never label an old fixture as live when the upstream feed has gone stale.
          fixtureQuery = fixtureQuery
            .eq('status', 'live')
            .gte('starts_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        } else if (eventView === 'results') {
          fixtureQuery = fixtureQuery.eq('status', 'finished')
        } else {
          fixtureQuery = fixtureQuery.eq('status', 'scheduled').gte('starts_at', new Date().toISOString())
        }
        const { data, error } = await fixtureQuery
          .order('starts_at', { ascending: eventView !== 'results' })
          .limit(30)

        if (error) throw error
        if (!active) return

        const mapped: Match[] = (data ?? []).map((row: any) => {
          const competition = Array.isArray(row.competitions) ? row.competitions[0] : row.competitions
          const home = Array.isArray(row.home_team) ? row.home_team[0] : row.home_team
          const away = Array.isArray(row.away_team) ? row.away_team[0] : row.away_team
          const allSelections = (row.markets ?? [])
            .filter((market: any) => market.status === 'open')
            .flatMap((market: any) => market.market_selections ?? [])
            .filter((selection: any) => selection.status === 'active')
          const findOdd = (names: string[]) => {
            const selection = allSelections.find((item: any) =>
              names.includes(String(item.name).trim().toLowerCase())
            )
            return selection ? String(selection.odds) : '—'
          }
          const startsAt = new Date(row.starts_at)
          return {
            id: row.id,
            league: competition?.name ?? 'Competition',
            country: competition?.country ?? '',
            time: startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            kickoff: startsAt.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }),
            dateLabel: startsAt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
            home: home?.name ?? 'Home team',
            away: away?.name ?? 'Away team',
            homeMark: home?.short_name ?? String(home?.name ?? 'H').slice(0, 2).toUpperCase(),
            awayMark: away?.short_name ?? String(away?.name ?? 'A').slice(0, 2).toUpperCase(),
            odds: [findOdd(['home', '1']), findOdd(['draw', 'x']), findOdd(['away', '2'])],
            status: row.status,
            score: row.home_score !== null && row.away_score !== null ? `${row.home_score} – ${row.away_score}` : undefined,
          }
        })

        if (mapped.length) {
          setMatches(mapped)
        } else {
          setMatches([])
        }
      } catch (caught) {
        if (active) {
          setMatches([])
          setMatchLoadError(caught instanceof Error ? caught.message : 'Could not load sports data.')
        }
      } finally {
        if (active) setLoadingMatches(false)
      }
    }

    void loadFixtures()
    const client = supabase
    const channel = client?.channel('betnova-fixture-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, () => { void loadFixtures() })
      .subscribe()
    return () => { active = false; if (client && channel) void client.removeChannel(channel) }
  }, [sport, userEmail, eventView])

  const visibleMatches = useMemo(() => matches.filter(m =>
    (!showFavorites || favoriteIds.includes(String(m.id))) &&
    (league === 'All matches' || league === 'Popular' || m.country === league) &&
    (m.home + ' ' + m.away + ' ' + m.league).toLowerCase().includes(query.toLowerCase())
  ), [matches, league, query, showFavorites, favoriteIds])

  function toggleFavorite(matchId: string | number) {
    const id = String(matchId)
    setFavoriteIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function openEventView(view: 'upcoming' | 'live' | 'results') {
    setShowFavorites(false)
    setEventView(view)
    document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })
  }

  function addMarketSelection(selection: { selectionId: string; marketId: string; marketLabel: string; selectionLabel: string; odds: string }) {
    if (!detailMatch) return
    if (selected.length >= 20 && !selected.some(item => item.selectionId === selection.selectionId)) {
      setBetMessage('A bet slip can contain up to 20 selections.')
      return
    }
    setSelected(current => current.some(item => item.selectionId === selection.selectionId)
      ? current.filter(item => item.selectionId !== selection.selectionId)
      : [...current.filter(item => item.marketId !== selection.marketId), { match: detailMatch, label: selection.marketLabel + ' · ' + selection.selectionLabel, odd: selection.odds, selectionId: selection.selectionId, marketId: selection.marketId }])
    setBetMessage('')
  }

  async function placeBet() {
    if (!supabase || !userEmail) { setBetMessage('Sign in before placing a bet.'); return }
    if (usingDemoData || selected.length === 0 || selected.some(item => !item.selectionId)) {
      setBetMessage('Choose verified market selections from a real fixture first.')
      return
    }
    const stake = Number(betStake)
    if (!Number.isFinite(stake) || stake <= 0) { setBetMessage('Enter a valid stake in DZD.'); return }
    setBetBusy(true); setBetMessage('')
    try {
      const { data, error } = await supabase.rpc('betnova_place_bet', {
        p_selections: selected.map(item => ({ selection_id: item.selectionId })),
        p_stake: stake,
        p_currency: betCurrency,
        p_idempotency_key: crypto.randomUUID()
      })
      if (error) throw error
      setBetMessage('Bet submitted successfully. Reference: ' + String(data).slice(0, 8))
      setSelected([])
      setBetStake('')
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Bet could not be placed.'
      setBetMessage(/outstanding wallet recovery/i.test(message) ? t('recovery_blocks_withdrawal') : message)
    } finally { setBetBusy(false) }
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-symbol"><Activity size={22} strokeWidth={2.8}/></span><span>BET<span className="brand-accent">NOVA</span><small>{t("brand_tagline")}</small></span></a>
        <nav className="desktop-nav"><a className="active" href="#events">{t('sports')}</a><button onClick={() => openEventView('live')}>{t('live')}</button><a href="#responsible">{t("responsible")}</a><button onClick={() => openEventView('results')}>{t('results')}</button></nav>
        <div className="top-actions"><label className="language-picker" aria-label={t("language")}><Globe2 size={14}/><select value={language} onChange={event=>setLanguage(event.target.value as typeof language)}>{languages.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label><button className="icon-btn" aria-label="Focus event search" onClick={() => { document.getElementById('match-search')?.focus(); document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' }) }}><Search size={18}/></button><button className="icon-btn" aria-label={t("notifications")} onClick={() => setNotificationsOpen(true)}><Bell size={18}/></button>{userEmail ? <><span className="signed-in-label">Signed in</span><button className="wallet-open-btn" onClick={() => setWalletOpen(true)}><Wallet size={15}/> {t("wallet")}</button><button className="my-bets-open-btn" onClick={() => setBetsOpen(true)}>{t("my_bets")}</button><button className="admin-open-btn" onClick={() => setAdminOpen(true)}>Admin</button></> : <button className="login-btn" onClick={() => { setAuthMode('login'); setAuthOpen(true) }}>{t('login')}</button>}<button className="join-btn" onClick={() => userEmail ? void supabase?.auth.signOut() : (setAuthMode('signup'), setAuthOpen(true))}>{userEmail ? t('signout') : t('join')} <ArrowRight size={16}/></button><button className="menu-btn" aria-label={t("menu")} onClick={() => setMobileMoreOpen(true)}><Menu/></button></div>
      </header>

      <div className="ticker"><span className="live-dot"/><strong>{t("sports_center")}</strong><span className="ticker-divider"/><span>{t('ticker_explore')}</span><span className="ticker-right"><ShieldCheck size={14}/> {t("secure_experience")} <span>·</span> {matches.length > 0 ? t("sports_data_connected") : "Verified feed not connected"}</span></div>

      <main className="layout">
        <aside className="left-rail">
          <div className="rail-heading">{t("discover")} <span>•••</span></div>
          <button className="rail-item selected" onClick={() => openEventView('upcoming')}><Trophy size={18}/> {t("sports")} <span className="rail-count">24</span></button>
          <button className="rail-item" onClick={() => openEventView('live')}><Flame size={18}/> {t("live_events")} <span className="live-count">LIVE</span></button>
          <button className={showFavorites ? 'rail-item selected' : 'rail-item'} onClick={() => { setShowFavorites(!showFavorites); setEventView('upcoming') }}><Star size={18}/> Favourites <span className="rail-count">{favoriteIds.length}</span></button>
          <div className="rail-separator"/>
          <div className="rail-heading">{t("sports_heading")}</div>
          {sports.map((s, i) => <button key={s} onClick={() => setSport(s)} className={sport === s ? 'sport-item chosen' : 'sport-item'}><span className="sport-emoji">{['⚽','🏀','🎾','🏒','🏐'][i]}</span>{s}<span className="sport-chevron">›</span></button>)}
          <div className="rail-promo"><div className="promo-orb"><Sparkles size={20}/></div><b>{t("new_way")}</b><p>{t("sports_reimagined")}</p><span>{t("discover_betnova")} <ArrowRight size={13}/></span></div>
        </aside>

        <section className="main-content">
          <section className="hero">
            <div className="hero-copy"><div className="eyebrow"><span/> {t("game_starts")}</div><h1>{t("feel_every")}<br/><em>{t("moment")}</em></h1><p>{t("hero_subtitle")}</p><div className="hero-actions"><button onClick={() => document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })}>{t("explore_events_btn")} <ArrowRight size={16}/></button><span><ShieldCheck size={15}/> {t("safer_experience")}</span></div></div>
            <div className="hero-art"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="hero-ball">⚽</div><div className="art-tag tag-top"><span className="live-dot"/> MATCH DAY</div><div className="art-tag tag-bottom"><Trophy size={14}/> BIG MOMENTS AHEAD</div><div className="art-spark">✦</div></div>
            <div className="hero-index">01 <span>/</span> 04</div>
          </section>

          <div className="quick-stats"><div><span className="stat-icon"><Activity size={17}/></span><span><b>{t("live_energy")}</b><small>{t("follow_action")}</small></span></div><div><span className="stat-icon teal"><Globe2 size={17}/></span><span><b>{t("global_sports")}</b><small>{t("every_corner")}</small></span></div><div><span className="stat-icon lime"><ShieldCheck size={17}/></span><span><b>{t("player_first")}</b><small>{t("safety_design")}</small></span></div></div>

          <section className="events-section" id="events">
            <div className="section-heading"><div><div className="eyebrow dark"><span/> {t("today_lineup")}</div><h2>{showFavorites ? t('your_favourites') : eventView === 'live' ? t('live_events') : eventView === 'results' ? t('latest_results') : t('featured_events_title')} <span className="heading-star">✳</span></h2><p>{t("find_moments")}</p></div><button className="view-all" onClick={() => openEventView('upcoming')}>{t("upcoming_schedule")} <ArrowRight size={15}/></button></div>
            <div className="event-view-tabs" role="tablist" aria-label="Event type">
              <button className={eventView === 'upcoming' ? 'event-view active' : 'event-view'} onClick={() => setEventView('upcoming')}>{t("upcoming")}</button>
              <button className={eventView === 'live' ? 'event-view active' : 'event-view'} onClick={() => setEventView('live')}>{t("live")} <span className="live-dot"/></button>
              <button className={eventView === 'results' ? 'event-view active' : 'event-view'} onClick={() => setEventView('results')}>{t("results")}</button>
            </div>
            <div className="sports-tabs">{sports.map((s,i)=><button key={s} className={sport===s?'tab active-tab':'tab'} onClick={()=>setSport(s)}><span>{['⚽','🏀','🎾','🏒','🏐'][i]}</span>{s}</button>)}</div>
            <div className="filter-row"><div className="league-filters">{leagues.map(l=><button key={l} onClick={()=>setLeague(l)} className={league===l?'filter active-filter':'filter'}>{l}</button>)}</div><label className="search-field"><Search size={15}/><input id="match-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("search")}/></label></div>
            <div className="match-list">
              {loadingMatches ? <div className="empty-state">Loading {sport.toLowerCase()} events…</div> : matchLoadError ? <div className="empty-state">Sports data could not be loaded. Please try again later.</div> : visibleMatches.length ? visibleMatches.map(match=><article className="match-card" key={match.id}>
                <div className="match-meta"><span className="league-name"><span className="league-ball">◉</span>{match.league}</span><span className="match-time">{eventView === 'results' ? <><Trophy size={13}/>{match.score ?? t('score_unavailable')}</> : <><Clock3 size={13}/>{match.time}</>}</span></div>
                <div className="match-body"><div className="teams"><div className="team"><span className="team-mark">{match.homeMark}</span><b>{match.home}</b></div><span className="versus">VS</span><div className="team"><span className="team-mark">{match.awayMark}</span><b>{match.away}</b></div></div>{eventView === 'results' ? <div className="result-label">FULL TIME</div> : <div className="odds-area"><span className="odds-caption">{t('match_winner')} <CircleHelp size={12}/></span><div className="odds-grid">{match.odds.map((odd,i)=><button key={i} disabled={odd === '—'} onClick={()=>setDetailMatch(match)} className='odd'><small>{['1','X','2'][i]}</small><b>{odd}</b></button>)}</div></div>}</div>
                <div className="match-footer"><button className="favorite-toggle" onClick={() => toggleFavorite(match.id)}><Star size={13} fill={favoriteIds.includes(String(match.id)) ? 'currentColor' : 'none'}/>{favoriteIds.includes(String(match.id)) ? t('saved') : t('add_favourites')}</button><button className="details-trigger" onClick={() => setDetailMatch(match)}>{t("match_details_btn")} <ArrowRight size={13}/></button></div>
              </article>) : <div className="empty-state">{query ? t('empty_search') : sport === 'Football' ? eventView === 'live' ? t('empty_live') : eventView === 'results' ? t('empty_results') : t('empty_football') : t('empty_sport')}</div>}
            </div>
            <div className="demo-note"><ShieldCheck size={15}/><span>{usingDemoData ? t('preview_note') : eventView === 'results' ? t('final_scores_note') : t('fixtures_note')}</span></div>
          </section>
        </section>

        <aside className="right-rail">
          <div className="slip-card"><div className="slip-head"><div><span className="eyebrow dark">{t('your_picks')}</span><h3>{t('bet_slip')} <span>{selected.length}</span></h3></div><button className="slip-clear" onClick={()=>setSelected([])}>{t("clear")}</button></div>
            {selected.length ? <div className="slip-selections">{selected.map(s=><div className="slip-selection" key={s.selectionId}><div><b>{s.match.home} – {s.match.away}</b><small>{s.label} · {s.match.league}</small></div><strong>{s.odd}</strong><button onClick={()=>setSelected(selected.filter(x=>x.selectionId!==s.selectionId))}><X size={14}/></button></div>)}</div> : <div className="slip-empty"><div className="slip-empty-icon"><ArrowDownUp size={22}/></div><b>{t("slip_waiting")}</b><p>{t("select_price")}</p></div>}
            <div className="bet-slip-stake"><label>{t('stake')}<select value={betCurrency} onChange={event=>setBetCurrency(event.target.value)}><option value="DZD">DZD · Algerian dinar</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option></select><input type="number" min="0.01" step="0.01" value={betStake} onChange={event=>setBetStake(event.target.value)} placeholder={t("enter_stake")}/></label><div><span>{t('potential_return')}</span><b>{(Math.max(0,Number(betStake)||0)*selected.reduce((total,item)=>total*Number(item.odd),1)).toFixed(2)} {betCurrency}</b></div></div>
            {betMessage && <p className="bet-slip-message">{betMessage}</p>}
            <button className="slip-cta" onClick={()=>void placeBet()} disabled={!selected.length||betBusy||!betStake}>{betBusy?t("submitting"):userEmail?t("place_bet"):t("sign_in_to_bet")} <ArrowRight size={15}/></button>
          </div>
          <div className="help-card" id="help"><div className="help-icon"><CircleHelp size={18}/></div><div><b>Need a hand?</b><p>Visit our help center for guidance.</p><a href="#help">Get support <ArrowRight size={13}/></a></div></div>
          <div className="responsible-card" id="responsible"><div className="responsible-icon"><ShieldCheck size={18}/></div><div><b>Play with awareness</b><p>Enjoy sports responsibly. Set limits and take breaks.</p><a href="#responsible">Learn more</a></div></div>
        </aside>
      </main>

      <nav className="mobile-nav"><button className="mobile-active" onClick={() => openEventView("upcoming")}><Trophy size={19}/>{t("sports")}</button><button onClick={() => openEventView('live')}><Activity size={19}/>Live</button><button onClick={()=>setMobileSlip(true)}><Wallet size={19}/>Slip {selected.length>0&&<i>{selected.length}</i>}</button><button onClick={() => { setShowFavorites(true); setEventView('upcoming'); document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' }) }}><Star size={19}/>Saved</button><button onClick={() => setMobileMoreOpen(true)}><Menu size={19}/>{t("menu")}</button></nav>
      {mobileMoreOpen && <div className="mobile-more-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setMobileMoreOpen(false) }}>
        <section className="mobile-more-panel" role="dialog" aria-modal="true" aria-label={t("menu")}>
          <div className="mobile-more-header"><div><b>BETNOVA</b><small>{t("menu")}</small></div><button className="icon-btn" onClick={() => setMobileMoreOpen(false)} aria-label={t("close")}><X size={18}/></button></div>
          <button onClick={() => { setMobileMoreOpen(false); openEventView("upcoming") }}><Trophy size={17}/>{t("sports")}</button>
          <button onClick={() => { setMobileMoreOpen(false); openEventView("live") }}><Activity size={17}/>{t("live")}</button>
          <button onClick={() => { setMobileMoreOpen(false); openEventView("results") }}><Clock3 size={17}/>{t("results")}</button>
          <button onClick={() => { setMobileMoreOpen(false); setShowFavorites(true); setEventView("upcoming"); document.getElementById("events")?.scrollIntoView({behavior:"smooth"}) }}><Star size={17}/>{t("favourites")}</button>
          {userEmail ? <>
            <button onClick={() => { setMobileMoreOpen(false); setWalletOpen(true) }}><Wallet size={17}/>{t("wallet")}</button>
            <button onClick={() => { setMobileMoreOpen(false); setBetsOpen(true) }}><Activity size={17}/>{t("my_bets")}</button>
            <button onClick={() => { setMobileMoreOpen(false); setAdminOpen(true) }}><ShieldCheck size={17}/>{t("admin")}</button>
            <button onClick={() => { setMobileMoreOpen(false); void supabase?.auth.signOut() }}><ArrowRight size={17}/>{t("signout")}</button>
          </> : <>
            <button onClick={() => { setMobileMoreOpen(false); setAuthMode("login"); setAuthOpen(true) }}><ArrowRight size={17}/>{t("login")}</button>
            <button onClick={() => { setMobileMoreOpen(false); setAuthMode("signup"); setAuthOpen(true) }}><ShieldCheck size={17}/>{t("join")}</button>
          </>}
          <div className="mobile-more-language"><Globe2 size={16}/><span>{t("language")}</span><select value={language} onChange={event => setLanguage(event.target.value as typeof language)}>{languages.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
        </section>
      </div>}
      {notificationsOpen && <div className="notification-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setNotificationsOpen(false) }}>
        <section className="notification-panel" role="dialog" aria-modal="true" aria-label={t("notifications")}>
          <div className="mobile-more-header"><b>{t("notifications")}</b><button className="icon-btn" onClick={() => setNotificationsOpen(false)} aria-label={t("close")}><X size={18}/></button></div>
          <div className="notification-empty"><Bell size={24}/><b>{t("no_notifications")}</b><span>{t("notifications_hint")}</span></div>
          <button className="slip-cta" onClick={() => setNotificationsOpen(false)}>{t("close")}</button>
        </section>
      </div>}
      {mobileSlip && <div className="mobile-sheet-backdrop" onClick={()=>setMobileSlip(false)}><div className="mobile-sheet" onClick={e=>e.stopPropagation()}><div className="sheet-handle"/><div className="slip-head"><div><span className="eyebrow dark">YOUR PICKS</span><h3>Bet slip <span>{selected.length}</span></h3></div><button className="icon-btn" onClick={()=>setMobileSlip(false)}><X/></button></div>{selected.length?selected.map(s=><div className="slip-selection" key={s.selectionId}><div><b>{s.match.home} – {s.match.away}</b><small>{s.label} · {s.match.league}</small></div><strong>{s.odd}</strong></div>):<div className="slip-empty"><div className="slip-empty-icon"><ArrowDownUp size={22}/></div><b>{t("slip_waiting")}</b><p>{t("select_price")}</p></div>}<div className="bet-slip-stake"><label>Stake · DZD<input type="number" min="0.01" step="0.01" value={betStake} onChange={event=>setBetStake(event.target.value)} placeholder={t("enter_stake")}/></label><div><span>Potential return</span><b>{(Math.max(0,Number(betStake)||0)*selected.reduce((total,item)=>total*Number(item.odd),1)).toFixed(2)} DZD</b></div></div>{betMessage&&<p className="bet-slip-message">{betMessage}</p>}<button className="slip-cta" onClick={()=>void placeBet()} disabled={!selected.length||betBusy||!betStake}>{betBusy?'Submitting…':userEmail?'Place bet':'Sign in to bet'} <ArrowRight size={15}/></button></div></div>}
      {detailMatch && <div className="detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setDetailMatch(null) }}><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="detail-close" onClick={() => setDetailMatch(null)} aria-label="Close match details"><X size={19}/></button><div className="detail-kicker">BETNOVA · MATCH CENTER</div><div className="detail-league">{detailMatch.league}{detailMatch.country ? ` · ${detailMatch.country}` : ''}</div><h2 id="detail-title">{t('match_details')}</h2><div className="detail-teams"><div><span className="detail-mark">{detailMatch.homeMark}</span><b>{detailMatch.home}</b></div><span className="detail-versus">{detailMatch.score ?? 'VS'}</span><div><span className="detail-mark">{detailMatch.awayMark}</span><b>{detailMatch.away}</b></div></div><div className="detail-info-grid"><div><small>{detailMatch.status === 'finished' ? 'MATCH STATUS' : detailMatch.status === 'live' ? 'MATCH STATUS' : 'KICK-OFF'}</small><b>{detailMatch.status === 'finished' ? 'Full time' : detailMatch.status === 'live' ? 'Live now' : detailMatch.kickoff ?? detailMatch.time}</b></div><div><small>COMPETITION</small><b>{detailMatch.league}</b></div><div><small>COUNTRY</small><b>{detailMatch.country || 'Not specified'}</b></div><div><small>RESULT</small><b>{detailMatch.score ?? 'Not available yet'}</b></div></div><div className="detail-market-heading"><div><span className="eyebrow dark">EXPLORE THE ODDS</span><h3>{t('markets')}</h3></div><span>{detailMatch.status === 'live' ? 'LIVE EVENT' : 'PRE-MATCH'}</span></div>{usingDemoData || typeof detailMatch.id !== 'string' ? <div className="markets-empty">Sample fixture preview only. Verified markets are unavailable for this event.</div> : <MatchMarkets fixtureId={detailMatch.id} live={detailMatch.status === 'live'} selectedIds={selected.map(item => item.selectionId)} onSelect={addMarketSelection} />}</section></div>}
      {adminOpen && <AdminOverview onClose={() => setAdminOpen(false)} />}
      {walletOpen && <WalletPanel onClose={() => setWalletOpen(false)} />}
      {betsOpen && <MyBetsPanel onClose={() => setBetsOpen(false)} />}
      <AuthPanel open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} onModeChange={setAuthMode} />
      <footer className="footer"><span>© 2026 BETNOVA</span><span>A NEW WORLD OF SPORTS</span><span>Designed for the next generation <span className="footer-star">✳</span></span><span>Football data by <a href="https://5dollarfootballapi.com" target="_blank" rel="noreferrer">5DollarFootballAPI</a></span></footer>
    </div>
  )
}