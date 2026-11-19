import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownUp, ArrowRight, Bell, CalendarDays, ChevronDown, CircleHelp, Clock3, Flame, Globe2, Home, Menu, Search, Settings, ShieldCheck, Sparkles, Star, Trophy, UserRound, Wallet, X } from 'lucide-react'
import AuthPanel from './components/AuthPanel'
import AccountPanel from './components/AccountPanel'
import NotificationSettings from './components/NotificationSettings'
import AdminOverview from './components/AdminOverview'
import SupportCenter from './components/SupportCenter'
import ResponsiblePlay from './components/ResponsiblePlay'
import WalletPanel from './components/WalletPanel'
import MatchMarkets from './components/MatchMarkets'
import MatchStatistics from './components/MatchStatistics'
import MatchNotificationFollow from './components/MatchNotificationFollow'
import MyBetsPanel from './components/MyBetsPanel'
const GamesHub = lazy(() => import('./components/GamesHub'))
import { languages, useLanguage } from './i18n'
import { supabase } from './lib/supabase'

const cleanMarketDisplayName = (raw: string) => String(raw ?? '')
  .replace(/\b(oddspapi|oddsapi|apifootball|5dollarfootballapi|pinnacle|bet\s?365|1xbet|unibet|leovegas|pmu|winamax|marathon\s?bet|nordic\s?bet|bwin|betfair|william\s?hill|betway|888sport|stake|betano|parimatch|dafabet|10bet|sportingbet)\b/gi, '')
  .replace(/\s*[·|–—-]\s*/g, ' ')
  .replace(/\s{2,}/g, ' ')
  .trim() || 'BETNOVA Markets';

const CLUB_PREFIXES = new Set(['FC','CF','CD','SC','AC','FK','SK','AFC','CFC','FBC','CA','CLUB','FOOTBALL','DEPORTIVO','SPORTING'])

function teamInitials(name: string) {
  const words = String(name ?? '').trim().split(/[\s-]+/).filter(Boolean)
  const meaningful = words.filter(word => !CLUB_PREFIXES.has(word.replace(/[^\p{L}]/gu, '').toUpperCase()))
  const source = meaningful.length ? meaningful : words
  if (!source.length) return '??'
  const chars = source.length > 1
    ? source.slice(0, 2).map(word => Array.from(word)[0])
    : Array.from(source[0]).slice(0, 2)
  return chars.join('').toLocaleUpperCase().slice(0, 2)
}

type MarketPick = { selectionId: string; marketId: string; marketKey: string; marketLabel: string; selectionLabel: string; odds: string; isDemo?: boolean }
type Match = {
  id: string | number
  league: string
  country: string
  countryFlag: string
  time: string
  home: string
  away: string
  homeMark: string
  awayMark: string
  homeLogo: string | null
  awayLogo: string | null
  odds: string[]
  oddsLabels: string[]
  oddsCaption: string
  winnerPicks: (MarketPick | null)[]
  marketsCount: number
  featured?: boolean
  status?: string
  score?: string
  kickoff?: string
  dateLabel?: string
  startsAt?: string
}


function countryFlagForCompetition(competition: string, country: string) {
  const normalize = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
  const countryName = normalize(country || '')
  const competitionName = normalize(competition || '')
  if (/\b(algeria|algerian|algerie|dz)\b/.test(competitionName)) return '🇩🇿'
  const countryFlags: Record<string, string> = {
    algeria: '🇩🇿', dz: '🇩🇿', 'algerie': '🇩🇿',
    france: '🇫🇷', fr: '🇫🇷', england: '🇬🇧', 'united kingdom': '🇬🇧', uk: '🇬🇧', gb: '🇬🇧',
    spain: '🇪🇸', espana: '🇪🇸', italy: '🇮🇹', italia: '🇮🇹', germany: '🇩🇪', deutschland: '🇩🇪',
    portugal: '🇵🇹', netherlands: '🇳🇱', holland: '🇳🇱', turkey: '🇹🇷', turkiye: '🇹🇷',
    'saudi arabia': '🇸🇦', morocco: '🇲🇦', maroc: '🇲🇦', egypt: '🇪🇬', brazil: '🇧🇷',
    argentina: '🇦🇷', colombia: '🇨🇴', 'united states': '🇺🇸', usa: '🇺🇸', mexico: '🇲🇽',
    japan: '🇯🇵', 'south korea': '🇰🇷', india: '🇮🇳', australia: '🇦🇺', scotland: '🇬🇧',
    wales: '🇬🇧', ireland: '🇮🇪', belgium: '🇧🇪', switzerland: '🇨🇭', austria: '🇦🇹',
    greece: '🇬🇷', denmark: '🇩🇰', sweden: '🇸🇪', norway: '🇳🇴', poland: '🇵🇱',
    ukraine: '🇺🇦', russia: '🇷🇺',
  }
  if (countryFlags[countryName]) return countryFlags[countryName]
  if (/^(world|europe|africa|asia|oceania|international)$/.test(countryName)) return '🌍'

  const name = normalize(competition || '')
  const flags: [RegExp, string][] = [
    [/\b(algeria|algerian|algerie|dz)\b/, '🇩🇿'],
    [/\b(france|french|ligue 1 - france|ligue 2 - france)\b/, '🇫🇷'],
    [/\b(england|english|premier league - england|epl|fa cup|efl)\b|championship - england/, '🇬🇧'],
    [/\b(spain|spanish|la liga|laliga|copa del rey)\b/, '🇪🇸'],
    [/\b(italy|italian|serie a - italy|serie b - italy|coppa italia)\b/, '🇮🇹'],
    [/\b(germany|german|bundesliga - germany|dfb)\b/, '🇩🇪'],
    [/\b(portugal|primeira liga|liga portugal)\b/, '🇵🇹'],
    [/\b(netherlands|eredivisie|holland)\b/, '🇳🇱'],
    [/\b(turkey|turkish|super lig|super league - turkey)\b/, '🇹🇷'],
    [/\b(saudi|saudi arabia|pro league - saudi)\b/, '🇸🇦'],
    [/\b(morocco|botola)\b/, '🇲🇦'], [/\b(egypt|egyptian)\b/, '🇪🇬'],
    [/\b(brazil|brasileiro|brasileirao|gaucho|paraense|pernambucano|sergipano)\b/, '🇧🇷'],
    [/\b(argentina)\b/, '🇦🇷'], [/\b(colombia)\b/, '🇨🇴'],
    [/\b(usa|united states|mls|major league soccer)\b/, '🇺🇸'], [/\b(mexico|liga mx)\b/, '🇲🇽'],
    [/\b(japan|j-league)\b/, '🇯🇵'], [/\b(south korea|k league)\b/, '🇰🇷'],
    [/\b(india|indian super)\b/, '🇮🇳'], [/\b(australia|a-league)\b/, '🇦🇺'],
    [/\b(scotland|premiership - scotland)\b/, '🇬🇧'], [/\b(wales)\b/, '🇬🇧'], [/\b(ireland)\b/, '🇮🇪'],
    [/\b(belgium|jupiler)\b/, '🇧🇪'], [/\b(switzerland|swiss superleague)\b/, '🇨🇭'],
    [/\b(austria|austrian bundesliga)\b/, '🇦🇹'], [/\b(greece|super league - greece)\b/, '🇬🇷'],
    [/\b(denmark|superliga)\b/, '🇩🇰'], [/\b(sweden|allsvenskan)\b/, '🇸🇪'], [/\b(norway|eliteserien)\b/, '🇳🇴'],
    [/\b(poland|ekstraklasa)\b/, '🇵🇱'], [/\b(ukraine)\b/, '🇺🇦'], [/\b(russia)\b/, '🇷🇺'],
  ]
  return flags.find(([pattern]) => pattern.test(name))?.[1] ?? '🌍'
}

function canonicalCompetitionLabel(competition: string, country: string) {
  const value = (String(competition) + ' ' + String(country)).toLowerCase()
  if (/premier league/.test(value) && /england/.test(value) && !/women|u\d|cup/.test(value)) return 'Premier League'
  if (/la liga/.test(value) && !/2|women/.test(value)) return 'La Liga'
  if (/serie a/.test(value) && /italy|italia/.test(value)) return 'Serie A'
  if (/bundesliga/.test(value) && /germany|deutschland/.test(value) && !/2\.? bundesliga|bundesliga 2|women/.test(value)) return 'Bundesliga'
  if (/ligue 1/.test(value) && /france/.test(value) && !/women/.test(value)) return 'Ligue 1'
  if (/champions league/.test(value) && !/women/.test(value)) return 'UEFA Champions League'
  if (/europa league/.test(value) && !/conference/.test(value)) return 'UEFA Europa League'
  if (/conference league/.test(value)) return 'UEFA Conference League'
  return competition
}

function isInternationalCompetition(competition: string, country: string) {
  const value = `${country} ${competition}`.toLowerCase()
  return /^(world|europe|africa|asia|oceania|international)$/.test(country.trim().toLowerCase()) ||
    /international|friendly|qualif|nations league|world cup|euro|asian cup|africa cup|afcon|copa america|olympic|fifa|uefa|afc|caf|concacaf|conmebol|u17 world|u19 world|u20 world|u23/.test(value)
}

const sports = ['Football', 'Basketball', 'Tennis', 'Ice Hockey', 'Volleyball']

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

function normalizedPick(value: string) {
  return String(value ?? '').trim().toLowerCase().replace(/[ _-]+/g, ' ')
}

