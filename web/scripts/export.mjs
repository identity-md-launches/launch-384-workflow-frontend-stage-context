import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { keccak256, toBytes } from 'viem'
import { canonical } from '../src/canonical.ts'
const root = resolve(import.meta.dirname, '../..')
const dist = resolve(root, 'dist')
const handoff = JSON.parse(await readFile(resolve(root, 'web/deployment/handoff.json'), 'utf8'))
const { network, walletAddChain } = JSON.parse(await readFile(resolve(root, 'web/deployment/network.json'), 'utf8'))
if (handoff.version !== 1 || handoff.chainId !== network.chainId || !/^[a-f0-9]{40}$/.test(handoff.sourceCommit)) throw Error('Invalid deployment handoff')
const derivedAddChain = {
  chainId: `0x${handoff.chainId.toString(16)}`, chainName: network.name,
  rpcUrls: network.rpcUrls, nativeCurrency: network.nativeCurrency, blockExplorerUrls: [network.explorer],
}
if (canonical(derivedAddChain) !== canonical(walletAddChain)) throw Error('Wallet chain parameters do not match network')
await mkdir(resolve(dist, 'abi'), { recursive: true })
const contracts = []
for (const { name, address, abiHash } of handoff.contracts) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw Error('Unsafe contract name')
  const bytes = execFileSync('git', ['show', `${handoff.sourceCommit}:docs/abi/${name}.json`], { cwd: root })
  const abi = JSON.parse(bytes.toString())
  const actual = keccak256(toBytes(canonical(abi))).slice(2)
  if (!Array.isArray(abi) || actual !== abiHash) throw Error(`ABI hash mismatch: ${name} (${actual})`)
  const abiPath = `abi/${name}.json`
  await writeFile(resolve(dist, abiPath), bytes)
  contracts.push({ name, address, abiHash, abiPath })
  console.log(`Verified ${name} ABI against ${handoff.sourceCommit}: ${actual}`)
}
async function inventory(dir, prefix = '') {
  const assets = []
  for (const name of (await readdir(dir)).sort()) {
    if (name === 'imd-deployment.json') continue
    const path = prefix + name
    const full = resolve(dir, name)
    if ((await stat(full)).isDirectory()) assets.push(...await inventory(full, path + '/'))
    else {
      const bytes = await readFile(full)
      if (bytes.length > 8388608) throw Error(`Asset exceeds 8 MiB: ${path}`)
      assets.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') })
    }
  }
  return assets
}
const assets = await inventory(dist)
if (assets.length > 128) throw Error('Too many export assets')
const { launchId, chainId, sourceCommit, attestationHash } = handoff
await writeFile(resolve(dist, 'imd-deployment.json'), JSON.stringify({ version: 1, launchId, chainId, sourceCommit, attestationHash, contracts, assets, network }, null, 2) + '\n')
console.log(`Export manifest written last; ${assets.length} hashed assets.`)
