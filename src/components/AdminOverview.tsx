import { useEffect, useState } from 'react'
import { Activity, CalendarDays, ShieldCheck, Trophy, Users, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Props = { onClose: () => void }
type Counts = { sports: number; competitions: number; teams: number; fixtures: number; markets: number }

export default function AdminOverview({ onClose }: Props) {
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      const client = supabase
      if (!client) { if (active) { setError('Supabase is not configured.'); setChecking(false) }; return }
      try {
        const { data: { user }, error: userError } = await client.auth.getUser()
        if (userError) throw userError
        if (!user) { if (active) { setIsAdmin(false); setChecking(false) }; return }
        const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle()
        if (profileError) throw profileError
        if (!active) return
        const allowed = profile?.role === 'admin'
        setIsAdmin(allowed)
        if (!allowed) { setChecking(false); return }
        const names = ['sports', 'competitions', 'teams', 'fixtures', 'markets'] as const
        const results = await Promise.all(names.map(name => client.from(name).select('id', { count: 'exact', head: true })))
        const failed = results.find(result => result.error)
        if (failed?.error) throw failed.error
        if (active) setCounts({
          sports: results[0].count ?? 0,
          competitions: results[1].count ?? 0,
          teams: results[2].count ?? 0,
          fixtures: results[3].count ?? 0,
          markets: results[4].count ?? 0,
        })
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load the admin overview.')
      } finally { if (active) setChecking(false) }
    }
    void load()
    return () => { active = false }
  }, [])

  return <div className="admin-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="admin-panel" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <button className="admin-close" onClick={onClose} aria-label="Close admin overview"><X size={19}/></button>
      <div className="admin-kicker"><ShieldCheck size={14}/> BETNOVA CONTROL CENTER</div>
      <h2 id="admin-title">Administration</h2>
      {checking ? <p className="admin-message">Verifying your administrator access…</p> :
        error ? <p className="admin-message error">{error}</p> :
        !isAdmin ? <p className="admin-message">This account does not have administrator permissions.</p> :
        <><p className="admin-intro">Read-only system overview. Database write permissions are now protected by administrator-only policies; management controls will be enabled here after the workflows are completed and tested.</p>
          <div className="admin-count-grid">
            <div><Activity size={17}/><b>{counts?.sports ?? '—'}</b><span>Sports</span></div>
            <div><Trophy size={17}/><b>{counts?.competitions ?? '—'}</b><span>Competitions</span></div>
            <div><Users size={17}/><b>{counts?.teams ?? '—'}</b><span>Teams</span></div>
            <div><CalendarDays size={17}/><b>{counts?.fixtures ?? '—'}</b><span>Fixtures</span></div>
          </div>
          <div className="admin-market-row"><span>Markets configured</span><b>{counts?.markets ?? '—'}</b></div>
          <div className="admin-safety-note"><ShieldCheck size={15}/> No roles, match results, odds, or financial records can be changed from this overview.</div>
        </>}
    </section>
  </div>
}
