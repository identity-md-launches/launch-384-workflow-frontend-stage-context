import { BaseError, ContractFunctionRevertedError, createWalletClient, custom, type Address, type Hash } from 'viem'
import { type Config, type Provider, type ReadClient } from './config'
export const PAGE_SIZE = 5n
export interface Member { member: Address; expiry: bigint }
export interface Snapshot {
  account?: Address; token: Address; treasurer: Address; decimals: number; symbol: string;
  dues: bigint; period: bigint; maxPeriods: bigint; maxAdvance: bigint;
  count: bigint; accrued: bigint; members: Member[]; expiry: bigint; active: boolean;
  balance: bigint; allowance: bigint; timestamp: bigint; block: bigint; loadedAt: number;
}
export async function snapshot(config: Config, client: ReadClient, account: Address | undefined, offset: bigint): Promise<Snapshot> {
  if (await client.getChainId() !== config.chain.id) throw Error('RPC returned the wrong network. Refresh to retry.')
  const codes = await Promise.all([config.guild, config.token].map(c => client.getCode({ address: c.address })))
  if (codes.some(code => !code || code === '0x')) throw Error('Deployed contract code could not be verified. Refresh to retry.')
  const block = await client.getBlock()
  const blockNumber = block.number
  const guildRead = (functionName: string, args?: readonly unknown[]) => client.readContract({ address: config.guild.address, abi: config.guild.abi, functionName, args, blockNumber })
  const token = await guildRead('token') as Address
  if (token.toLowerCase() !== config.token.address.toLowerCase()) throw Error('GuildDues.token() does not match the attested token. Transactions are unavailable.')
  const tokenRead = (functionName: string, args?: readonly unknown[]) => client.readContract({ address: token, abi: config.token.abi, functionName, args, blockNumber })
  const [treasurer, decimals, symbol, dues, period, maxPeriods, maxAdvance, count, accrued, members, expiry, active, balance, allowance] = await Promise.all([
    guildRead('treasurer'), tokenRead('decimals'), tokenRead('symbol'), guildRead('DUES_PER_PERIOD'), guildRead('PERIOD'), guildRead('MAX_PERIODS'), guildRead('MAX_ADVANCE'), guildRead('memberCount'), guildRead('accrued'), guildRead('members', [offset, PAGE_SIZE]),
    account ? guildRead('expiryOf', [account]) : 0n, account ? guildRead('isActive', [account]) : false,
    account ? tokenRead('balanceOf', [account]) : 0n, account ? tokenRead('allowance', [account, config.guild.address]) : 0n,
  ])
  return { account, token, treasurer: treasurer as Address, decimals: Number(decimals), symbol: symbol as string, dues: dues as bigint, period: period as bigint, maxPeriods: maxPeriods as bigint, maxAdvance: maxAdvance as bigint, count: count as bigint, accrued: accrued as bigint, members: members as Member[], expiry: expiry as bigint, active: active as boolean, balance: balance as bigint, allowance: allowance as bigint, timestamp: block.timestamp, block: blockNumber, loadedAt: Date.now() }
}
export function message(error: unknown): string {
  const code = (error as { code?: number })?.code
  if (code === 4001 || (error instanceof BaseError && Boolean(error.walk(e => (e as { code?: number }).code === 4001)))) return 'Request declined in your wallet. You can try again when ready.'
  if (error instanceof BaseError) {
    const revert = error.walk(e => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      if (name === 'ExpiryTooFar') return 'This renewal would put your expiry more than five years ahead. Choose fewer periods.'
      if (name === 'ERC20InsufficientBalance') return 'Your GILD balance is too low. Get GILD, then refresh and try again.'
      if (name === 'ERC20InsufficientAllowance') return 'The allowance changed. Refresh and approve the required GILD before paying.'
      return `Contract simulation failed: ${name || revert.reason || 'transaction would revert'}. Refresh the contract state before trying again.`
    }
    return `${error.shortMessage} Refresh the state or check your wallet and try again.`
  }
  return error instanceof Error ? error.message : 'The request failed. Check your connection and try again.'
}
export async function switchChain(config: Config, provider: Provider) {
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: config.walletAddChain.chainId as `0x${string}` }] }) }
  catch (error) {
    const e = error as { code?: number; message?: string; data?: { originalError?: { code?: number } } }
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902 && !/unknown chain|unrecognized chain|chain.*not.*added/i.test(e.message || '')) throw error
    await provider.request({ method: 'wallet_addEthereumChain', params: [config.walletAddChain] })
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: config.walletAddChain.chainId as `0x${string}` }] })
  }
}
export async function assertWallet(provider: Provider, config: Config, account: Address) {
  const [accounts, chain] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })])
  if (Number(chain) !== config.chain.id || accounts[0]?.toLowerCase() !== account.toLowerCase()) throw Error('The wallet account or network changed. Refresh and try again.')
}
export type Action = 'approve' | 'pay' | 'sweep'
export async function transact(config: Config, client: ReadClient, provider: Provider, account: Address, action: Action, periods: number, progress: (label: string, hash?: Hash) => void) {
  await assertWallet(provider, config, account)
  progress('Checking the latest contract state…')
  const current = await snapshot(config, client, account, 0n)
  const cost = BigInt(periods) * current.dues
  if (action !== 'sweep' && (periods < 1 || BigInt(periods) > current.maxPeriods || !Number.isInteger(periods))) throw Error('Choose between 1 and 12 periods.')
  if (action !== 'sweep' && current.balance < cost) throw Error('Your GILD balance is too low. Get GILD, then refresh to try again.')
  if (action === 'pay' && current.allowance < cost) throw Error('Approve the required GILD before paying dues.')
  const start = current.expiry > current.timestamp ? current.expiry : current.timestamp
  if (action !== 'sweep' && start + BigInt(periods) * current.period > current.timestamp + current.maxAdvance) throw Error('This renewal exceeds the five-year limit. Choose fewer periods.')
  if (action === 'sweep' && current.accrued === 0n) throw Error('There are no accrued dues to sweep. Refresh later.')
  const call = action === 'approve'
    ? { address: current.token, abi: config.token.abi, functionName: 'approve', args: [config.guild.address, cost] }
    : { address: config.guild.address, abi: [...config.guild.abi, ...config.token.abi], functionName: action, args: action === 'pay' ? [BigInt(periods)] : [] }
  const { request } = await client.simulateContract({ ...call, account })
  await assertWallet(provider, config, account)
  progress('Confirm the transaction in your wallet…')
  const wallet = createWalletClient({ chain: config.chain, transport: custom(provider) })
  const hash = await wallet.writeContract(request)
  progress('Transaction submitted. Waiting for confirmation…', hash)
  let replaced = false
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000, onReplaced: replacement => {
    replaced = replacement.reason !== 'repriced'
    progress(replaced ? 'Transaction cancelled or replaced. Checking its receipt…' : 'Transaction repriced. Waiting for confirmation…', replacement.transaction.hash)
  } })
  if (replaced) throw Error('The transaction was cancelled or replaced in your wallet. Refresh and verify the contract state before trying again.')
  if (receipt.status !== 'success') throw Error('The transaction reverted. No contract changes were applied. Refresh before trying again.')
  progress(`${action === 'approve' ? 'Approval' : action === 'pay' ? 'Membership payment' : 'Treasury sweep'} confirmed.`, receipt.transactionHash)
  return receipt
}
