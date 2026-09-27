import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { decodeFunctionResult, encodeFunctionData } from 'viem'
const root = resolve(import.meta.dirname, '../..')
const config = JSON.parse(await readFile(resolve(root, 'dist/imd-deployment.json')))
const results = []
for (const url of config.network.rpcUrls) {
  const item = { url, checkedAt: new Date().toISOString() }
  async function rpc(method, params = []) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(12000) })
    if (!response.ok) throw Error(`HTTP ${response.status}`)
    const result = await response.json()
    if (result.error) throw Error(result.error.message)
    return result.result
  }
  try {
    item.chainId = Number(await rpc('eth_chainId'))
    if (item.chainId !== config.chainId) throw Error('Chain ID mismatch')
    item.contracts = []
    for (const contract of config.contracts) {
      const code = await rpc('eth_getCode', [contract.address, 'latest'])
      item.contracts.push({ name: contract.name, address: contract.address, codeBytes: (code.length - 2) / 2 })
      if (code === '0x') throw Error(`No code for ${contract.name}`)
    }
    const guild = config.contracts.find(c => c.name === 'GuildDues')
    const abi = JSON.parse(await readFile(resolve(root, 'dist', guild.abiPath)))
    const token = decodeFunctionResult({ abi, functionName: 'token', data: await rpc('eth_call', [{ to: guild.address, data: encodeFunctionData({ abi, functionName: 'token' }) }, 'latest']) })
    item.tokenBinding = token.toLowerCase() === config.contracts.find(c => c.name === 'LaunchToken').address.toLowerCase()
    if (!item.tokenBinding) throw Error('Token binding mismatch')
    item.result = 'PASS'
  } catch (error) { item.result = 'UNVERIFIED'; item.reason = error.message }
  results.push(item)
}
await writeFile(resolve(root, 'docs/evidence/rpc.json'), JSON.stringify({ readOnly: true, results }, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