function builderConflict(a: { marketKey: string; label: string }, b: { marketKey: string; label: string }) {
  const keyA = normalizedPick(a.marketKey)
  const keyB = normalizedPick(b.marketKey)
  const labelA = normalizedPick(a.label)
  const labelB = normalizedPick(b.label)
  const resultOf = (key: string, label: string) => {
    if (key === 'match_result') {
      if (/\b(home|win 1|فوز 1)\b/.test(label)) return 'home'
      if (/\b(away|win 2|فوز 2)\b/.test(label)) return 'away'
      if (/\b(draw|تعادل|\bx\b)/.test(label)) return 'draw'
    }
    if (key === 'double_chance') {
      if (/\b1x\b/.test(label)) return '1x'
      if (/\bx2\b/.test(label)) return 'x2'
      if (/\b12\b/.test(label)) return '12'
    }
    return null
  }
  const resultA = resultOf(keyA, labelA)
  const resultB = resultOf(keyB, labelB)
  const outcome = [resultA, resultB].find(value => value === 'home' || value === 'draw' || value === 'away')
  const chance = [resultA, resultB].find(value => value === '1x' || value === 'x2' || value === '12')
  if (outcome && chance) {
    if (chance === '1x' && outcome === 'away') return true
    if (chance === 'x2' && outcome === 'home') return true
    if (chance === '12' && outcome === 'draw') return true
  }

  const btts = keyA === 'both_teams_score' ? labelA : keyB === 'both_teams_score' ? labelB : ''
  const total = keyA === 'total_goals' ? labelA : keyB === 'total_goals' ? labelB : ''
  if (btts && total) {
    const saysYes = /\b(yes|نعم)\b/.test(btts)
    const under = /\b(under|أقل من|moins de)\b/.test(total)
    const line = Number(total.match(/\d+(?:\.\d+)?/)?.[0])
    if (saysYes && under && Number.isFinite(line) && line <= 1.5) return true
  }
  return false
}

