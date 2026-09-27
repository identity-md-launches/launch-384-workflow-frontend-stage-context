import { readFile, readdir, lstat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { keccak256, toBytes } from 'viem'
import { canonical } from '../src/canonical.ts'
const root = resolve(import.meta.dirname, '../..')
const load = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'))
const manifest = await load('dist/imd-deployment.json')
const handoff = await load('web/deployment/handoff.json')
const network = await load('web/deployment/network.json')
for (const key of ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash']) assert.equal(manifest[key], handoff[key], key)
assert.deepEqual(manifest.network, network.network)
assert.deepEqual(manifest.contracts.map(({ name, address, abiHash }) => ({ name, address, abiHash })), handoff.contracts.map(({ name, address, abiHash }) => ({ name, address, abiHash })))
const walk = async (dir, prefix = '') => (await Promise.all((await readdir(dir)).map(async name => {
  const path = resolve(dir, name), info = await lstat(path)
  assert(!info.isSymbolicLink(), 'No symlinks in export')
  return info.isDirectory() ? walk(path, prefix + name + '/') : prefix + name
}))).flat()
const files = await walk(resolve(root, 'dist'))
assert(manifest.assets.length <= 128)
assert.deepEqual(manifest.assets.map(a => a.path).sort(), files.filter(path => path !== 'imd-deployment.json').sort())
let bytes = 0
for (const asset of manifest.assets) {
  assert(/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(asset.path) && !asset.path.includes('..'))
  assert(/^[a-f0-9]{64}$/.test(asset.sha256))
  const content = await readFile(resolve(root, 'dist', asset.path))
  assert(content.length <= 8388608)
  bytes += content.length
  assert.equal(createHash('sha256').update(content).digest('hex'), asset.sha256)
}
for (const contract of manifest.contracts) {
  const abi = await load('dist/' + contract.abiPath)
  assert(Array.isArray(abi))
  assert.equal(keccak256(toBytes(canonical(abi))).slice(2), contract.abiHash)
}
assert(bytes < 8 * 1024 * 1024, 'Export leaves room in the HTTP budget')
console.log(JSON.stringify({ result: 'PASS', assets: manifest.assets.length, exportAssetBytes: bytes, chainId: manifest.chainId, sourceCommit: manifest.sourceCommit }, null, 2))
