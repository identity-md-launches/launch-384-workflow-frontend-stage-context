import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, toHex } from 'viem'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '../..')
const dist = resolve(root, 'dist')
const config = JSON.parse(await readFile(resolve(dist, 'imd-deployment.json')))
const abi = Object.fromEntries(await Promise.all(config.contracts.map(async c => [c.name, JSON.parse(await readFile(resolve(dist, c.abiPath)))])))
const guild = config.contracts.find(c => c.name === 'GuildDues').address
const token = config.contracts.find(c => c.name === 'LaunchToken').address
const account = '0x1000000000000000000000000000000000000001'
const treasurer = '0x2000000000000000000000000000000000000002'
const WAD = 10n ** 18n
const now = 1790500000n
const hash = '0x' + 'a'.repeat(64)
const blockHash = '0x' + 'b'.repeat(64)
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (!path.startsWith('/ipfs/test-guild/')) { res.writeHead(404).end(); return }
    const file = resolve(dist, path.slice('/ipfs/test-guild/'.length) || 'index.html')
    if (!file.startsWith(dist + '/')) { res.writeHead(403).end(); return }
    const content = await readFile(file)
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' })[extname(file)] || 'application/octet-stream')
    res.end(content)
  } catch { res.writeHead(404).end('Not found') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/ipfs/test-guild/`
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
const checks = [], errors = [], screenshots = [], audits = [], contrast = [], focusStops = []
let latestPage
function fixture(overrides = {}) {
  return {
    connected: false, chain: config.chainId, balance: 100000n * WAD, allowance: 0n, expiry: 0n,
    accrued: 20000n * WAD, timestamp: now, failRpc: false, emptyCode: false, mismatchToken: false,
    missingChain: false, rejectConnect: false, rejectTransaction: false, simulateRevert: false,
    receiptRevert: false, noWallet: false, added: false, sent: [], calls: [],
    roster: Array.from({ length: 7 }, (_, i) => ({ member: `0x${(0x3000n + BigInt(i)).toString(16).padStart(40, '0')}`, expiry: now + (i % 2 ? -1n : 90n * 86400n) })),
    ...overrides,
  }
}
function block(state) {
  return { number: '0x100', hash: blockHash, parentHash: blockHash, nonce: '0x0000000000000000', sha3Uncles: hash, logsBloom: '0x' + '0'.repeat(512), transactionsRoot: hash, stateRoot: hash, receiptsRoot: hash, miner: treasurer, difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x100', gasLimit: '0x1c9c380', gasUsed: '0x0', timestamp: toHex(state.timestamp), transactions: [], uncles: [], baseFeePerGas: '0x1' }
}
function callContract(state, tx) {
  const isToken = tx.to.toLowerCase() === token.toLowerCase()
  const contractAbi = isToken ? abi.LaunchToken : abi.GuildDues
  const { functionName, args } = decodeFunctionData({ abi: contractAbi, data: tx.data })
  state.calls.push({ method: functionName, args: (args || []).map(String), to: tx.to })
  let result
  switch (functionName) {
    case 'token': result = state.mismatchToken ? account : token; break
    case 'treasurer': result = treasurer; break
    case 'decimals': result = 18; break
    case 'symbol': result = 'GILD'; break
    case 'DUES_PER_PERIOD': result = 10000n * WAD; break
    case 'PERIOD': result = 30n * 86400n; break
    case 'MAX_PERIODS': result = 12n; break
    case 'MAX_ADVANCE': result = 5n * 365n * 86400n; break
    case 'memberCount': result = BigInt(state.roster.length); break
    case 'accrued': result = state.accrued; break
    case 'members': result = state.roster.slice(Number(args[0]), Number(args[0] + args[1])); break
    case 'expiryOf': result = state.expiry; break
    case 'isActive': result = state.expiry > state.timestamp; break
    case 'balanceOf': result = state.balance; break
    case 'allowance': result = state.allowance; break
    case 'approve': result = true; break
    case 'pay': case 'sweep':
      if (state.changeAccountOnSimulate) state.accountOverride = treasurer
      if (state.simulateRevert) return { error: { code: 3, message: 'execution reverted', data: encodeErrorResult({ abi: abi.GuildDues, errorName: 'ExpiryTooFar' }) } }
      result = undefined; break
    default: throw Error(`Unhandled contract method ${functionName}`)
  }
  return { result: encodeFunctionResult({ abi: contractAbi, functionName, result }) }
}
function rpc(state, payload) {
  const { method, params = [], id } = payload
  if (state.failRpc) return { id, jsonrpc: '2.0', error: { code: -32000, message: 'Test RPC unavailable' } }
  let response
  switch (method) {
    case 'eth_chainId': response = { result: toHex(state.rpcChain || config.chainId) }; break
    case 'eth_getCode': response = { result: state.emptyCode ? '0x' : '0x6080604052600080fd' }; break
    case 'eth_getBlockByNumber': response = { result: block(state) }; break
    case 'eth_blockNumber': response = { result: '0x100' }; break
    case 'eth_call': response = callContract(state, params[0]); break
    case 'eth_getTransactionReceipt': response = { result: {
      transactionHash: hash, transactionIndex: '0x0', blockHash, blockNumber: '0x100', from: account,
      to: state.sent.at(-1)?.to || guild, cumulativeGasUsed: '0x5208', gasUsed: '0x5208', contractAddress: null,
      logs: [], logsBloom: '0x' + '0'.repeat(512), status: state.receiptRevert ? '0x0' : '0x1', type: '0x2', effectiveGasPrice: '0x1',
    } }; break
    default: throw Error(`Unhandled RPC ${method}`)
  }
  return { jsonrpc: '2.0', id, ...response }
}
async function open(state, viewport = { width: 1440, height: 1100 }) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
  const page = await context.newPage(); latestPage = page
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  await context.route('https://**/*', async route => {
    if (!config.network.rpcUrls.some(rpcUrl => route.request().url().startsWith(rpcUrl))) throw Error(`Unexpected network request ${route.request().url()}`)
    const payload = route.request().postDataJSON()
    const result = Array.isArray(payload) ? payload.map(item => rpc(state, item)) : rpc(state, payload)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })
  if (!state.noWallet) {
    await page.exposeFunction('walletRpc', async request => {
      state.calls.push({ method: request.method, params: request.params })
      switch (request.method) {
        case 'eth_accounts': return { value: state.connected ? [state.accountOverride || account] : [] }
        case 'eth_requestAccounts': if (state.rejectConnect) return { error: { code: 4001, message: 'User rejected connection' } }; state.connected = true; return { value: [account] }
        case 'eth_chainId': return { value: toHex(state.chain) }
        case 'wallet_switchEthereumChain': if (state.missingChain && !state.added) return { error: { code: 4902, message: 'Unknown chain' } }; state.chain = Number(request.params[0].chainId); return { value: null }
        case 'wallet_addEthereumChain': state.added = true; return { value: null }
        case 'eth_sendTransaction': {
          if (state.rejectTransaction) return { error: { code: 4001, message: 'User rejected transaction' } }
          const tx = request.params[0], contractAbi = tx.to.toLowerCase() === token.toLowerCase() ? abi.LaunchToken : abi.GuildDues
          const decoded = decodeFunctionData({ abi: contractAbi, data: tx.data })
          state.sent.push({ ...tx, functionName: decoded.functionName, args: decoded.args })
          if (!state.receiptRevert) {
            if (decoded.functionName === 'approve') state.allowance = decoded.args[1]
            if (decoded.functionName === 'pay') {
              const amount = decoded.args[0] * 10000n * WAD
              const first = !state.expiry
              state.balance -= amount; state.allowance -= amount; state.accrued += amount
              state.expiry = (state.expiry > state.timestamp ? state.expiry : state.timestamp) + decoded.args[0] * 30n * 86400n
              if (first) state.roster.push({ member: account, expiry: state.expiry })
            }
            if (decoded.functionName === 'sweep') state.accrued = 0n
          }
          return { value: hash }
        }
        default: return { value: rpc(state, { ...request, id: 1 }).result }
      }
    })
    await page.addInitScript(() => {
      const listeners = {}
      window.ethereum = {
        request: async request => { const result = await window.walletRpc(request); if (result.error) throw Object.assign(new Error(result.error.message), result.error); return result.value },
        on: (name, listener) => { (listeners[name] ||= []).push(listener) },
        removeListener: (name, listener) => { listeners[name] = (listeners[name] || []).filter(item => item !== listener) },
      }
      window.emitWallet = (name, payload) => (listeners[name] || []).forEach(listener => listener(payload))
    })
  }
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Join or renew' })).toBeVisible()
  return { page, context, state }
}
async function ready(page) { await expect(page.getByRole('button', { name: /Refresh state/ })).toBeEnabled() }
async function connect(page) { await page.getByRole('button', { name: /^Connect wallet$/ }).click(); await expect(page.getByRole('button', { name: /Disconnect/ })).toBeVisible(); await ready(page) }
async function check(name, run) {
  const start = Date.now()
  await run()
  checks.push({ name, result: 'PASS', durationMs: Date.now() - start })
  console.log(`PASS ${name}`)
}
await mkdir(resolve(root, 'docs/evidence'), { recursive: true })
try {
  await check('Static subpath, disconnected reads, empty roster, missing wallet guidance', async () => {
    const { page, context } = await open(fixture({ noWallet: true, roster: [], accrued: 0n }))
    await ready(page)
    await expect(page.getByText('The first place is still open.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sweep to treasurer' })).toBeDisabled()
    await page.getByRole('button', { name: /^Connect wallet$/ }).click()
    await expect(page.getByRole('alert')).toContainText('No browser wallet was found')
    await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled()
    await context.close()
  })
  await check('Unknown chain: switch, add exact handoff parameters, switch again', async () => {
    const { page, context, state } = await open(fixture({ chain: 1, missingChain: true }))
    await connect(page)
    await expect(page.getByRole('button', { name: /^Approve / })).toBeDisabled()
    await page.getByRole('button', { name: 'Switch to Sepolia' }).click()
    await ready(page)
    await expect(page.getByRole('button', { name: /^Approve / })).toBeEnabled()
    const calls = state.calls.filter(c => /wallet_(switch|add)EthereumChain/.test(c.method))
    assert.deepEqual(calls.map(c => c.method), ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain'])
    const network = JSON.parse(await readFile(resolve(root, 'web/deployment/network.json')))
    assert.deepEqual(calls[1].params[0], network.walletAddChain)
    await context.close()
  })
  await check('Period selection, exact approval, confirmed join, allowance refresh, sweep and pagination', async () => {
    const { page, context, state } = await open(fixture())
    await connect(page)
    await page.getByLabel('Membership length').selectOption('2')
    await expect(page.getByRole('button', { name: 'Join the Guild' })).toBeDisabled()
    await page.getByRole('button', { name: 'Approve 20,000 GILD' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Approval confirmed.' })).toBeVisible()
    await ready(page)
    assert.equal(state.sent[0].functionName, 'approve')
    assert.equal(state.sent[0].to.toLowerCase(), token.toLowerCase())
    assert.equal(state.sent[0].args[0].toLowerCase(), guild.toLowerCase())
    assert.equal(state.sent[0].args[1], 20000n * WAD)
    assert(!state.sent[0].value || state.sent[0].value === '0x0')
    await page.getByRole('button', { name: 'Join the Guild' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Membership payment confirmed.' })).toBeVisible()
    await ready(page)
    await expect(page.getByText('Active member', { exact: true })).toBeVisible()
    assert.equal(state.sent[1].args[0], 2n)
    assert.equal(state.expiry, now + 60n * 86400n)
    await expect(page.getByRole('button', { name: 'Renew membership' })).toBeDisabled()
    await page.getByRole('button', { name: 'Next →' }).click()
    await ready(page)
    await expect(page.getByRole('status').filter({ hasText: '6–8 of 8' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled()
    assert(state.calls.some(call => call.method === 'members' && call.args[0] === '5' && call.args[1] === '5'))
    await page.getByRole('button', { name: '← Previous' }).click(); await ready(page)
    await page.getByRole('button', { name: 'Sweep to treasurer' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Treasury sweep confirmed.' })).toBeVisible()
    await ready(page)
    assert.equal(state.sent[2].functionName, 'sweep')
    assert.equal(state.sent[2].to.toLowerCase(), guild.toLowerCase())
    assert.deepEqual(state.sent[2].args, undefined)
    assert.equal(state.accrued, 0n)
    await expect(page.getByRole('button', { name: 'Sweep to treasurer' })).toBeDisabled()
    await context.close()
  })
  await check('Stacking renewal, restart after lapse, exact lapse boundary and five-year guard', async () => {
    for (const expiry of [now + 45n * 86400n, now - 1n, now]) {
      const { page, context, state } = await open(fixture({ connected: true, allowance: 100000n * WAD, expiry }))
      await ready(page)
      await expect(page.getByText(expiry > now ? 'Active member' : 'Lapsed member', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Renew membership' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Membership payment confirmed.' })).toBeVisible()
      assert.equal(state.expiry, (expiry > now ? expiry : now) + 30n * 86400n)
      await context.close()
    }
    const { page, context, state } = await open(fixture({ connected: true, allowance: 100000n * WAD, expiry: now + 5n * 365n * 86400n - 86400n }))
    await ready(page)
    await expect(page.getByText('This renewal exceeds the five-year limit. Choose fewer periods.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Renew membership' })).toBeDisabled()
    assert.equal(state.sent.length, 0)
    await context.close()
  })
  await check('Insufficient GILD, connection rejection, wallet rejection and recovery', async () => {
    let env = await open(fixture({ connected: true, balance: 1n * WAD }))
    await ready(env.page)
    await expect(env.page.getByText(/You need 9,999 more GILD/)).toBeVisible()
    await expect(env.page.getByRole('button', { name: /^Approve / })).toBeDisabled()
    await env.context.close()
    env = await open(fixture({ rejectConnect: true }))
    await env.page.getByRole('button', { name: /^Connect wallet$/ }).click()
    await expect(env.page.getByRole('alert')).toContainText('Request declined')
    env.state.rejectConnect = false
    await connect(env.page)
    env.state.rejectTransaction = true
    await env.page.getByRole('button', { name: /^Approve / }).click()
    await expect(env.page.getByRole('alert')).toContainText('Request declined')
    await ready(env.page)
    assert.equal(env.state.sent.length, 0)
    env.state.rejectTransaction = false
    await env.page.getByRole('button', { name: /^Approve / }).click()
    await expect(env.page.getByRole('status').filter({ hasText: 'Approval confirmed.' })).toBeVisible()
    await env.context.close()
  })
  await check('Simulation revert blocks signing; reverted receipt is not a success', async () => {
    let env = await open(fixture({ connected: true, allowance: 10000n * WAD, simulateRevert: true }))
    await ready(env.page)
    await env.page.getByRole('button', { name: 'Join the Guild' }).click()
    await expect(env.page.getByRole('alert')).toContainText('more than five years ahead')
    assert.equal(env.state.sent.length, 0)
    await env.context.close()
    env = await open(fixture({ connected: true, allowance: 10000n * WAD, receiptRevert: true }))
    await ready(env.page)
    await env.page.getByRole('button', { name: 'Join the Guild' }).click()
    await expect(env.page.getByRole('alert')).toContainText('transaction reverted')
    await expect(env.page.getByRole('link', { name: /View transaction/ })).toBeVisible()
    assert.equal(env.state.expiry, 0n)
    await env.context.close()
  })
  await check('RPC failure and recovery; missing code and token binding fail closed', async () => {
    const env = await open(fixture({ connected: true, failRpc: true }))
    await expect(env.page.getByRole('alert')).toContainText(/Refresh/)
    await expect(env.page.getByRole('button', { name: /^Approve / })).toBeDisabled()
    env.state.failRpc = false
    await env.page.getByRole('button', { name: /Refresh state/ }).click(); await ready(env.page)
    await expect(env.page.getByRole('button', { name: /^Approve / })).toBeEnabled()
    await env.context.close()
    for (const props of [{ emptyCode: true }, { mismatchToken: true }, { rpcChain: 1 }]) {
      const { page, context } = await open(fixture({ connected: true, ...props }))
      await expect(page.getByRole('alert')).toContainText(props.emptyCode ? 'contract code could not be verified' : props.rpcChain ? 'RPC returned the wrong network' : 'does not match the attested token')
      await expect(page.getByRole('button', { name: /^Approve / })).toBeDisabled()
      await context.close()
    }
  })
  await check('Wallet chain/account events invalidate signing state', async () => {
    const { page, context, state } = await open(fixture({ connected: true, allowance: 10000n * WAD }))
    await ready(page)
    state.chain = 1
    await page.evaluate(() => window.emitWallet('chainChanged', '0x1'))
    await expect(page.getByRole('button', { name: 'Join the Guild' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Switch to Sepolia' })).toBeVisible()
    await page.evaluate(() => window.emitWallet('accountsChanged', []))
    await expect(page.getByRole('button', { name: 'Connect wallet to join' })).toBeVisible()
    assert.equal(state.sent.length, 0)
    await context.close()
  })
  await check('Wallet changes during simulation prevent a signature request', async () => {
    const { page, context, state } = await open(fixture({ connected: true, allowance: 10000n * WAD, changeAccountOnSimulate: true }))
    await ready(page)
    await page.getByRole('button', { name: 'Join the Guild' }).click()
    await expect(page.getByRole('alert')).toContainText('wallet account or network changed')
    assert.equal(state.sent.length, 0)
    await context.close()
  })
  await check('Tampered ABI is rejected before rendering transaction controls', async () => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.route('**/abi/LaunchToken.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.goto(url)
    await expect(page.getByRole('alert')).toContainText('ABI does not match the deployment')
    await expect(page.getByRole('button', { name: /^Approve / })).toHaveCount(0)
    await context.close()
  })
  await check('Desktop/mobile rendered review, keyboard, reflow, reduced motion and accessibility', async () => {
    const { page, context } = await open(fixture({ connected: true, expiry: now + 60n * 86400n, allowance: 10000n * WAD }))
    await ready(page)
    for (const [name, width, height] of [['desktop', 1440, 1100], ['mobile', 390, 844], ['narrow', 320, 800], ['tablet', 820, 1180]]) {
      await page.setViewportSize({ width, height })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`)
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
      audits.push({ viewport: name, width, height, violations: audit.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })) })
      assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))))
      if (name === 'desktop' || name === 'mobile') {
        const path = `docs/evidence/${name}.png`
        await page.screenshot({ path: resolve(root, path), fullPage: true })
        screenshots.push(path)
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 })
    for (const selector of ['.hero-copy', '.membership .section-copy', '.button.primary', '.badge.active', '.treasury .section-copy', '.treasury .fine-print']) {
      const pair = await page.locator(selector).first().evaluate(element => {
        const foreground = getComputedStyle(element).color
        let parent = element, background = 'rgba(0, 0, 0, 0)'
        while (parent && background === 'rgba(0, 0, 0, 0)') { background = getComputedStyle(parent).backgroundColor; parent = parent.parentElement }
        return { foreground, background }
      })
      const luminance = rgb => {
        const components = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => { const s = n / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 })
        return components[0] * .2126 + components[1] * .7152 + components[2] * .0722
      }
      const [a, b] = [luminance(pair.foreground), luminance(pair.background)].sort((a, b) => b - a)
      const ratio = (a + .05) / (b + .05)
      contrast.push({ selector, ...pair, ratio: Number(ratio.toFixed(2)) })
      assert(ratio >= 4.5, `Contrast below 4.5:1 for ${selector}`)
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '200% text reflow overflow')
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; document.documentElement.dir = 'rtl' })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'RTL overflow')
    await page.evaluate(() => { document.documentElement.dir = 'ltr' })
    await page.keyboard.press('Control+Home')
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Tab')
    // Walk all native interactive controls, checking keyboard focus has an outline.
    for (let i = 0; i < 12; i++) {
      const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, label: document.activeElement?.textContent?.trim().slice(0, 60), outline: getComputedStyle(document.activeElement).outlineStyle }))
      focusStops.push(focus)
      assert.notEqual(focus.outline, 'none', `Missing focus outline on ${focus.tag}`)
      await page.keyboard.press('Tab')
    }
    await page.getByLabel('Membership length').focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByLabel('Membership length')).toHaveValue('2')
    await page.getByText('How do I get GILD?', { exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(/Get GILD by swapping Sepolia ETH/)).toBeVisible()
    assert.equal(await page.getByRole('button', { name: 'Sweep to treasurer' }).evaluate(el => getComputedStyle(el).transitionDuration), '0s')
    await page.getByRole('button', { name: 'Sweep to treasurer' }).focus()
    await page.screenshot({ path: resolve(root, 'docs/evidence/focus.png') })
    screenshots.push('docs/evidence/focus.png')
    await context.close()
  })
  await check('Browser resources and console', async () => assert.deepEqual(errors, []))
} catch (error) {
  console.error(error)
  if (latestPage && !latestPage.isClosed()) await latestPage.screenshot({ path: resolve(root, 'web/test-results/failure.png'), fullPage: true }).catch(() => {})
  checks.push({ name: 'Interrupted at failing assertion', result: 'FAIL', reason: error.message })
  process.exitCode = 1
} finally {
  await writeFile(resolve(root, 'docs/evidence/browser.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browser: browser.version(), exportManifestHash: (await import('node:crypto')).createHash('sha256').update(await readFile(resolve(dist, 'imd-deployment.json'))).digest('hex'), mockedWalletAndRpc: true, urlPath: '/ipfs/test-guild/', checks, audits, screenshots, contrast, focusStops, consoleErrors: errors, limitations: ['No real transactions broadcast', 'No physical device or screen-reader session', '200% text enlargement, not native browser zoom', 'Only Chromium tested'] }, null, 2) + '\n')
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