export default function App() {
  const { language, setLanguage, t } = useLanguage()
  const [sport, setSport] = useState('Football')
  const [eventView, setEventView] = useState<'upcoming' | 'live' | 'results'>('upcoming')
  const [favoriteIds, setFavoriteIds] = useState<string[]>([])
  const [showFavorites, setShowFavorites] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const [visibleMatchLimit, setVisibleMatchLimit] = useState(40)
  const usingDemoData = false
  const [league, setLeague] = useState('All matches')
  const [selected, setSelected] = useState<{ match: Match; label: string; odd: string; selectionId: string; marketId: string; marketKey: string; isDemo?: boolean }[]>([])
  const hasSameMatchBuilder = selected.some((item, index) => selected.some((other, otherIndex) => otherIndex !== index && String(other.match.id) === String(item.match.id)))
  const [betStake, setBetStake] = useState('')
  const [betCurrency, setBetCurrency] = useState('DZD')
  const [betBusy, setBetBusy] = useState(false)
  const [betMessage, setBetMessage] = useState('')
  const [betIdempotencyKey, setBetIdempotencyKey] = useState(() => crypto.randomUUID())
  const [mobileSlip, setMobileSlip] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [walletInitialTab, setWalletInitialTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit')
  const [query, setQuery] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState(0)
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [matchLoadError, setMatchLoadError] = useState<string | null>(null)
  const [detailMatch, setDetailMatch] = useState<Match | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [responsibleOpen, setResponsibleOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  async function signOutCurrentUser() {
    if (!supabase) return
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('device_push_tokens').delete().eq('user_id', user.id)
    }
    await supabase.auth.signOut()
  }

  function openWallet(tab: 'deposit' | 'withdraw' | 'history' = 'deposit') {
    setWalletInitialTab(tab)
    const current = Array.isArray(window.history.state?.betnovaOverlays) ? window.history.state.betnovaOverlays as string[] : []
    const base = current.filter(id => id !== 'mobileMore' && id !== 'account' && id !== 'wallet')
    window.history.replaceState({ ...window.history.state, betnovaOverlays: base }, '', window.location.href)
    const next = [...base, 'wallet']
    window.history.pushState({ ...window.history.state, betnovaOverlays: next }, '', window.location.href)
    applyOverlayStack(next)
  }
  function openResponsible() {
    const current = Array.isArray(window.history.state?.betnovaOverlays) ? window.history.state.betnovaOverlays as string[] : []
    const base = current.filter(id => id !== 'mobileMore' && id !== 'account' && id !== 'responsible')
    window.history.replaceState({ ...window.history.state, betnovaOverlays: base }, '', window.location.href)
    const next = [...base, 'responsible']
    window.history.pushState({ ...window.history.state, betnovaOverlays: next }, '', window.location.href)
    applyOverlayStack(next)
  }
  function openSupport() {
    const current = Array.isArray(window.history.state?.betnovaOverlays) ? window.history.state.betnovaOverlays as string[] : []
    const base = current.filter(id => id !== 'mobileMore' && id !== 'account' && id !== 'support')
    window.history.replaceState({ ...window.history.state, betnovaOverlays: base }, '', window.location.href)
    const next = [...base, 'support']
    window.history.pushState({ ...window.history.state, betnovaOverlays: next }, '', window.location.href)
    applyOverlayStack(next)
  }
  const [betsOpen, setBetsOpen] = useState(false)
  const [activePage, setActivePage] = useState<'sports' | 'games' | 'football'>('sports')
  const [selectedMatchDate, setSelectedMatchDate] = useState('')
  const [selectedMatchTime, setSelectedMatchTime] = useState('')
  const [selectedMatchTimeTo, setSelectedMatchTimeTo] = useState('')
  const [footballDateFiltersOpen, setFootballDateFiltersOpen] = useState(false)
  const [featuredGameRequest, setFeaturedGameRequest] = useState<{id:string;token:number}|null>(null)
  function openFeaturedGame(id:string) { setFeaturedGameRequest(current => ({id,token:(current?.token ?? 0)+1})); openGames() }

  function openOverlay(id: string, extra: Record<string, unknown> = {}) {
    const current = Array.isArray(window.history.state?.betnovaOverlays) ? window.history.state.betnovaOverlays as string[] : []
    window.history.pushState({ ...window.history.state, betnovaOverlays: [...current, id], ...extra }, '', window.location.href)
    applyOverlayStack([...current, id], extra)
  }
  function closeMobileMenuToPage() {
    const current = Array.isArray(window.history.state?.betnovaOverlays) ? window.history.state.betnovaOverlays as string[] : []
    const menuIndex = current.lastIndexOf('mobileMore')
    const base = menuIndex >= 0 ? current.filter((_, index) => index !== menuIndex) : current
    window.history.replaceState({ ...window.history.state, betnovaOverlays: base }, '', window.location.href)
    applyOverlayStack(base)
  }
  function applyOverlayStack(stack: string[], extra: Record<string, unknown> = {}) {
    setAccountOpen(stack.includes('account'))
    setWalletOpen(stack.includes('wallet'))
    setAdminOpen(stack.includes('admin'))
    setSupportOpen(stack.includes('support'))
    setResponsibleOpen(stack.includes('responsible'))
    setBetsOpen(stack.includes('bets'))
    setAuthOpen(stack.includes('auth'))
    setNotificationsOpen(stack.includes('notifications'))
    setSettingsOpen(stack.includes('settings'))
    setMobileMoreOpen(stack.includes('mobileMore'))
    setMobileSlip(stack.includes('mobileSlip'))
    setDetailMatch(stack.includes('matchDetails') ? ((extra.betnovaDetailMatch as Match | null) ?? window.history.state?.betnovaDetailMatch ?? null) : null)
  }
  function closeOverlay(id: string) {
    const current = Array.isArray(window.history.state?.betnovaOverlays) ? window.history.state.betnovaOverlays as string[] : []
    if (current[current.length - 1] === id) {
      window.history.back()
      return
    }
    const next = current.filter((item, index) => item !== id || index !== current.lastIndexOf(id))
    window.history.replaceState({ ...window.history.state, betnovaOverlays: next }, '', window.location.href)
    applyOverlayStack(next)
  }
  function goHome() {
    window.history.replaceState({ betnovaPage: 'sports', betnovaOverlays: [] }, '', window.location.pathname + window.location.search)
    setActivePage('sports')
    setAccountOpen(false); setWalletOpen(false); setAdminOpen(false); setSupportOpen(false); setResponsibleOpen(false); setBetsOpen(false)
    setAuthOpen(false); setNotificationsOpen(false); setSettingsOpen(false)
    setMobileMoreOpen(false); setMobileSlip(false); setDetailMatch(null)
  }
  function openGames() {
    if (activePage !== 'games') window.history.pushState({ ...window.history.state, betnovaPage: 'games' }, '', '#games')
    setActivePage('games')
  }
  function closeGames() {
    if (window.history.state?.betnovaPage === 'games') window.history.back()
    else setActivePage('sports')
  }
  function openFootball() {
    if (activePage !== 'football') window.history.pushState({ ...window.history.state, betnovaPage: 'football' }, '', '#football')
    setSport('Football')
    setEventView('upcoming')
    setShowFavorites(false)
    setLeague('All matches')
    setActivePage('football')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  useEffect(() => {
    const handleBack = (event: PopStateEvent) => {
      const overlays = Array.isArray(event.state?.betnovaOverlays) ? event.state.betnovaOverlays as string[] : []
      applyOverlayStack(overlays, { betnovaDetailMatch: event.state?.betnovaDetailMatch })
      setActivePage(event.state?.betnovaPage === 'games' ? 'games' : event.state?.betnovaPage === 'football' ? 'football' : 'sports')
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client) return
    let active = true
    let walletChannel: ReturnType<typeof client.channel> | null = null
    const loadWalletBalance = async (userId?: string) => {
      if (!userId) {
        setWalletBalance(0)
        if (walletChannel) { void client.removeChannel(walletChannel); walletChannel = null }
        return
      }
      const { data, error } = await client.from('wallet_accounts')
        .select('available_balance')
        .eq('user_id', userId)
        .eq('currency', 'DZD')
        .maybeSingle()
      if (!active) return
      if (error) {
        console.error('Could not refresh header wallet balance:', error.message)
        return
      }
      setWalletBalance(Number(data?.available_balance ?? 0))
      if (walletChannel) void client.removeChannel(walletChannel)
      walletChannel = client.channel('header-wallet-' + userId)
        .on('postgres_changes', {event:'*',schema:'public',table:'wallet_accounts',filter:'user_id=eq.' + userId}, () => {
          void loadWalletBalance(userId)
        })
        .subscribe()
    }
    const checkAdmin = async (userId?: string) => {
      if (!userId) { setIsAdminUser(false); return }
      const { data } = await client.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (active) setIsAdminUser(data?.role === 'admin')
    }
    client.auth.getSession().then(({ data }) => {
      const user=data.session?.user
      setUserEmail(user?.email ?? null)
      void checkAdmin(user?.id)
      void loadWalletBalance(user?.id)
    })
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const user=session?.user
      setUserEmail(user?.email ?? null)
      void checkAdmin(user?.id)
      void loadWalletBalance(user?.id)
    })
    return () => {
      active = false
      subscription.unsubscribe()
      if (walletChannel) void client.removeChannel(walletChannel)
    }
  }, [])

  useEffect(() => {
    let active = true
    let latestRequest = 0
    let initialLoad = true

    async function loadFixtures() {
      const requestId = ++latestRequest
      if (initialLoad) setLoadingMatches(true)
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
            home_team:teams!fixtures_home_team_id_fkey(name, short_name, logo_url),
            away_team:teams!fixtures_away_team_id_fkey(name, short_name, logo_url),
            markets(id, market_type, market_key, name, status, is_active, is_live, last_updated_at, market_selections(id, name, odds, status, result_status, updated_at))
          `)
          .eq('competitions.sport_id', sportRow.id)
          // Keep fixture cards even when they have no odds, but embed only
          // currently open prices and unsettled selections to keep payloads small.
          .eq('markets.is_active', true)
          .eq('markets.status', 'open')
          .gte('markets.last_updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .eq('markets.market_selections.status', 'active')
          .eq('markets.market_selections.result_status', 'pending')
        if (eventView === 'live') {
          // Never label an old fixture as live when the upstream feed has gone stale.
          fixtureQuery = fixtureQuery
            .eq('status', 'live')
            .gte('starts_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
            .gte('updated_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
        } else if (eventView === 'results') {
          const selectedDayStart = selectedMatchDate ? new Date(selectedMatchDate + 'T00:00:00') : null
          const selectedDayEnd = selectedDayStart ? new Date(selectedDayStart.getTime() + 24 * 60 * 60 * 1000) : null
          fixtureQuery = fixtureQuery.eq('status', 'finished')
            .gte('starts_at', (selectedDayStart ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)).toISOString())
          if (selectedDayEnd) fixtureQuery = fixtureQuery.lt('starts_at', selectedDayEnd.toISOString())
        } else {
          const now = new Date()
          const selectedDayStart = selectedMatchDate ? new Date(selectedMatchDate + 'T00:00:00') : now
          const selectedDayEnd = selectedMatchDate ? new Date(selectedDayStart.getTime() + 24 * 60 * 60 * 1000) : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
          fixtureQuery = fixtureQuery.eq('status', 'scheduled')
            .gte('starts_at', selectedDayStart.toISOString())
            .lt('starts_at', selectedDayEnd.toISOString())
        }
        // Keep the first screen fast: load a bounded page of fixtures rather than
        // sequentially fetching up to 5,000 rows with nested market selections.
        const page = await fixtureQuery
          .order('starts_at', { ascending: eventView !== 'results' })
          .order('id', { ascending: true })
          .range(0, 249)
        if (page.error) throw page.error
        const data = page.data ?? []
        if (!active || requestId !== latestRequest) return

        const mapped: Match[] = (data ?? []).map((row: any) => {
          const competition = Array.isArray(row.competitions) ? row.competitions[0] : row.competitions
          const home = Array.isArray(row.home_team) ? row.home_team[0] : row.home_team
          const away = Array.isArray(row.away_team) ? row.away_team[0] : row.away_team
          const now = Date.now()
          const openMarkets = (row.markets ?? []).filter((market: any) => {
            const updated = Date.parse(String(market.last_updated_at ?? ''))
            const maxAge = market.is_live ? 7 * 60 * 1000 : 24 * 60 * 60 * 1000
            const fresh = Number.isFinite(updated) && now - updated <= maxAge && updated <= now + 30000
            return market.is_active && market.status === 'open' && fresh &&
              (row.status === 'live' ? market.is_live : !market.is_live) &&
              (market.market_selections ?? []).some((selection: any) => selection.status === 'active' && selection.result_status === 'pending')
          })
          const winnerSelections = openMarkets
            .filter((market: any) => market.market_key === 'match_result' || market.market_type === 'match_result')
            .flatMap((market: any) => (market.market_selections ?? []).map((selection: any) => ({ market, selection })))
            .filter((item: any) => item.selection.status === 'active' && item.selection.result_status === 'pending')
          const findPick = (names: string[]): MarketPick | null => {
            const candidates = winnerSelections
              .filter((item: any) => names.includes(String(item.selection.name).trim().toLowerCase()))
              .filter((item: any) => Number.isFinite(Number(item.selection.odds)) && Number(item.selection.odds) > 1)
              .sort((left: any, right: any) => Number(right.selection.odds) - Number(left.selection.odds))
            const best = candidates[0]
            return best ? {
              selectionId: String(best.selection.id),
              marketId: String(best.market.id),
              marketKey: String(best.market.market_key || best.market.market_type),
              marketLabel: String(best.market.name),
              selectionLabel: String(best.selection.name),
              odds: Number(best.selection.odds).toFixed(2),
            } : null
          }
          const winnerPicks: (MarketPick | null)[] = [
            findPick(['home', '1']),
            findPick(['draw', 'x']),
            findPick(['away', '2']),
          ]
          // If a bookmaker has not posted 1X2 for this fixture, still surface
          // a real, currently open market (prefer O/U 2.5, then BTTS, then DC).
          // Never fabricate or derive prices.
          let cardPicks: (MarketPick | null)[] = winnerPicks.every(Boolean) ? winnerPicks : []
          let cardLabels = ['Win 1', 'Draw', 'Win 2']
          let cardCaption = t('match_winner')
          if (!winnerPicks.every(Boolean)) {
            const preferredMarkets = [...openMarkets].sort((a: any, b: any) => {
              const rank = (market: any) => {
                const key = String(market.market_key || market.market_type || '').toLowerCase()
                const name = String(market.name || '').toLowerCase()
                if (key === 'total_goals' && /2[.,]5/.test(name)) return 0
                if (key === 'total_goals') return 1
                if (key === 'both_teams_score' || key === 'btts') return 2
                if (key === 'double_chance') return 3
                return 4
              }
              return rank(a) - rank(b)
            })
            const fallback = preferredMarkets.find((market: any) =>
              (market.market_selections ?? []).filter((selection: any) =>
                selection.status === 'active' && selection.result_status === 'pending' &&
                Number.isFinite(Number(selection.odds)) && Number(selection.odds) > 1
              ).length >= 2
            )
            if (fallback) {
              const selections = (fallback.market_selections ?? []).filter((selection: any) =>
                selection.status === 'active' && selection.result_status === 'pending' &&
                Number.isFinite(Number(selection.odds)) && Number(selection.odds) > 1
              ).slice(0, 3)
              cardPicks = selections.map((selection: any) => ({
                selectionId: String(selection.id),
                marketId: String(fallback.id),
                marketKey: String(fallback.market_key || fallback.market_type),
                marketLabel: String(fallback.name),
                selectionLabel: String(selection.name),
                odds: Number(selection.odds).toFixed(2),
              }))
              cardLabels = selections.map((selection: any) => String(selection.name))
              cardCaption = cleanMarketDisplayName(String(fallback.name || 'Available odds'))
            }
          }
          const startsAt = new Date(row.starts_at)
          return {
            id: row.id,
            league: canonicalCompetitionLabel(competition?.name ?? 'Competition', competition?.country ?? ''),
            country: competition?.country ?? '',
            countryFlag: countryFlagForCompetition(competition?.name ?? '', competition?.country ?? ''),
            time: startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            kickoff: startsAt.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' }),
            startsAt: String(row.starts_at),
            dateLabel: startsAt.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
            home: home?.name ?? 'Home team',
            away: away?.name ?? 'Away team',
            homeMark: teamInitials(home?.name ?? 'Home team'),
            awayMark: teamInitials(away?.name ?? 'Away team'),
            homeLogo: home?.logo_url ?? null,
            awayLogo: away?.logo_url ?? null,
            odds: cardPicks.map(pick => pick?.odds ?? '—'),
            oddsLabels: cardLabels,
            oddsCaption: cardCaption,
            winnerPicks: cardPicks,
            marketsCount: Math.max(openMarkets.length, cardPicks.some(pick => pick?.isDemo) ? 1 : 0),
            status: row.status,
            score: row.home_score !== null && row.away_score !== null ? `${row.home_score} – ${row.away_score}` : undefined,
          }
        })

        // Different feeds sometimes store the same fixture under slightly
        // different competition aliases. Collapse those visual duplicates only;
        // keep the underlying database rows and their settlement records untouched.
        const uniqueMatches = new Map<string, Match>()
        const normalizeTeam = (value: string) => String(value ?? '')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\b(fc|cf|cd|sc|ac|fk|sk|afc|cfc|fbc|ca)\b/g, '')
          .replace(/[^\\p{L}\\p{N}]+/gu, ' ')
          .trim()
        const matchQuality = (match: Match) =>
          match.winnerPicks.filter(pick => pick && !pick.isDemo).length * 1000 +
          Math.min(match.marketsCount, 100) * 10 +
          (match.country ? 1 : 0)
        for (const match of mapped) {
          const minute = Math.floor(Date.parse(match.startsAt ?? '') / 60000)
          const homeKey = normalizeTeam(match.home)
          const awayKey = normalizeTeam(match.away)
          const key = homeKey && awayKey && Number.isFinite(minute)
            ? [homeKey, awayKey, minute].join('|')
            : 'fixture:' + String(match.id)
          const existing = uniqueMatches.get(key)
          if (!existing || matchQuality(match) > matchQuality(existing)) uniqueMatches.set(key, match)
        }
        const deduplicatedMatches = Array.from(uniqueMatches.values())
        if (deduplicatedMatches.length) {
          setMatches(deduplicatedMatches)
        } else {
          setMatches([])
        }
      } catch (caught) {
        if (active && requestId === latestRequest) {
          setMatchLoadError(caught instanceof Error ? caught.message : 'Could not load sports data.')
        }
      } finally {
        if (active && requestId === latestRequest) { setLoadingMatches(false); initialLoad = false }
      }
    }

    void loadFixtures()
    const client = supabase
    const channel = client?.channel('betnova-fixture-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, () => { void loadFixtures() })
      .subscribe()
    // Poll local DB for live updates when Realtime is temporarily disconnected.
    const refreshTimer = window.setInterval(() => { void loadFixtures() }, 120000)
    return () => {
      active = false
      window.clearInterval(refreshTimer)
      if (client && channel) void client.removeChannel(channel)
    }
  }, [sport, eventView, selectedMatchDate])

  const competitionOptions = useMemo(() => {
    const byName = new Map<string, { name: string; country: string; count: number; international: boolean }>()
    for (const match of matches) {
      const current = byName.get(match.league)
      if (current) current.count += 1
      else byName.set(match.league, {
        name: match.league,
        country: match.country,
        count: 1,
        international: isInternationalCompetition(match.league, match.country),
      })
    }
    const priority = (name: string, country: string) => {
      const value = (name + ' ' + country).toLowerCase()
      if (/premier league/.test(value) && /england/.test(value)) return 0
      if (/la liga/.test(value)) return 1
      if (/serie a/.test(value) && /italy/.test(value)) return 2
      if (/bundesliga/.test(value) && /germany/.test(value)) return 3
      if (/ligue 1/.test(value) && /france/.test(value)) return 4
      if (/uefa champions league|champions league/.test(value)) return 5
      if (/uefa europa league|europa league/.test(value)) return 6
      if (/conference league/.test(value)) return 7
      if (/championship/.test(value) && /england/.test(value)) return 8
      if (/eredivisie/.test(value)) return 9
      if (/primeira liga/.test(value)) return 10
      return 100
    }
    return Array.from(byName.values()).sort((a, b) =>
      priority(a.name, a.country) - priority(b.name, b.country) ||
      Number(b.international) - Number(a.international) ||
      a.name.localeCompare(b.name)
    )
  }, [matches])
  const internationalCompetitions = competitionOptions.filter(item => item.international && (item.name + ' ' + item.country).toLowerCase().includes(query.toLowerCase()))
  const domesticCompetitions = competitionOptions.filter(item => !item.international && (item.name + ' ' + item.country).toLowerCase().includes(query.toLowerCase()))

  const filteredMatches = useMemo(() => matches.filter(m =>
    (!showFavorites || favoriteIds.includes(String(m.id))) &&
    (league === 'All matches' || m.league === league) &&
    (m.home + ' ' + m.away + ' ' + m.league).toLowerCase().includes(query.toLowerCase()) &&
    (!selectedMatchDate || (m.startsAt ? localDateKey(m.startsAt) === selectedMatchDate : false)) &&
    (!selectedMatchTime || (m.startsAt ? new Date(m.startsAt).toTimeString().slice(0, 5) >= selectedMatchTime : false)) &&
    (!selectedMatchTimeTo || (m.startsAt ? new Date(m.startsAt).toTimeString().slice(0, 5) <= selectedMatchTimeTo : false))
  ), [matches, league, query, showFavorites, favoriteIds, selectedMatchDate, selectedMatchTime, selectedMatchTimeTo])

  const visibleMatches = useMemo(
    () => filteredMatches.slice(0, visibleMatchLimit),
    [filteredMatches, visibleMatchLimit]
  )

  useEffect(() => {
    setVisibleMatchLimit(40)
  }, [league, query, showFavorites, eventView])

  function toggleFavorite(matchId: string | number) {
    const id = String(matchId)
    setFavoriteIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  function openEventView(view: 'upcoming' | 'live' | 'results') {
    setShowFavorites(false)
    setEventView(view)
    document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })
  }

  function toggleMarketSelection(match: Match, selection: MarketPick) {
    const matchKey = String(match.id)
    const alreadySelected = selected.some(item => item.selectionId === selection.selectionId)
    if (alreadySelected) {
      setSelected(current => current.filter(item => item.selectionId !== selection.selectionId))
      setBetMessage('')
      return
    }
    if (selected.length >= 20) {
      setBetMessage('A bet slip can contain up to 20 selections.')
      return
    }
    // Replacing an outcome in the same market is allowed. Multiple markets from one match
    // are blocked until a verified same-match combined price is available.
    const afterMarketReplacement = selected.filter(item => !(String(item.match.id) === matchKey && item.marketKey === selection.marketKey))
    const remainingSameMatchPicks = afterMarketReplacement.filter(item => String(item.match.id) === matchKey)
    if (remainingSameMatchPicks.length > 0) {
      const candidate = { match, label: selection.marketLabel + ' · ' + selection.selectionLabel, odd: selection.odds, selectionId: selection.selectionId, marketId: selection.marketId, marketKey: selection.marketKey }
      const incompatible = remainingSameMatchPicks.find(item => builderConflict(
        { marketKey: item.marketKey, label: item.label },
        { marketKey: candidate.marketKey, label: candidate.label }
      ))
      setBetMessage(incompatible ? 'These two selections contradict each other.' : 'Only one selection per match is currently supported.')
      return
    }
    const candidate = { match, label: selection.marketLabel + ' · ' + selection.selectionLabel, odd: selection.odds, selectionId: selection.selectionId, marketId: selection.marketId, marketKey: selection.marketKey }
    setSelected([...afterMarketReplacement, candidate])
    setBetMessage('')
  }

  async function placeBet() {
    if (!supabase) { setBetMessage('Betting service is unavailable. Please try again later.'); return }
    if (!selected.length) { setBetMessage('Choose at least one verified market.'); return }
    if (hasSameMatchBuilder) { setBetMessage('Choose only one selection per match for now.'); return }
    const stake = Number(betStake)
    if (!Number.isFinite(stake) || stake <= 0 || Math.round(stake * 100) !== stake * 100) {
      setBetMessage('Enter a valid stake in DZD (maximum two decimal places).')
      return
    }
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (selected.some(item => !uuidPattern.test(item.selectionId))) {
      setBetMessage('One of your selections is not a verified market. Remove it and choose a real price again.')
      return
    }
    setBetBusy(true)
    setBetMessage('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) {
        setAuthMode('login')
        openOverlay('auth')
        setBetMessage('Sign in to place a bet with your available wallet balance.')
        return
      }
      // Deposits and the visible wallet balance are held in DZD. Read the authoritative
      // wallet immediately before submitting; the RPC locks it and repeats all checks.
      const { data: wallet, error: walletError } = await supabase
        .from('wallet_accounts')
        .select('available_balance')
        .eq('user_id', user.id)
        .eq('currency', 'DZD')
        .maybeSingle()
      if (walletError) throw walletError
      const available = Number(wallet?.available_balance ?? 0)
      setWalletBalance(available)
      if (available < stake) throw new Error('Insufficient available DZD balance. Deposit funds or enter a smaller stake.')
      const { data: betId, error: betError } = await supabase.rpc('betnova_place_bet', {
        p_selections: selected.map(item => ({ selection_id: item.selectionId })),
        p_stake: stake,
        p_currency: 'DZD',
        p_idempotency_key: betIdempotencyKey
      })
      if (betError) throw betError
      if (!betId) throw new Error('No bet reference was returned. Your selections remain in the slip; check My Bets before retrying.')
      // The RPC commits the bet, wallet debit and ledger entry atomically. A secondary
      // balance refresh must never misreport a committed bet as failed.
      const { data: refreshedWallet, error: refreshError } = await supabase
        .from('wallet_accounts')
        .select('available_balance')
        .eq('user_id', user.id)
        .eq('currency', 'DZD')
        .maybeSingle()
      if (refreshError) {
        console.error('Bet placed; wallet refresh failed:', refreshError.message)
        setWalletBalance(Math.max(0, available - stake))
      } else {
        setWalletBalance(Number(refreshedWallet?.available_balance ?? Math.max(0, available - stake)))
      }
      setSelected([])
      setBetStake('')
      setBetIdempotencyKey(crypto.randomUUID())
      setBetMessage(`Bet accepted. Reference: ${String(betId).slice(0, 8).toUpperCase()}`)
    } catch (caught) {
      setBetMessage(caught instanceof Error ? caught.message : 'Your bet could not be placed. Your selections are still in the slip.')
    } finally {
      setBetBusy(false)
    }
  }

  // Guests use the same live match centre and market details as members; betting remains authenticated.

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand nova-brand-lockup" href="#" onClick={event => { event.preventDefault(); goHome() }}><span className="brand-symbol nova-brand-symbol"><span className="nova-brand-glyph">B</span><i/></span><span className="nova-brand-word">BETNOVA</span></a>
        <nav className="desktop-nav"><button className={activePage === 'sports' ? 'active' : ''} onClick={() => { setActivePage('sports'); openEventView('upcoming') }}>{t('sports')}</button><button className={activePage === 'football' ? 'active' : ''} onClick={openFootball}>⚽ {t('football')}</button><button className={activePage === 'games' ? 'active' : ''} onClick={() => openGames()}>{t('games')}</button><button onClick={() => { setActivePage('sports'); openEventView('live') }}>{t('live')}</button><button type="button" onClick={openResponsible}>{t("responsible")}</button><button onClick={() => { setActivePage('sports'); openEventView('results') }}>{t('results')}</button></nav>
        <div className="top-actions">{activePage === 'games' && <button className="games-page-back games-page-back-top" type="button" onClick={closeGames}><ArrowRight size={16}/>{t('back_to_sports')}</button>}<button className="icon-btn top-search-btn" aria-label={t('search')} onClick={() => { document.getElementById('match-search')?.focus(); document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' }) }}><Search size={18}/></button>{userEmail && <><button className="wallet-open-btn deposit-open-btn" onClick={() => openWallet('deposit')}><Wallet size={15}/> {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(walletBalance)} DZD</button><button className="account-open-btn" onClick={() => openOverlay('account')}><UserRound size={15}/> {t('my_account')}</button></>}<button className="icon-btn" aria-label={t("notifications")} onClick={() => openOverlay('notifications')}><Bell size={18}/></button>{userEmail ? <><span className="signed-in-label">{t('signed_in')}</span><button className="my-bets-open-btn" onClick={() => openOverlay('bets')}>{t("my_bets")}</button>{isAdminUser && <button className="admin-open-btn" onClick={() => openOverlay('admin')}>{t('admin')}</button>}</> : <><span className="guest-preview-label">{t('public_preview')}</span><button className="login-btn" onClick={() => { setAuthMode('login'); openOverlay('auth') }}>{t('login')}</button><button className="join-btn" onClick={() => { setAuthMode('signup'); openOverlay('auth') }}>{t('join')} <ArrowRight size={16}/></button></>}</div>
      </header>

      <div className="ticker"><span className="live-dot"/><strong>{t("sports_center")}</strong><span className="ticker-divider"/><span>{t('ticker_explore')}</span><span className="ticker-right"><ShieldCheck size={14}/> {t("secure_experience")} <span>·</span> {matches.length > 0 ? t("sports_data_connected") : "Verified feed not connected"}</span></div>

      <main className={`layout nova-dashboard ${activePage === 'football' ? 'football-mode' : ''}`}>
        {activePage !== 'football' && <aside className="left-rail">
          <div className="rail-heading">{t("discover")} <span>•••</span></div>
          <button className={activePage === 'sports' ? 'rail-item selected' : 'rail-item'} onClick={() => { setActivePage('sports'); openEventView('upcoming') }}><Trophy size={18}/> {t("sports")} <span className="rail-count">24</span></button>
          <button className={activePage === 'games' ? 'rail-item selected' : 'rail-item'} onClick={() => openGames()}><Sparkles size={18}/> {t('games')} <span className="rail-count">9</span></button>
          <button className="rail-item" onClick={() => { setActivePage('sports'); openEventView('live') }}><Flame size={18}/> {t("live_events")} <span className="live-count">LIVE</span></button>
          <button className={showFavorites ? 'rail-item selected' : 'rail-item'} onClick={() => { setActivePage('sports'); setShowFavorites(!showFavorites); setEventView('upcoming') }}><Star size={18}/> {t('favourites')} <span className="rail-count">{favoriteIds.length}</span></button>
          <div className="rail-separator"/>
          <div className="rail-heading">{t("sports_heading")}</div>
          {sports.map((s, i) => <button key={s} onClick={() => { if (s === 'Football') openFootball(); else { setSport(s); setActivePage('sports') } }} className={sport === s && activePage === 'sports' ? 'sport-item chosen' : 'sport-item'}><span className="sport-emoji">{['⚽','🏀','🎾','🏒','🏐'][i]}</span>{s}<span className="sport-chevron">›</span></button>)}
          <div className="rail-promo"><div className="promo-orb"><Sparkles size={20}/></div><b>{t("new_way")}</b><p>{t("sports_reimagined")}</p><span>{t("discover_betnova")} <ArrowRight size={13}/></span></div>
        </aside>}

        <section className="main-content nova-content">
          {activePage === 'sports' && <section className="hero">
            <div className="hero-copy"><div className="eyebrow"><span/> {t("game_starts")} <strong className="hero-bonus-tag"><span className="hero-bonus-amount">100$</span><span className="hero-bonus-copy">WELCOME BONUS · مكافأة ترحيبية</span></strong></div><h1>{t("feel_every")}<br/><em>{t("moment")}</em></h1><p>{t("hero_subtitle")}</p><div className="hero-actions"><button onClick={() => document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })}>{t("explore_events_btn")} <ArrowRight size={16}/></button><span><ShieldCheck size={15}/> {t("safer_experience")}</span></div></div>
            <div className="hero-art nova-hero-scene"><div className="nova-scene-grid"/><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="nova-core"><div className="nova-core-inner">B</div></div><div className="nova-float-card nova-float-live"><span className="live-dot"/> LIVE ARENA <b>01</b></div><div className="nova-float-card nova-float-signal"><Sparkles size={13}/> NEXT LEVEL <b>SPORTS</b></div><div className="nova-scene-spark nova-spark-one">✦</div><div className="nova-scene-spark nova-spark-two">✧</div></div>
            <div className="hero-index">01 <span>/</span> 04</div>
          </section>}


          {activePage === 'sports' && <section className="featured-games-panel" aria-label={language === 'ar' ? 'ألعاب مميزة' : 'Featured games'}>
            <div className="featured-games-heading"><span className="featured-games-live-dot"/><span>{language === 'ar' ? 'ألعاب سريعة' : 'QUICK PLAY'}</span><small>{language === 'ar' ? 'اختر لعبتك' : 'CHOOSE YOUR GAME'}</small></div>
            <div className="featured-games-grid">
              <button type="button" className="featured-game-card featured-crash" onClick={() => openFeaturedGame('crash')}>
                <span className="featured-game-art crash-art" aria-hidden="true"><span className="art-glow"/><svg viewBox="0 0 180 92" role="img"><defs><linearGradient id="crashHull" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#eafff4"/><stop offset=".48" stopColor="#55e6a1"/><stop offset="1" stopColor="#08784d"/></linearGradient><linearGradient id="crashFlame" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#fff7a6"/><stop offset=".45" stopColor="#ffb34e"/><stop offset="1" stopColor="#ff5c43" stopOpacity="0"/></linearGradient></defs><path className="crash-speed" d="M9 28h42M2 39h34M15 50h30" stroke="#9dffd0" strokeWidth="2" strokeLinecap="round" opacity=".55"/><path d="M35 57L72 48 99 20Q105 14 109 20L103 43 151 34Q160 34 165 39L151 47 102 55 90 74 80 76 82 59 54 67Z" fill="url(#crashHull)" stroke="#d9ffec" strokeWidth="1.5"/><path d="M108 21L122 9 127 10 119 39 103 43Z" fill="#dffff0"/><path d="M35 57L10 67 41 65 55 61Z" fill="url(#crashFlame)"/><path d="M89 49L103 45 101 53 88 57Z" fill="#eafff5" opacity=".8"/><circle cx="111" cy="38" r="4" fill="#c9fff0"/><path d="M70 48L82 31 89 31 86 47" fill="#b7f8db"/></svg><span className="art-stamp">x</span></span>
                <span className="featured-game-name">CRASH</span><span className="featured-game-action">{language === 'ar' ? 'العب الآن' : t('play_now')} <ArrowRight size={11}/></span>
              </button>
              <button type="button" className="featured-game-card featured-apple" onClick={() => openFeaturedGame('apple')}>
                <span className="featured-game-art apple-art" aria-hidden="true"><span className="art-glow"/><svg viewBox="0 0 180 92" role="img"><defs><linearGradient id="appleSkin" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#e5ff91"/><stop offset=".35" stopColor="#8ce64c"/><stop offset="1" stopColor="#218b42"/></linearGradient></defs><circle cx="90" cy="48" r="37" fill="#8bff70" opacity=".09"/><path d="M91 28C76 12 51 26 52 49c1 22 19 34 35 29 3-1 6-1 9 0 17 6 34-10 34-31 0-23-23-35-39-19Z" fill="url(#appleSkin)" stroke="#dfffad" strokeWidth="1.5"/><path d="M91 28Q87 16 96 9" fill="none" stroke="#b8f08a" strokeWidth="4" strokeLinecap="round"/><path d="M96 15Q113 3 124 13 113 27 96 21Z" fill="#50d78b" stroke="#b4ffc4" strokeWidth="1.2"/><path d="M66 43Q68 31 80 31" fill="none" stroke="#f5ffd6" strokeWidth="5" strokeLinecap="round" opacity=".7"/><path d="M111 41l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="#f2ffb2" opacity=".85"/></svg><span className="art-stamp">LUCKY</span></span>
                <span className="featured-game-name">APPLE</span><span className="featured-game-action">{t('play_now')} <ArrowRight size={11}/></span>
              </button>
              <button type="button" className="featured-game-card featured-plinko" onClick={() => openFeaturedGame('plinko')}>
                <span className="featured-game-art plinko-art" aria-hidden="true"><span className="art-glow"/><svg viewBox="0 0 180 92" role="img"><defs><linearGradient id="plinkoBall" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff5b4"/><stop offset=".55" stopColor="#ffc75b"/><stop offset="1" stopColor="#e87826"/></linearGradient></defs><path d="M42 15L90 78 138 15" fill="none" stroke="#8ef5d4" strokeWidth="1.5" opacity=".25"/><g fill="#b6ffe8"><circle cx="61" cy="20" r="3"/><circle cx="90" cy="20" r="3"/><circle cx="119" cy="20" r="3"/><circle cx="48" cy="39" r="3"/><circle cx="76" cy="39" r="3"/><circle cx="104" cy="39" r="3"/><circle cx="132" cy="39" r="3"/><circle cx="61" cy="58" r="3"/><circle cx="90" cy="58" r="3"/><circle cx="119" cy="58" r="3"/><circle cx="76" cy="76" r="3"/><circle cx="104" cy="76" r="3"/></g><path d="M90 4Q79 19 88 31T92 55" fill="none" stroke="#ffcf72" strokeWidth="2" strokeDasharray="3 4" opacity=".65"/><circle cx="90" cy="34" r="9" fill="url(#plinkoBall)" stroke="#fff0b5" strokeWidth="1.5"/><circle cx="87" cy="31" r="2.5" fill="#fff" opacity=".8"/><path d="M40 84h100" stroke="#68edba" strokeWidth="4" strokeLinecap="round"/></svg><span className="art-stamp">DROP</span></span>
                <span className="featured-game-name">PLINKO</span><span className="featured-game-action">{t('play_now')} <ArrowRight size={11}/></span>
              </button>
            </div>
          </section>}

          {activePage === 'sports' &&           <div className="quick-stats"><div><span className="stat-icon"><Activity size={17}/></span><span><b>{t("live_energy")}</b><small>{t("follow_action")}</small></span></div><div><span className="stat-icon teal"><Globe2 size={17}/></span><span><b>{t("global_sports")}</b><small>{t("every_corner")}</small></span></div><div><span className="stat-icon lime"><ShieldCheck size={17}/></span><span><b>{t("player_first")}</b><small>{t("safety_design")}</small></span></div></div>}

          {activePage === 'games' ? <><Suspense fallback={<div className="games-loading" role="status">BETNOVA</div>}><GamesHub initialGameRequest={featuredGameRequest} /></Suspense></> : <><section className="events-section" id="events">
            <div className="section-heading"><div><div className="eyebrow dark"><span/> {activePage === 'football' ? (language === 'ar' ? 'جدول كرة القدم' : 'FOOTBALL SCHEDULE') : t("today_lineup")}</div><h2>{activePage === 'football' ? (language === 'ar' ? 'البطولات والمواعيد' : 'Leagues & kick-off times') : showFavorites ? t('your_favourites') : eventView === 'live' ? t('live_events') : eventView === 'results' ? t('latest_results') : t('featured_events_title')} <span className="heading-star">✳</span></h2><p>{activePage === 'football' ? (language === 'ar' ? 'اختر البطولة وحدّد تاريخ ووقت المباراة للبحث عنها.' : 'Choose a competition and set a date and time to find a fixture.') : t("find_moments")}</p></div>{activePage === 'sports' && <button className="view-all" onClick={() => openEventView('upcoming')}>{t("upcoming_schedule")} <ArrowRight size={15}/></button>}</div>
            {activePage === 'sports' && <div className="event-view-tabs" role="tablist" aria-label="Event type">
              <button className={eventView === 'upcoming' ? 'event-view active' : 'event-view'} onClick={() => setEventView('upcoming')}>{t("upcoming")}</button>
              <button className={eventView === 'live' ? 'event-view active' : 'event-view'} onClick={() => setEventView('live')}>{t("live")} <span className="live-dot"/></button>
              <button className={eventView === 'results' ? 'event-view active' : 'event-view'} onClick={() => setEventView('results')}>{t("results")}</button>
            </div>}
            {activePage === 'sports' && <div className="sports-tabs">{sports.map((s,i)=><button key={s} className={sport===s?'tab active-tab':'tab'} onClick={()=>{ if(s === 'Football') openFootball(); else setSport(s) }}><span>{['⚽','🏀','🎾','🏒','🏐'][i]}</span>{s}</button>)}</div>}
            {activePage === 'football' ? <div className="football-search-toolbar"><label className="search-field"><Search size={16}/><input id="match-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={language === 'ar' ? 'ابحث عن دوري أو بطولة...' : 'Search leagues or tournaments...'}/></label><button type="button" className={footballDateFiltersOpen ? 'football-date-toggle active' : 'football-date-toggle'} aria-expanded={footballDateFiltersOpen} onClick={() => setFootballDateFiltersOpen(open => !open)}><CalendarDays size={17}/><span>{language === 'ar' ? 'التاريخ والوقت' : 'Date & time'}</span><span className="football-date-toggle-chevron">{footballDateFiltersOpen ? '−' : '+'}</span></button></div> : <div className="filter-row"><label className="search-field"><Search size={15}/><input id="match-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("search")}/></label></div>}
            {activePage === 'football' && !showFavorites && <div className="competition-browser" aria-label="Browse upcoming competitions">
              <div className="competition-browser-top"><span>{language === 'ar' ? 'البطولات والدوريات' : 'Leagues & tournaments'}</span><small>{competitionOptions.length} {language === 'ar' ? 'بطولة' : 'competitions'} · {matches.length} {language === 'ar' ? 'مباراة' : 'matches'}</small></div>
              {footballDateFiltersOpen && <div className="football-date-panel">
                <div className="football-filter-heading"><span>{language === 'ar' ? 'البحث حسب الموعد' : 'Find by kick-off'}</span><small>{language === 'ar' ? 'حدّد اليوم والوقت' : 'Choose a day and time window'}</small></div>
                <div className="football-date-fields">
                  <label className="football-date-field"><span>{t('match_date')}</span><input aria-label={t('match_date')} type="date" value={selectedMatchDate} onChange={event => setSelectedMatchDate(event.target.value)}/></label>
                  <label className="football-date-field"><span>{t('from_time')}</span><input aria-label={t('from_time')} type="time" value={selectedMatchTime} onChange={event => setSelectedMatchTime(event.target.value)}/></label>
                  <label className="football-date-field"><span>{t('until_time')}</span><input aria-label={t('until_time')} type="time" value={selectedMatchTimeTo} onChange={event => setSelectedMatchTimeTo(event.target.value)}/></label>
                </div>
                <div className="football-date-actions">
                  <button type="button" onClick={() => setSelectedMatchDate(localDateKey(new Date()))}>{language === 'ar' ? 'اليوم' : 'Today'}</button>
                  <button type="button" onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); setSelectedMatchDate(localDateKey(tomorrow)) }}>{language === 'ar' ? 'غدًا' : 'Tomorrow'}</button>
                  <button type="button" className="football-clear-filters" onClick={() => { setSelectedMatchDate(''); setSelectedMatchTime(''); setSelectedMatchTimeTo('') }}>{language === 'ar' ? 'إعادة ضبط' : 'Reset filters'}</button>
                </div>
              </div>}
              <div className="competition-chip-list competition-all-row">
                <button type="button" className={league === 'All matches' ? 'competition-chip selected' : 'competition-chip'} onClick={() => setLeague('All matches')}>{language === 'ar' ? 'كل البطولات' : 'All competitions'} <b>{matches.length}</b></button>
              </div>
              {internationalCompetitions.length > 0 && <section className="competition-group">
                <div className="competition-group-title"><Globe2 size={13}/> {language === 'ar' ? 'بطولات دولية' : 'International competitions'}</div>
                <div className="competition-chip-list">{internationalCompetitions.map(item => <button type="button" key={item.name} title={item.name} className={league === item.name ? 'competition-chip selected international' : 'competition-chip international'} onClick={() => setLeague(item.name)}><span className="competition-chip-flag">{countryFlagForCompetition(item.name, item.country)}</span><span className="competition-chip-name">{item.name}</span><b>{item.count}</b></button>)}</div>
              </section>}
              {competitionOptions.length > 0 && internationalCompetitions.length === 0 && domesticCompetitions.length === 0 && <p className="football-no-competitions">{language === 'ar' ? 'لا توجد بطولة تطابق بحثك.' : 'No competitions match your search.'}</p>}
              {domesticCompetitions.length > 0 && <section className="competition-group">
                <div className="competition-group-title"><Trophy size={13}/> {language === 'ar' ? 'الدوريات والكؤوس المحلية' : 'Domestic leagues & cups'}</div>
                <div className="competition-chip-list">{domesticCompetitions.map(item => <button type="button" key={item.name} title={item.name} className={league === item.name ? 'competition-chip selected' : 'competition-chip'} onClick={() => setLeague(item.name)}><span className="competition-chip-flag">{countryFlagForCompetition(item.name, item.country)}</span><span className="competition-chip-name">{item.name}</span><b>{item.count}</b></button>)}</div>
              </section>}
            </div>}
            <div className="match-list">
              {loadingMatches ? <div className="empty-state">{sport} · {t('loading_events')}</div> : matchLoadError ? <div className="empty-state">{t('sports_data_error')}</div> : visibleMatches.length ? visibleMatches.map(match=><article className="match-card" key={match.id} role="button" tabIndex={0} aria-label={`${match.home} vs ${match.away} — ${t("match_details")}`} onClick={() => openOverlay('matchDetails', { betnovaDetailMatch: match })} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openOverlay('matchDetails', { betnovaDetailMatch: match }) } }}>
                <div className="match-meta"><span className="league-name"><span className="league-country-flag" aria-label={match.country ? `Competition country: ${match.country}` : "International competition"}>{match.countryFlag}</span><span className="league-full-name">{match.league}</span></span><span className="match-time">{eventView === 'results' ? <><Trophy size={13}/>{match.score ?? t('score_unavailable')}</> : <><Clock3 size={13}/>{match.time}</>}<span className="match-date"><span aria-hidden="true">·</span>{match.dateLabel ?? ""}</span></span></div>
                <div className="match-body"><div className="teams team-matchup"><div className="team team-home"><span className="team-logo-frame">{match.homeLogo ? <img className="team-logo-image" src={match.homeLogo} alt={`${match.home} club crest`} loading="lazy" onError={event => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.querySelector(".team-logo-fallback")?.classList.add("is-visible") }}/> : null}<span className={match.homeLogo ? "team-logo-fallback" : "team-logo-fallback is-visible"} aria-label={`${match.home} initials`}>{match.homeMark}</span></span><b title={match.home}>{match.home}</b></div><span className="versus-group"><span className="versus">VS</span>{eventView !== 'results' && <span className="odds-caption">{match.oddsCaption} <CircleHelp size={12}/></span>}</span><div className="team team-away"><span className="team-logo-frame">{match.awayLogo ? <img className="team-logo-image" src={match.awayLogo} alt={`${match.away} club crest`} loading="lazy" onError={event => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.querySelector(".team-logo-fallback")?.classList.add("is-visible") }}/> : null}<span className={match.awayLogo ? "team-logo-fallback" : "team-logo-fallback is-visible"} aria-label={`${match.away} initials`}>{match.awayMark}</span></span><b title={match.away}>{match.away}</b></div></div>{eventView === 'results' ? <div className="result-label">FULL TIME</div> : match.winnerPicks.some(Boolean) ? <div className="odds-area"><div className="odds-grid">{match.odds.map((odd,i)=>{const pick=match.winnerPicks[i];if(!pick)return null;const picked=!!pick&&selected.some(item=>item.selectionId===pick.selectionId);return <button type="button" key={i} disabled={!pick} aria-pressed={picked} onClick={event=>{event.stopPropagation();if(pick)toggleMarketSelection(match,pick)}} className={picked?'odd picked':'odd'}><small>{match.oddsLabels[i] ?? ['Win 1','Draw','Win 2'][i]}</small><b>{odd}</b></button>})}</div></div> : null}</div>
                <div className="match-footer"><button className="favorite-toggle" onClick={event => { event.stopPropagation(); toggleFavorite(match.id) }}><Star size={13} fill={favoriteIds.includes(String(match.id)) ? 'currentColor' : 'none'}/>{favoriteIds.includes(String(match.id)) ? t('saved') : t('add_favourites')}</button><button className="details-trigger" onClick={event => { event.stopPropagation(); openOverlay('matchDetails', { betnovaDetailMatch: match }) }}>{language === 'ar' ? 'تفاصيل' : 'Details'} <ArrowRight size={13}/></button></div>
                {typeof match.id === 'string' && <div className="match-card-markets" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><MatchMarkets fixtureId={match.id} live={match.status === 'live'} deferLoad selectedIds={selected.map(item => item.selectionId)} onSelect={selection => toggleMarketSelection(match, selection)} /></div>}
              </article>) : <div className="empty-state">{query ? t('empty_search') : sport === 'Football' ? eventView === 'live' ? t('empty_live') : eventView === 'results' ? t('empty_results') : t('empty_football') : t('empty_sport')}</div>}
            </div>
            {!loadingMatches && !matchLoadError && filteredMatches.length > visibleMatches.length && <button className="load-more-matches" type="button" onClick={() => setVisibleMatchLimit(current => Math.min(current + 40, filteredMatches.length))}>Load more matches · {filteredMatches.length - visibleMatches.length} remaining</button>}
            {activePage !== 'football' && <div className="demo-note"><ShieldCheck size={15}/><span>{usingDemoData ? t('preview_note') : eventView === 'results' ? t('final_scores_note') : t('fixtures_note')}</span></div>}
          </section></>}
        </section>

        {activePage !== 'football' && <aside className="right-rail">
          <div className="slip-card"><div className="slip-head"><div><span className="eyebrow dark">{t('your_picks')}</span><h3>{t('bet_slip')} <span>{selected.length}</span></h3></div><button className="slip-clear" onClick={()=>setSelected([])}>{t("clear")}</button></div>
            {selected.length ? <div className="slip-selections">{selected.map(s=><div className="slip-selection" key={s.selectionId}><div><b>{s.match.home} – {s.match.away}</b><small>{s.label} · {s.match.league}</small></div><strong>{s.odd}</strong><button onClick={()=>setSelected(current=>current.filter(x=>x.selectionId!==s.selectionId))}><X size={14}/></button></div>)}</div> : <div className="slip-empty"><div className="slip-empty-icon"><ArrowDownUp size={22}/></div><b>{t("slip_waiting")}</b><p>{t("select_price")}</p></div>}
            {userEmail ? <div className="bet-slip-stake"><label>Stake · DZD<input type="number" min="0.01" step="0.01" inputMode="decimal" value={betStake} onChange={event=>setBetStake(event.target.value)} placeholder={t("enter_stake")}/></label><div><span>{t('potential_return')}</span><b>{(Math.max(0,Number(betStake)||0)*selected.reduce((total,item)=>total*Number(item.odd),1)).toFixed(2)} DZD</b></div><small className="slip-balance-line">Available balance: {walletBalance.toFixed(2)} DZD</small></div> : <p className="guest-slip-note">{t('guest_signin_note')}</p>}
            {betMessage && <p className="bet-slip-message">{betMessage}</p>}
            <button className="slip-cta" onClick={()=>void placeBet()} disabled={!selected.length||betBusy||(!!userEmail&&!betStake)}>{betBusy ? t('placing_bet') : t('place_bet_action')} <ArrowRight size={15}/></button>
          </div>
          <div className="help-card" id="help"><div className="help-icon"><CircleHelp size={18}/></div><div><b>{t('help_support')}</b><p>{t('help_center_hint')}</p><button type="button" onClick={openSupport}>{t('help_support')} <ArrowRight size={13}/></button></div></div>
          <div className="responsible-card" id="responsible"><div className="responsible-icon"><ShieldCheck size={18}/></div><div><b>{t('play_with_awareness')}</b><p>{t('responsible_card_desc')}</p><a href="#responsible">{t('learn_more')}</a></div></div>
        </aside>}
      </main>

      <nav className="mobile-nav"><button className={activePage === 'football' ? 'mobile-active' : ''} onClick={openFootball}><Trophy size={19}/>{t('football')}</button><button onClick={() => { setActivePage('sports'); openEventView('live') }}><Activity size={19}/>{t("live")}</button><button onClick={()=>openOverlay('bets')}><Activity size={19}/>{t("my_bets")}</button><button onClick={() => { setActivePage('sports'); setShowFavorites(true); setEventView('upcoming'); document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' }) }}><Star size={19}/>{t("favourites")}</button><button onClick={() => openOverlay('mobileMore')}><Menu size={19}/>{t("menu")}</button></nav>
      {mobileMoreOpen && <div className="mobile-more-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeOverlay('mobileMore') }}>
        <section className="mobile-more-panel" role="dialog" aria-modal="true" aria-label={t("menu")}>
          <div className="mobile-more-header"><div><b>BETNOVA</b><small>{t("menu")}</small></div><button className="icon-btn" onClick={() => closeOverlay('mobileMore')} aria-label={t("close")}><X size={18}/></button></div>
          <div className="mobile-more-language"><Globe2 size={16}/><span>{t("language")}</span><select value={language} onChange={event => setLanguage(event.target.value as typeof language)}>{languages.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></div>
          <button onClick={() => { closeMobileMenuToPage(); openFootball() }}><Trophy size={17}/>{t('football')}</button>
          <button onClick={() => { closeMobileMenuToPage(); openGames() }}><Sparkles size={17}/>{language === 'ar' ? 'الألعاب والترفيه' : 'Games & Arcade'}</button>
          <button onClick={() => { closeMobileMenuToPage(); setActivePage('sports'); openEventView("results") }}><Clock3 size={17}/>{t("results")}</button>
          <button onClick={openSupport}><CircleHelp size={17}/>{t('help_support')}</button>
          <button onClick={openResponsible}><ShieldCheck size={17}/>{t('responsible_play')}</button>
          {userEmail ? <>
            <button className="mobile-account-entry" onClick={() => { openOverlay('account') }}><UserRound size={18}/>{t("my_account")}<span>›</span></button>
            <button onClick={() => openWallet('deposit')}><Wallet size={17}/>{t('deposit')}</button>
            <button onClick={() => { closeMobileMenuToPage(); openOverlay('mobileSlip') }}><Wallet size={17}/>{t("bet_slip")} {selected.length>0&&<i>{selected.length}</i>}</button>
            <button onClick={() => { openOverlay('notifications') }}><Bell size={17}/>{t("notifications")}</button>
              {isAdminUser && <button onClick={() => { openOverlay('admin') }}><ShieldCheck size={17}/>{t("admin")}</button>}
            <button onClick={() => { closeOverlay('mobileMore'); void signOutCurrentUser() }}><ArrowRight size={17}/>{t("signout")}</button>
          </> : <>
            <button onClick={() => { setAuthMode("login"); openOverlay('auth') }}><ArrowRight size={17}/>{t("login")}</button>
            <button onClick={() => { setAuthMode("signup"); openOverlay('auth') }}><ShieldCheck size={17}/>{t("join")}</button>
          </>}
          <button onClick={() => { openOverlay('settings') }}><Settings size={17}/>{t("settings")}</button>
          </section>
      </div>}
      {notificationsOpen && <div className="notification-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeOverlay('notifications') }}>
        <section className="notification-panel" role="dialog" aria-modal="true" aria-label={t("notifications")}>
          <div className="mobile-more-header"><b>{t("notifications")}</b><button className="icon-btn" onClick={() => closeOverlay('notifications')} aria-label={t("close")}><X size={18}/></button></div>
          <div className="notification-empty"><Bell size={24}/><b>{t("no_notifications")}</b><span>{t("notifications_hint")}</span></div>
          <button className="slip-cta" onClick={() => closeOverlay('notifications')}>{t("close")}</button>
        </section>
      </div>}
      {mobileSlip && <div className="mobile-sheet-backdrop" role="presentation" onClick={()=>closeOverlay('mobileSlip')}><section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={t('bet_slip')} onClick={e=>e.stopPropagation()}>
        <header className="mobile-slip-header">
          <div className="mobile-slip-brand"><span className="mobile-slip-brand-mark">B</span><div><small>BETNOVA · SPORTS</small><h2>{t('bet_slip')}</h2></div></div>
          <div className="mobile-slip-header-actions"><span className="mobile-slip-count">{selected.length} PICKS</span><button type="button" className="mobile-slip-close" onClick={()=>closeOverlay('mobileSlip')} aria-label={t('close')}><X size={21}/></button></div>
        </header>
        <div className="mobile-slip-content">
          <div className="mobile-slip-section-title"><span>{t('your_picks')}</span><button type="button" onClick={()=>{setSelected([]);setBetMessage('')}} disabled={!selected.length}>{t('clear')}</button></div>
          {selected.length ? <div className="mobile-slip-selections">{selected.map((item,index)=><article className="mobile-slip-selection" key={item.selectionId}>
            <div className="mobile-slip-selection-top"><span className="mobile-slip-index">{String(index+1).padStart(2,'0')}</span><b>{item.match.home} <i>vs</i> {item.match.away}</b><button type="button" onClick={()=>setSelected(current=>current.filter(pick=>pick.selectionId!==item.selectionId))} aria-label="Remove selection"><X size={17}/></button></div>
            <div className="mobile-slip-selection-details"><span>{item.match.league}</span><strong>{item.label}</strong><b>@ {Number(item.odd).toFixed(2)}</b></div>
          </article>)}</div> : <div className="mobile-slip-empty"><div className="mobile-slip-empty-icon"><ArrowDownUp size={25}/></div><b>{t('slip_waiting')}</b><p>{t('select_price')}</p></div>}
          {selected.length>0 && <>
            <div className="mobile-slip-summary">
              <div><span>Total selections</span><b>{selected.length}</b></div>
              <div><span>Combined odds</span><b>{hasSameMatchBuilder ? '—' : selected.reduce((total,item)=>total*Number(item.odd),1).toFixed(2)}</b></div>
              <div><span>Wallet balance</span><b>{walletBalance.toFixed(2)} DZD</b></div>
            </div>
            {userEmail ? <div className="mobile-slip-stake-card">
              <label htmlFor="mobile-slip-stake">Stake amount <span>DZD</span></label>
              <input id="mobile-slip-stake" type="number" min="0.01" step="0.01" inputMode="decimal" value={betStake} onChange={event=>setBetStake(event.target.value)} placeholder={t('enter_stake')}/>
              <div className="mobile-slip-return"><span>Potential return</span><strong>{(Math.max(0,Number(betStake)||0)*selected.reduce((total,item)=>total*Number(item.odd),1)).toFixed(2)} DZD</strong></div>
            </div> : <p className="guest-slip-note">{t('guest_signin_note')}</p>}
          </>}
          {betMessage&&<p className="bet-slip-message" role="status">{betMessage}</p>}
        </div>
        <footer className="mobile-slip-footer">
          <button type="button" className="mobile-slip-place" onClick={()=>void placeBet()} disabled={!selected.length||betBusy||!userEmail||!betStake||hasSameMatchBuilder}>
            {betBusy ? t('placing_bet') : t('place_bet_action')} <span>{betBusy ? '…' : '→'}</span>
          </button>
          <small>All stakes are charged in DZD. Odds are revalidated before confirmation.</small>
        </footer>
      </section></div>}
      {detailMatch && <div className="detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeOverlay('matchDetails') }}><section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="detail-close" onClick={() => closeOverlay('matchDetails')} aria-label="Close match details"><X size={19}/></button><div className="detail-kicker">BETNOVA · MATCH CENTER</div><div className="detail-league">{detailMatch.league}{detailMatch.country ? ` · ${detailMatch.country}` : ''}</div><h2 id="detail-title">{t('match_details')}</h2><div className="detail-teams"><div><span className="detail-mark team-crest">{detailMatch.homeLogo && <img src={detailMatch.homeLogo} alt="" onError={event => { event.currentTarget.style.display = "none" }}/>}<span>{detailMatch.homeMark}</span></span><b>{detailMatch.home}</b></div><span className="detail-versus">{detailMatch.score ?? 'VS'}</span><div><span className="detail-mark team-crest">{detailMatch.awayLogo && <img src={detailMatch.awayLogo} alt="" onError={event => { event.currentTarget.style.display = "none" }}/>}<span>{detailMatch.awayMark}</span></span><b>{detailMatch.away}</b></div></div><div className="detail-winner-odds" aria-label="Match winner odds">{[0,1,2].map(i=>{const pick=detailMatch.winnerPicks[i];const picked=!!pick&&selected.some(item=>item.selectionId===pick.selectionId);return <button type="button" key={i} disabled={!pick} aria-pressed={picked} className={picked?'detail-winner-pick picked':'detail-winner-pick'} onClick={()=>pick&&toggleMarketSelection(detailMatch,pick)}><span>{['Win 1','Draw','Win 2'][i]}</span><b>{pick?.odds ?? '—'}</b></button>})}</div><div className="detail-info-grid"><div><small>{detailMatch.status === 'finished' ? 'MATCH STATUS' : detailMatch.status === 'live' ? 'MATCH STATUS' : 'KICK-OFF'}</small><b>{detailMatch.status === 'finished' ? 'Full time' : detailMatch.status === 'live' ? 'Live now' : detailMatch.kickoff ?? detailMatch.time}</b></div><div><small>COMPETITION</small><b>{detailMatch.league}</b></div><div><small>COUNTRY</small><b>{detailMatch.country || 'Not specified'}</b></div><div><small>RESULT</small><b>{detailMatch.score ?? 'Not available yet'}</b></div></div>{typeof detailMatch.id === 'string' && !usingDemoData && <MatchNotificationFollow fixtureId={detailMatch.id} homeName={detailMatch.home} awayName={detailMatch.away} language={language} />}{detailMatch.status === 'live' && typeof detailMatch.id === 'string' && <MatchStatistics fixtureId={detailMatch.id} />}<div className="detail-market-heading"><div><span className="eyebrow dark">EXPLORE THE ODDS</span><h3>{t('markets')}</h3></div><span>{detailMatch.status === 'live' ? 'LIVE EVENT' : 'PRE-MATCH'}</span></div>{detailMatch.winnerPicks.some(pick => pick?.isDemo) ? <div className="markets-empty">BETNOVA ESTIMATE · Practice mode. Cash betting is unavailable for this event.</div> : usingDemoData || typeof detailMatch.id !== 'string' ? <div className="markets-empty">Sample fixture preview only. Verified markets are unavailable for this event.</div> : <MatchMarkets fixtureId={detailMatch.id} live={detailMatch.status === 'live'} deferLoad selectedIds={selected.map(item => item.selectionId)} onSelect={selection => { if (detailMatch) toggleMarketSelection(detailMatch, selection) }} />}</section></div>}
      {selected.length > 0 && (() => {
        const combinedOdds = hasSameMatchBuilder ? null : selected.reduce((total, item) => total * Number(item.odd), 1)
        const potentialReturn = combinedOdds === null ? null : Math.max(0, Number(betStake) || 0) * combinedOdds
        return <div className="quick-slip-bar" role="status" aria-live="polite">
          <div className="quick-slip-status"><span className="quick-slip-check">✓</span><div><b>{t('added_to_bet_slip')}</b><small>{selected.length} / 20 selections · {hasSameMatchBuilder ? 'Bet Builder · max 2 per match' : 'Accumulator selections'}</small></div></div>
          <div className="quick-slip-picks" aria-label="Current bet selections">
            {selected.map(item => <div className="quick-slip-pick" key={item.selectionId}>
              <span>{item.match.home} – {item.match.away}</span><small>{item.label}</small><b>@ {item.odd}</b>
              <button type="button" aria-label="Remove selection" onClick={() => setSelected(current => current.filter(pick => pick.selectionId !== item.selectionId))}><X size={12}/></button>
            </div>)}
          </div>
          <div className="quick-slip-stake">
            <label>Stake (DZD)<input type="number" min="0.01" step="0.01" inputMode="decimal" value={betStake} onChange={event => setBetStake(event.target.value)} placeholder="Enter amount"/></label>
            <div>{combinedOdds === null ? <><small>Bet Builder</small><b>Combined price pending</b><small>Potential return unavailable</small></> : <><small>Total odds</small><b>{combinedOdds.toFixed(2)}</b><small>Potential return</small><strong>{potentialReturn!.toFixed(2)} DZD</strong></>}</div>
          </div>
          <div className="quick-slip-actions"><button type="button" className="quick-slip-clear" onClick={() => { if (window.confirm("Clear all selections from your bet slip?")) { setSelected([]); setBetMessage(""); } }}>{t('clear_all')}</button><button type="button" className="quick-slip-open" onClick={() => openOverlay('mobileSlip')}>{t('view_bet_slip')} <ArrowRight size={15}/></button></div>
        </div>
      })()}
      {adminOpen && <AdminOverview onClose={() => closeOverlay('admin')} />}
      {supportOpen && <SupportCenter onClose={() => closeOverlay('support')} userEmail={userEmail} />}
      {responsibleOpen && <ResponsiblePlay onClose={() => closeOverlay('responsible')} userEmail={userEmail} language={language} />}
      {accountOpen && <AccountPanel onClose={() => closeOverlay('account')} onSignOut={() => { closeOverlay('account'); void signOutCurrentUser() }} onOpenWallet={openWallet} />}
      {settingsOpen && <div className="settings-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeOverlay('settings') }}><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="settings-close" onClick={() => closeOverlay('settings')} aria-label={t('close')}><X size={19}/></button><div className="settings-kicker"><Settings size={15}/> BETNOVA · PREFERENCES</div><h2 id="settings-title">{t('settings')}</h2><p>{t('settings_description')}</p><label><span><Globe2 size={16}/> {t('language')}</span><select value={language} onChange={event => setLanguage(event.target.value as typeof language)}>{languages.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label><span><Wallet size={16}/> {t('preferred_currency')}</span><select value={betCurrency} onChange={event => setBetCurrency(event.target.value)}><option value="DZD">DZD · Algerian dinar</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option></select></label><NotificationSettings language={language} /><div className="settings-note"><ShieldCheck size={16}/> {t('settings_note')}</div><button className="settings-done" onClick={() => closeOverlay('settings')}>{t('done_action')} <ArrowRight size={15}/></button></section></div>}
      {walletOpen && <WalletPanel onClose={() => closeOverlay('wallet')} initialTab={walletInitialTab} />}
      {betsOpen && <MyBetsPanel onClose={() => closeOverlay('bets')} />}
      <AuthPanel open={authOpen} mode={authMode} onClose={() => closeOverlay('auth')} onModeChange={setAuthMode} />
      {(activePage !== 'sports' || (Array.isArray(window.history.state?.betnovaOverlays) && window.history.state.betnovaOverlays.length > 0)) && !(Array.isArray(window.history.state?.betnovaOverlays) && window.history.state.betnovaOverlays.includes('mobileSlip')) && <button type="button" className="global-home-button" onClick={goHome} aria-label={t('home_label')}><Home size={17}/> {t('home_label')}</button>}
      <footer className="footer"><span>© 2026 BETNOVA</span><span>A NEW WORLD OF SPORTS</span><span>Designed for the next generation <span className="footer-star">✳</span></span></footer>
    </div>
  )
}