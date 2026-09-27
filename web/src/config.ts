import { createPublicClient, custom, defineChain, fallback, http, isAddress, keccak256, toBytes, type Abi, type Address, type EIP1193Provider } from 'viem'
import { canonical } from './canonical'
export type Provider = EIP1193Provider
export interface Deployment {
  version: number; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[]; uniswapV4: Record<string, Address>;
  };
}
const safePath = (path: string) => /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(path) && !path.includes('..')
async function json(path: string) {
  if (!safePath(path)) throw Error('Unsafe deployment asset path.')
  const response = await fetch(new URL(path, document.baseURI), { cache: 'no-cache' })
  if (!response.ok) throw Error(`Could not load ${path}. Reload to try again.`)
  return response.json()
}
export async function loadConfig() {
  const deployment = await json('imd-deployment.json') as Deployment
  if (deployment.version !== 1 || deployment.chainId !== deployment.network?.chainId || !deployment.network.rpcUrls.length) throw Error('Deployment configuration is invalid. Transactions are unavailable.')
  const contracts = await Promise.all(deployment.contracts.map(async entry => {
    if (!isAddress(entry.address) || !safePath(entry.abiPath)) throw Error('Invalid contract configuration.')
    const abi: Abi = await json(entry.abiPath)
    if (!Array.isArray(abi) || keccak256(toBytes(canonical(abi))).slice(2) !== entry.abiHash) throw Error(`The ${entry.name} ABI does not match the deployment. Transactions are unavailable.`)
    return { ...entry, abi }
  }))
  const guild = contracts.find(c => c.name === 'GuildDues')
  const token = contracts.find(c => c.name === 'LaunchToken')
  if (!guild || !token || contracts.length !== 2) throw Error('Expected GuildDues and LaunchToken in the deployment.')
  const { network } = deployment
  const chain = defineChain({ id: deployment.chainId, name: network.name, testnet: network.testnet, nativeCurrency: network.nativeCurrency, rpcUrls: { default: { http: network.rpcUrls } }, blockExplorers: { default: { name: 'Block explorer', url: network.explorer } } })
  const walletAddChain = { chainId: `0x${chain.id.toString(16)}`, chainName: network.name, rpcUrls: network.rpcUrls, nativeCurrency: network.nativeCurrency, blockExplorerUrls: [network.explorer] }
  return { deployment, chain, guild, token, walletAddChain }
}
export type Config = Awaited<ReturnType<typeof loadConfig>>
export function readClient(config: Config, provider?: Provider) {
  const transports = config.deployment.network.rpcUrls.map(url => http(url, { timeout: 6500, retryCount: 0 }))
  return createPublicClient({ chain: config.chain, transport: fallback([...transports, ...(provider ? [custom(provider, { retryCount: 0 })] : [])], { retryCount: 0 }) })
}
export type ReadClient = ReturnType<typeof readClient>
