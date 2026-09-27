// Read-only browser smoke check. No wallet injection or transaction methods.
import { chromium, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve(import.meta.dirname, '../..'), dist = resolve(root, 'dist')
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname
    if (!path.startsWith('/live/guild/')) throw Error('Unknown path')
    const file = resolve(dist, path.slice('/live/guild/'.length) || 'index.html')
    if (!file.startsWith(dist + '/')) throw Error('Invalid path')
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[extname(file)] || 'text/plain')
    res.end(await readFile(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const report = { checkedAt: new Date().toISOString(), readOnly: true, mocked: false, consoleErrors: [], failedResponses: [] }
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.on('pageerror', error => report.consoleErrors.push(error.message))
  page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors.push(msg.text()) })
  page.on('response', response => { if (response.status() >= 400) report.failedResponses.push({ url: response.url(), status: response.status() }) })
  await page.goto(`http://127.0.0.1:${server.address().port}/live/guild/`)
  await expect(page.locator('.ledger-bar')).toContainText('Onchain · Block', { timeout: 60000 })
  await expect(page.getByRole('button', { name: 'Connect wallet to join' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sweep to treasurer' })).toBeDisabled()
  report.browser = browser.version()
  report.block = await page.locator('.ledger-bar > span').innerText()
  report.members = await page.locator('.roster-count').innerText()
  report.accrued = await page.locator('.treasury-amount').innerText()
  report.treasurer = await page.locator('.treasurer .address').innerText()
  report.result = report.consoleErrors.length || report.failedResponses.length ? 'REVIEW' : 'PASS'
  report.exportManifestHash = createHash('sha256').update(await readFile(resolve(dist, 'imd-deployment.json'))).digest('hex')
  await page.screenshot({ path: resolve(root, 'docs/evidence/live-desktop.png'), fullPage: true })
} catch (error) { report.result = 'UNVERIFIED'; report.reason = error.message; process.exitCode = 1 }
finally {
  if (browser) await browser.close()
  await new Promise(resolve => server.close(resolve))
  await writeFile(resolve(root, 'docs/evidence/browser-live.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
