import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Plus, RefreshCw, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Currency = 'DZD' | 'USD' | 'EUR'
type Summary = { currency: Currency; settled_wager_margin: number; bonus_costs: number; operating_expenses: number; net_profit: number; paid_owner_withdrawals: number; pending_owner_withdrawals: number; available_profit: number }
type Withdrawal = { id: string; payment_method: string; amount: number; currency: Currency; destination_details: string; status: string; created_at: string }

const money = (value: number, currency: Currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value)
const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--admin-border, #344054)', background: 'var(--admin-input, #101828)', color: 'inherit' }
const labelStyle: React.CSSProperties = { display: 'block', marginTop: 12, fontSize: 13, fontWeight: 600 }

export default function OwnerProfitPanel() {
  const [summary, setSummary] = useState<Summary[]>([])
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [currency, setCurrency] = useState<Currency>('DZD')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Operating expense')
  const [description, setDescription] = useState('')
  const [method, setMethod] = useState('baridimob')
  const [destination, setDestination] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [references, setReferences] = useState<Record<string,string>>({})

  const refresh = useCallback(async () => {
    if (!supabase) return
    setError('')
    const [dashboard, requests] = await Promise.all([
      supabase.rpc('betnova_owner_profit_dashboard'),
      supabase.from('owner_profit_withdrawal_requests').select('id,payment_method,amount,currency,destination_details,status,created_at').order('created_at',{ascending:false}).limit(50)
    ])
    if (dashboard.error) throw dashboard.error
    if (requests.error) throw requests.error
    setSummary((dashboard.data?.currencies ?? []) as Summary[])
    setWithdrawals((requests.data ?? []) as Withdrawal[])
  }, [])

  useEffect(() => { void refresh().catch(e => setError(e instanceof Error ? e.message : 'Could not load owner profit.')) }, [refresh])

  async function addExpense() {
    if (!supabase) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: e } = await supabase.rpc('betnova_owner_add_expense', { p_currency: currency, p_amount: Number(amount), p_category: category.trim(), p_description: description.trim(), p_incurred_at: null })
      if (e) throw e
      setAmount(''); setDescription(''); setNotice('Operating expense recorded.')
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record expense.') }
    finally { setBusy(false) }
  }

  async function requestWithdrawal() {
    if (!supabase) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: e } = await supabase.rpc('betnova_owner_request_profit_withdrawal', { p_payment_method: method, p_amount: Number(amount), p_currency: currency, p_destination_details: destination.trim() })
      if (e) throw e
      setAmount(''); setDestination(''); setNotice('Owner profit withdrawal request created. Transfer is still manual.')
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create withdrawal request.') }
    finally { setBusy(false) }
  }

  async function review(item: Withdrawal, action: 'paid' | 'reject') {
    if (!supabase) return
    if (action === 'paid' && (references[item.id] ?? '').trim().length < 4) { setError('Enter the external transfer reference first.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: e } = await supabase.rpc('betnova_owner_review_profit_withdrawal', { p_request_id: item.id, p_action: action, p_payout_reference: action === 'paid' ? references[item.id].trim() : null })
      if (e) throw e
      setNotice(action === 'paid' ? 'Withdrawal marked paid. Confirm that you completed the external transfer.' : 'Withdrawal rejected.')
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not review withdrawal.') }
    finally { setBusy(false) }
  }

  return <div className="admin-finance-list">
    <article className="admin-finance-item">
      <div className="admin-finance-top"><b>Owner profit · 100% share</b><button onClick={() => void refresh().catch(e => setError(e.message))}><RefreshCw size={14}/> Refresh</button></div>
      <p>Calculated from settled customer bets and games only. Deposits, admin credits, unsettled bets and admin test activity are excluded.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}>
        {summary.map(row => <div key={row.currency} style={{border:'1px solid var(--admin-border, #344054)',borderRadius:12,padding:12}}>
          <b>{row.currency}</b>
          <div style={{fontSize:22,fontWeight:800,margin:'8px 0'}}>{money(row.available_profit,row.currency)}</div>
          <small>Available to request</small>
          <div style={{marginTop:10,fontSize:12,lineHeight:1.8}}>
            <div>Settled wager margin: {money(row.settled_wager_margin,row.currency)}</div>
            <div>Bonuses: −{money(row.bonus_costs,row.currency)}</div>
            <div>Expenses: −{money(row.operating_expenses,row.currency)}</div>
            <div>Net profit: {money(row.net_profit,row.currency)}</div>
            <div>Paid withdrawals: {money(row.paid_owner_withdrawals,row.currency)}</div>
            <div>Pending withdrawals: {money(row.pending_owner_withdrawals,row.currency)}</div>
          </div>
        </div>)}
      </div>
      <small style={{display:'block',marginTop:12,opacity:.8}}>100% of positive net profit only. Negative results are not converted into a withdrawable balance.</small>
    </article>

    <article className="admin-finance-item">
      <div className="admin-finance-top"><b>Record operating expense</b><span>Reduces net profit</span></div>
      <label style={labelStyle}>Currency<select style={fieldStyle} value={currency} onChange={e=>setCurrency(e.target.value as Currency)}><option>DZD</option><option>USD</option><option>EUR</option></select></label>
      <label style={labelStyle}>Amount<input style={fieldStyle} type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Expense amount"/></label>
      <label style={labelStyle}>Category<input style={fieldStyle} value={category} onChange={e=>setCategory(e.target.value)} maxLength={80}/></label>
      <label style={labelStyle}>Description<input style={fieldStyle} value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} placeholder="What was this expense for?"/></label>
      <div className="admin-finance-actions"><button disabled={busy || !amount || !description.trim()} onClick={()=>void addExpense()}><Plus size={14}/> Save expense</button></div>
    </article>

    <article className="admin-finance-item">
      <div className="admin-finance-top"><b>Withdraw owner profit</b><Wallet size={16}/></div>
      <label style={labelStyle}>Currency<select style={fieldStyle} value={currency} onChange={e=>setCurrency(e.target.value as Currency)}><option>DZD</option><option>USD</option><option>EUR</option></select></label>
      <label style={labelStyle}>Amount<input style={fieldStyle} type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Amount to withdraw"/></label>
      <label style={labelStyle}>Payment method<select style={fieldStyle} value={method} onChange={e=>setMethod(e.target.value)}><option value="baridimob">BaridiMob</option><option value="binance">Binance</option><option value="redotpay">RedotPay</option><option value="paysera">Paysera</option></select></label>
      <label style={labelStyle}>Receiving account / destination<input style={fieldStyle} value={destination} onChange={e=>setDestination(e.target.value)} maxLength={1000} placeholder="Enter receiving details"/></label>
      <div className="admin-finance-actions"><button disabled={busy || !amount || destination.trim().length<4} onClick={()=>void requestWithdrawal()}><Wallet size={14}/> Request withdrawal</button></div>
      <small>Requests reserve the calculated profit against another request. You must complete the external transfer yourself and then record its reference below.</small>
    </article>

    <article className="admin-finance-item">
      <div className="admin-finance-top"><b>Owner withdrawal history</b><span>{withdrawals.length} records</span></div>
      {withdrawals.length===0 ? <p className="admin-message">No owner profit withdrawals yet.</p> : withdrawals.map(item=><div key={item.id} style={{borderTop:'1px solid var(--admin-border, #344054)',padding:'12px 0'}}>
        <div className="admin-finance-top"><b>{money(Number(item.amount),item.currency)} · {item.payment_method.toUpperCase()}</b><span>{item.status.toUpperCase()}</span></div>
        <small>{new Date(item.created_at).toLocaleString()} · {item.destination_details}</small>
        {item.status==='pending' && <>
          <label style={labelStyle}>External transfer reference<input style={fieldStyle} value={references[item.id]??''} onChange={e=>setReferences(v=>({...v,[item.id]:e.target.value}))} placeholder="Transfer reference"/></label>
          <div className="admin-finance-actions"><button disabled={busy || (references[item.id]??'').trim().length<4} onClick={()=>void review(item,'paid')}><CheckCircle2 size={14}/> Mark paid</button><button className="reject" disabled={busy} onClick={()=>void review(item,'reject')}>Reject request</button></div>
        </>}
      </div>)}
    </article>
    {error && <p className="admin-message error">{error}</p>}
    {notice && <p className="admin-message success">{notice}</p>}
  </div>
}
