import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits, type Address, type Hash } from 'viem'
import { loadConfig, readClient, type Config, type Provider } from './config'
import { message, PAGE_SIZE, snapshot, switchChain, transact, type Action, type Snapshot } from './chain'
import './styles.css'

declare global { interface Window { ethereum?: Provider } }
type WalletChoice = { id: string; name: string; provider: Provider }
function useWallets() {
  const [wallets, setWallets] = useState<WalletChoice[]>(() => window.ethereum ? [{ id: 'injected', name: 'Browser wallet', provider: window.ethereum }] : [])
  useEffect(() => {
    const announce = (event: Event) => {
      const { info, provider } = (event as CustomEvent<{ info: { uuid: string; name: string }; provider: Provider }>).detail
      if (!info?.uuid || !provider?.request) return
      setWallets(current => [...current.filter(w => w.id !== info.uuid && w.provider !== provider), { id: info.uuid, name: info.name, provider }])
    }
    window.addEventListener('eip6963:announceProvider', announce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    return () => window.removeEventListener('eip6963:announceProvider', announce)
  }, [])
  return wallets
}
function units(value: bigint, decimals: number, compact = false) {
  const exact = formatUnits(value, decimals)
  if (!compact) { const [whole, fraction] = exact.split('.'); return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '') }
  return new Intl.NumberFormat('en', { maximumFractionDigits: 4 }).format(Number(exact))
}
function date(value: bigint) {
  return value === 0n ? 'No membership yet' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Number(value) * 1000)) + ' UTC'
}
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
function Mark() {
  return <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><path d="M20 2 37 12v16L20 38 3 28V12Z" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="m12 15 8-5 8 5v5h-8v5h8l-8 5-8-5Z" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
}
function AddressLink({ address, config, label }: { address: Address; config: Config; label?: string }) {
  return <a className="address" href={`${config.deployment.network.explorer}/address/${address}`} target="_blank" rel="noreferrer" aria-label={`${label || 'View address'} ${address} on the block explorer`}><bdi>{address}</bdi><span aria-hidden="true"> ↗</span></a>
}
function Guild({ config }: { config: Config }) {
  const wallets = useWallets()
  const [walletId, setWalletId] = useState('')
  const provider = (wallets.find(w => w.id === walletId) || wallets[0])?.provider
  const [account, setAccount] = useState<Address>()
  const [walletChain, setWalletChain] = useState<number>()
  const [connecting, setConnecting] = useState(false)
  const [walletError, setWalletError] = useState('')
  const [data, setData] = useState<Snapshot>()
  const [readError, setReadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0n)
  const [periods, setPeriods] = useState(1)
  const [busy, setBusy] = useState<Action>()
  const [txStatus, setTxStatus] = useState('')
  const [txError, setTxError] = useState('')
  const [txHash, setTxHash] = useState<Hash>()
  const [clock, setClock] = useState(Date.now())
  const request = useRef(0)
  const activeWallet = useRef('')
  activeWallet.current = `${account}:${walletChain}`
  const client = useMemo(() => readClient(config, walletChain === config.chain.id ? provider : undefined), [config, provider, walletChain])
  const refresh = useCallback(async () => {
    const id = ++request.current
    setLoading(true)
    setReadError('')
    try {
      const result = await snapshot(config, client, account, offset)
      if (request.current === id) setData(result)
    } catch (error) {
      if (request.current === id) { setData(undefined); setReadError(message(error)) }
    } finally { if (request.current === id) setLoading(false) }
  }, [config, client, account, offset])
  useEffect(() => {
    setData(undefined)
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    return () => { request.current++; window.clearInterval(timer) }
  }, [refresh])
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    setAccount(undefined)
    setWalletChain(undefined)
    if (!provider) return
    let alive = true
    const invalidate = () => { request.current++; setData(undefined) }
    const accountsChanged = (accounts: string[]) => { invalidate(); setAccount(accounts[0] as Address | undefined); setWalletError('') }
    const chainChanged = (chain: string) => { invalidate(); setWalletChain(Number(chain)); setWalletError('') }
    const disconnected = () => { invalidate(); setAccount(undefined); setWalletChain(undefined) }
    provider.on?.('accountsChanged', accountsChanged)
    provider.on?.('chainChanged', chainChanged)
    provider.on?.('disconnect', disconnected)
    void Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]).then(([accounts, chain]) => {
      if (alive) { setAccount(accounts[0] as Address | undefined); setWalletChain(Number(chain)) }
    }).catch(() => { /* A locked wallet can still be connected explicitly. */ })
    return () => {
      alive = false
      provider.removeListener?.('accountsChanged', accountsChanged)
      provider.removeListener?.('chainChanged', chainChanged)
      provider.removeListener?.('disconnect', disconnected)
    }
  }, [provider])
  async function connect() {
    if (!provider) { setWalletError('No browser wallet was found. Open this page in an Ethereum wallet browser, or install a browser wallet and reload.'); return }
    setConnecting(true); setWalletError('')
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      setAccount(accounts[0] as Address | undefined)
      setWalletChain(Number(await provider.request({ method: 'eth_chainId' })))
      if (!accounts.length) setWalletError('No account was shared. Unlock your wallet and connect again.')
    } catch (error) { setWalletError(message(error)) } finally { setConnecting(false) }
  }
  async function changeChain() {
    if (!provider) return
    setConnecting(true); setWalletError('')
    try { await switchChain(config, provider); setWalletChain(Number(await provider.request({ method: 'eth_chainId' }))) }
    catch (error) { setWalletError(message(error)) } finally { setConnecting(false) }
  }
  const wrongChain = Boolean(account && walletChain !== config.chain.id)
  const fresh = data && clock - data.loadedAt < 65_000
  const ready = Boolean(account && !wrongChain && data?.account === account && fresh && !loading && !busy && !connecting)
  const cost = data ? BigInt(periods) * data.dues : 0n
  const start = data ? (data.expiry > data.timestamp ? data.expiry : data.timestamp) : 0n
  const nextExpiry = data ? start + BigInt(periods) * data.period : 0n
  const tooFar = Boolean(data && nextExpiry > data.timestamp + data.maxAdvance)
  const insufficient = Boolean(data && data.balance < cost)
  const approved = Boolean(data && data.allowance >= cost)
  const blockedReason = !account ? 'Connect your wallet to check your balance and membership.' : wrongChain ? `Switch to ${config.chain.name} to enable transactions.` : loading ? 'Reading and verifying the latest contract state…' : !data ? 'Contract state is unavailable. Refresh to try again.' : !fresh ? 'The displayed state is stale. Refresh before continuing.' : tooFar ? 'This renewal exceeds the five-year limit. Choose fewer periods.' : insufficient ? `You need ${units(cost - data.balance, data.decimals, true)} more ${data.symbol}. Get GILD, then refresh.` : ''
  async function act(action: Action) {
    if (!ready || !account || !provider) return
    const context = activeWallet.current
    setBusy(action); setTxError(''); setTxHash(undefined); setTxStatus('Preparing transaction…')
    try { await transact(config, client, provider, account, action, periods, (label, hash) => { setTxStatus(label); if (hash) setTxHash(hash) }) }
    catch (error) { setTxError(message(error)); setTxStatus('') }
    finally { setBusy(undefined); if (activeWallet.current === context) void refresh() }
  }
  return <>
    <a className="skip" href="#membership">Skip to membership</a>
    <header className="masthead wrap">
      <a href="#" className="brand" aria-label="Guild home"><Mark/><span>Guild<span className="brand-sub">The membership ledger</span></span></a>
      <nav aria-label="Main navigation"><a href="#membership">Membership</a><a href="#roster">Roster</a><a href="#treasury">Treasury</a></nav>
      <div className="wallet-controls">
        {wallets.length > 1 && !account && <label className="wallet-picker">Wallet<select value={walletId || wallets[0]?.id} onChange={event => setWalletId(event.target.value)}>{wallets.map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label>}
        <span className="network-pill"><span aria-hidden="true" className="dot"/>{config.chain.name}</span>
        <button className="button wallet-button" disabled={connecting || Boolean(busy)} onClick={account ? () => { setAccount(undefined); setData(undefined); request.current++ } : connect}>{connecting ? 'Connecting…' : account ? `${short(account)} · Disconnect` : 'Connect wallet'}<span aria-hidden="true"> ↗</span></button>
      </div>
    </header>
    <main className="wrap">
      <section className="hero" aria-labelledby="page-title">
        <div><p className="eyebrow">An onchain membership experiment</p><h1 id="page-title">A place on<br/>the <em>ledger.</em></h1><p className="hero-copy">Join the Guild. Keep your membership current.<br className="desktop-break"/> Every payment, every member, recorded onchain.</p></div>
        <div className="membership-note"><div className="seal" aria-hidden="true"><span>Guild</span><Mark/><span>GILD · Membership</span></div><p><strong>One period. Thirty days.</strong><br/>A simple membership, paid in GILD.</p><a href="#membership" className="text-link">Explore membership <span aria-hidden="true">↓</span></a></div>
      </section>
      <div className="test-banner"><span className="label">Testnet only</span><p>A Sepolia test toy. Membership grants no off-chain rights or services.</p><span className="edition" aria-hidden="true">G / 001</span></div>
      {walletError && <div className="notice error" role="alert">{walletError}</div>}
      {wrongChain && <div className="notice warning"><div><strong>Your wallet is on another network.</strong><p>Switch to {config.chain.name} to approve GILD, pay dues or sweep the treasury.</p></div><button className="button" disabled={connecting || Boolean(busy)} onClick={changeChain}>{connecting ? 'Switching…' : `Switch to ${config.chain.name}`}</button></div>}
      <div className="ledger-bar"><span><span className={`dot ${data ? '' : 'muted-dot'}`} aria-hidden="true"/>{loading ? 'Reading the ledger…' : data ? `Onchain · Block ${data.block.toLocaleString('en')}` : 'Ledger unavailable'}</span><button className="text-button" onClick={() => void refresh()} disabled={loading || Boolean(busy)}>Refresh state <span aria-hidden="true">↻</span></button></div>
      {readError && <div className="notice error" role="alert">{readError}</div>}
      <div className="main-grid">
        <section id="membership" className="membership panel" aria-labelledby="membership-title">
          <div className="section-heading"><div><p className="eyebrow">01 / Your membership</p><h2 id="membership-title">Join or renew</h2></div><span className={`badge ${data?.active && account ? 'active' : ''}`}>{!account ? 'Wallet not connected' : data?.account !== account ? 'Checking…' : data.active ? 'Active member' : data.expiry ? 'Lapsed member' : 'Not a member'}</span></div>
          <p className="section-copy">A new membership starts now. Renewals extend your current expiry; lapsed memberships restart with no back dues.</p>
          <div className="rate"><strong>{data ? units(data.dues, data.decimals) : '10,000'} <span>GILD</span></strong><span>per 30-day period</span></div>
          <div className="period-row"><label htmlFor="periods">Membership length<span>1–12 periods per payment</span></label><select id="periods" value={periods} disabled={Boolean(busy)} onChange={event => setPeriods(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index + 1} {index ? 'periods' : 'period'} · {(index + 1) * 30} days</option>)}</select></div>
          <dl className="summary"><div><dt>Total dues</dt><dd>{data ? units(cost, data.decimals) : (periods * 10000).toLocaleString('en')} GILD</dd></div><div><dt>Estimated expiry after payment</dt><dd>{data && account ? date(nextExpiry) : 'Connect to calculate'}</dd></div></dl>
          <div className="wallet-state"><div><span>Wallet balance</span><strong title={data && account ? `${formatUnits(data.balance, data.decimals)} ${data.symbol}` : undefined}>{data && account ? `${units(data.balance, data.decimals, true)} ${data.symbol}` : '—'}</strong></div><div><span>Approved for dues</span><strong title={data && account ? `${formatUnits(data.allowance, data.decimals)} ${data.symbol}` : undefined}>{data && account ? `${units(data.allowance, data.decimals, true)} ${data.symbol}` : '—'}</strong></div></div>
          {account && <div className="account-line"><span>Connected wallet</span><AddressLink address={account} config={config}/><span>Current expiry: {data ? date(data.expiry) : 'Loading…'}</span></div>}
          <div className="steps"><div className="step"><span className="step-number">1</span><div><strong>Approve GILD</strong><p>Allow GuildDues to spend exactly the selected dues.</p></div><span className="step-state">{approved && account ? 'Ready ✓' : 'Permission'}</span></div><div className="step"><span className="step-number">2</span><div><strong>Pay membership dues</strong><p>Confirm your payment in a separate transaction.</p></div><span className="step-state">Membership</span></div></div>
          <p className="action-hint" id="action-hint">{blockedReason || (approved ? 'Allowance is ready. Review the total, then confirm your payment.' : 'First approve the selected amount, then pay your dues.')}</p>
          {!account ? <button className="button primary full" disabled={connecting} onClick={connect}>Connect wallet to join <span aria-hidden="true">↗</span></button> : <div className="action-row"><button className={`button ${approved ? '' : 'primary'}`} disabled={!ready || approved || insufficient || tooFar} aria-describedby="action-hint" onClick={() => void act('approve')}>{busy === 'approve' ? 'Approving…' : approved ? 'GILD approved ✓' : `Approve ${data ? units(cost, data.decimals) : ''} GILD`}</button><button className={`button ${approved ? 'primary' : ''}`} disabled={!ready || !approved || insufficient || tooFar} aria-describedby="action-hint" onClick={() => void act('pay')}>{busy === 'pay' ? 'Paying dues…' : data?.expiry ? 'Renew membership' : 'Join the Guild'}<span aria-hidden="true"> →</span></button></div>}
          <p className="fine-print">Dues are non-refundable. Leave by letting membership lapse. Expiry cannot be more than five years ahead. Wallet transactions also require Sepolia ETH for gas.</p>
          <details className="get-gild"><summary>How do I get GILD?</summary><p>Get GILD by swapping Sepolia ETH in the ETH/GILD launch pool using an external Uniswap v4 interface. This page has no in-page swap. Verify the token address before using an external swap interface.</p>{data && <AddressLink address={data.token} config={config} label="GILD token"/>}<p className="fine-print">Need test ETH? <a href={config.deployment.network.faucets[0]} target="_blank" rel="noreferrer">Open the Sepolia faucet ↗</a></p></details>
        </section>
        <aside className="right-column">
          <section id="treasury" className="treasury panel" aria-labelledby="treasury-title"><p className="eyebrow">02 / Shared treasury</p><h2 id="treasury-title">Put dues to work.</h2><p className="section-copy">Accrued GILD is held in the contract until anyone sends it to the fixed treasurer.</p><div className="treasury-amount"><strong>{data ? units(data.accrued, data.decimals, true) : '—'}</strong><span>GILD accrued</span></div><div className="treasurer"><span className="label">Only destination · Treasurer</span>{data ? <AddressLink address={data.treasurer} config={config} label="Treasurer"/> : <span>Loading from contract…</span>}</div><button className="button sweep full" onClick={() => void act('sweep')} disabled={!ready || data?.accrued === 0n}>{busy === 'sweep' ? 'Sweeping dues…' : 'Sweep to treasurer'}<span aria-hidden="true"> ↗</span></button><p className="fine-print">{!account ? 'Connect a wallet to sweep. ' : wrongChain ? `Switch to ${config.chain.name} to sweep. ` : data?.accrued === 0n ? 'No GILD is currently waiting to be swept. ' : ''}Anyone can call this. All accrued GILD, including direct transfers, goes to this address. The treasurer has no admin powers.</p></section>
          <div className={`transaction-panel ${txError ? 'has-error' : ''}`} aria-label="Transaction activity"><p className="eyebrow">Transaction activity</p><p role="status" aria-live="polite">{txStatus || (!txError ? 'Your approval, payment and sweep confirmations will appear here.' : '')}</p>{txError && <p role="alert">{txError}</p>}{txHash && <a href={`${config.deployment.network.explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction {short(txHash)} ↗</a>}</div>
        </aside>
      </div>
      <section id="roster" className="roster" aria-labelledby="roster-title"><div className="section-heading"><div><p className="eyebrow">03 / The ledger</p><h2 id="roster-title">In good company.</h2></div><span className="roster-count">{data ? data.count.toLocaleString('en') : '—'} <span>members recorded</span></span></div><p className="section-copy">Every wallet that has joined, in first-payment order. Lapsed memberships stay on the ledger.</p>
        <div className="roster-table" aria-busy={loading}><table><caption className="sr-only">Guild member addresses, membership status and expiry dates</caption><thead><tr><th scope="col">Member wallet</th><th scope="col">Status</th><th scope="col">Membership expiry (UTC)</th></tr></thead><tbody>{!loading && data?.members.map(member => <tr key={member.member}><td><AddressLink address={member.member} config={config} label="Member"/></td><td><span className={`badge ${member.expiry > data.timestamp ? 'active' : ''}`}>{member.expiry > data.timestamp ? 'Active' : 'Lapsed'}</span></td><td>{date(member.expiry)}</td></tr>)}</tbody></table>{loading ? <div className="empty">Reading members from the contract…</div> : !data ? <div className="empty">The roster is unavailable. Use Refresh state to try again.</div> : !data.members.length ? <div className="empty"><strong>{data.count === 0n ? 'The first place is still open.' : 'No members on this page.'}</strong><p>{data.count === 0n ? 'Join the Guild to make the first entry in the ledger.' : 'Return to the previous page to see earlier members.'}</p></div> : null}</div>
        <div className="pagination"><span role="status">{data && data.members.length ? `${offset + 1n}–${offset + BigInt(data.members.length)} of ${data.count}` : 'No entries shown'}<span className="page-size"> · 5 per page</span></span><div><button className="button small" disabled={offset === 0n || loading || Boolean(busy)} onClick={() => setOffset(value => value >= PAGE_SIZE ? value - PAGE_SIZE : 0n)}>← Previous</button><button className="button small" disabled={!data || offset + PAGE_SIZE >= data.count || loading || Boolean(busy)} onClick={() => setOffset(value => value + PAGE_SIZE)}>Next →</button></div></div>
      </section>
      <footer><div className="footer-brand"><Mark/><span>Guild<small>A small experiment in belonging.</small></span></div><div className="contract-links"><span className="label">Verify the contracts</span>{config.deployment.contracts.map(contract => <a key={contract.name} href={`${config.deployment.network.explorer}/address/${contract.address}`} target="_blank" rel="noreferrer">{contract.name} <span className="mono">{short(contract.address)}</span> ↗</a>)}<a href="./imd-deployment.json" target="_blank" rel="noreferrer">Deployment manifest ↗</a></div><p className="footer-note">Sepolia only. No off-chain rights or services.<br/>Live reads from contract views. No indexer.</p></footer>
    </main>
  </>
}
function App() {
  const [config, setConfig] = useState<Config>()
  const [error, setError] = useState('')
  useEffect(() => { void loadConfig().then(setConfig).catch(e => setError(message(e))) }, [])
  if (!config) return <main className="boot"><Mark/><h1>Guild</h1>{error ? <><p role="alert">{error}</p><button className="button" onClick={() => window.location.reload()}>Reload deployment</button></> : <p role="status">Verifying deployment configuration…</p>}</main>
  return <Guild config={config}/>
}
createRoot(document.getElementById('root')!).render(<App/> )
