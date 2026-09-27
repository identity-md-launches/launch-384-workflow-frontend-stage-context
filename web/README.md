# Guild membership frontend

A single-page Vite, React and TypeScript frontend for the deployed GuildDues contract. **This is a Sepolia test toy. Membership grants no off-chain rights or services.** Dues are non-refundable; leave by letting membership lapse.

## Run and rebuild

Use Node 24 (validated with 24.21.0) and npm. From the repository root:

```sh
npm ci --prefix web
npm run build --prefix web
npm run preview --prefix web
```

Open the preview URL printed by Vite. The complete production site is `dist/`; a static HTTP server can serve it without Node, a backend, an indexer or a registry. Keep the whole directory together. `file://` is unsupported because the app fetches its deployment JSON and ABIs. HTTPS is required for browser wallets on public hosting; localhost is suitable for development.

`npm run dev --prefix web` starts source development after the first build. The development middleware serves the same generated deployment configuration and ABI files from `dist/`. `npm run typecheck --prefix web` runs TypeScript independently.

Vite uses `base: './'`, one document and anchor navigation. Bundles, ABIs and configuration load relative to the hosting directory. [Vite's relative-base documentation](https://vite.dev/guide/build#relative-base) describes the hosting behavior. There are no external fonts, image services, CDN scripts or build-time private credentials.

## Deployment configuration

The supplied handoffs are preserved at `web/deployment/handoff.json` and `web/deployment/network.json`. These are **build inputs**, not runtime configuration imports. The browser fetches `dist/imd-deployment.json`, then its referenced raw ABI arrays. No contract address, chain ID, RPC endpoint or ABI map is compiled separately into the application.

The exporter reads `docs/abi/<Contract>.json` using `git show` at the handoff's exact `sourceCommit`. The repository's existing implementation-derived ABI exports and contract sources remain unchanged. Keep that Git commit available when rebuilding. Recursively key-sorted canonical JSON, preserving array order, is hashed with Keccak-256 and checked against each handoff `abiHash`; failures stop the build. `src/canonical.ts` is shared by the exporter and browser verification.

After Vite finishes, `scripts/export.mjs` copies the verified ABIs, enumerates every exported file except the manifest itself, and writes the manifest last. SHA-256 hashes cover the final raw file bytes. It preserves launch ID, chain ID, source commit, attestation hash, contract names/addresses/ABI hashes and the supplied network object. The browser derives `wallet_addEthereumChain` parameters from that object; the build checks that they equal the supplied `walletAddChain` exactly. The supplied attestation is trusted input; this frontend does not implement attestation signature verification.

The network's Uniswap addresses remain unchanged in the manifest. The approved workflow specifically calls for **no in-page swap**. The page explains that GILD comes from swapping Sepolia ETH in the ETH/GILD launch pool using an external Uniswap v4 interface, exposes the token address returned by `GuildDues.token()`, and links to the configured faucet. There are no quote/router/Permit2 calls. The membership approval spender is GuildDues, as required by `pay`.

Do not edit `dist/` by hand. Rebuild after changing source or validated deployment inputs, then run the inventory check. A different deployment requires its own validated handoff and pinned ABIs, not replacement addresses in source.

## Wallets, reads and transactions

- Supports injected EIP-1193 browser wallets and EIP-6963 wallet discovery. Multiple discovered providers have a native selector. No WalletConnect project ID was supplied, so WalletConnect is not configured.
- Reads through the configured public RPC list in order, with a connected wallet fallback only when its chain matches. A block snapshot supplies contract state, member status and expiry calculations. Views refresh every 30 seconds and after transactions; a manual refresh is available.
- Checks RPC chain ID, nonempty code for both deployed contracts and the `GuildDues.token()` binding before enabling transactions. Runtime ABI hashes must match. Failed/stale reads and account/network changes disable signing; old requests cannot replace newer state.
- Shows the full connected address, GILD balance/allowance, current membership and expiry. Amounts use on-chain decimals; balance and allowance show up to four decimal places with exact values in their title text. Dues and totals use exact integer units. Dates are UTC, evaluated against the snapshot's chain timestamp.
- Selects 1–12 periods. Approval replaces the allowance with exactly the selected dues; confirmation and a fresh allowance read precede payment. Payment affects only the connected wallet. Active memberships stack, lapsed memberships restart now, and the five-year limit is checked locally and by simulation.
- `members(offset, limit)` is the only roster data source, with five rows per page. It preserves first-payment order, shows active/lapsed status and includes expired memberships. It does not infer the roster from events.
- Anyone may sweep all accrued GILD to the on-chain immutable treasurer. There is no recipient input. Direct token transfers are included in accrued dues; the treasurer has no admin powers. All these transactions require Sepolia ETH for gas and send no ETH value to GuildDues.
- Every write checks current account/network and fresh state, simulates the call, checks account/network again, then asks the wallet to sign. Progress covers simulation, wallet confirmation, submission, one-confirmation receipts and errors. Explorer links persist for submitted transactions. Cancelled/replaced transactions are not labeled successful; repricing can continue receipt tracking. On timeout, use the explorer and refresh before retrying.
- Disconnect forgets the account in the page. It does not revoke wallet permissions or on-chain allowances. Account/chain events from the wallet remain authoritative.

## Validation

```sh
npm run typecheck --prefix web
npm run build --prefix web
npm run verify --prefix web
npm exec --prefix web -- playwright install chromium
npm test --prefix web
npm run check:rpc --prefix web
node web/scripts/check-browser-live.mjs
```

Playwright downloads are development tooling and must remain outside the submitted files. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an existing worker Chromium binary. On this worker the successful browser commands used:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/worker/.cache/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell npm test --prefix web
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/worker/.cache/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell node web/scripts/check-browser-live.mjs
```

The interaction suite starts its own temporary static server, serves the **production export** under `/ipfs/test-guild/`, exercises the real browser UI with mocked RPC/wallet responses, writes evidence under `docs/evidence/`, and closes the browser and server. Synthetic wallet/roster data exists only in tests. It is never bundled into the site. The separate live browser script uses real public RPCs, no wallet and no transaction calls.

See [validation](../docs/VALIDATION.md), [design](../docs/DESIGN.md), [browser results](../docs/evidence/browser.json), and [live RPC evidence](../docs/evidence/rpc.json). No real approval, payment, sweep or swap was broadcast. Extension wallet prompts, transaction replacement/timeouts, provider fallback under partial outages, Firefox/Safari, physical devices and screen readers remain unverified.

## Scope and packaging

All frontend sources, dependencies and configuration live under `web/`; `package-lock.json` is committed. Dependencies and caches are development-only and excluded by the explicitly budgeted **`web/.gitignore` (maximum 512 bytes)**. Its patterns apply at every nesting level under `web/`. No root ignore/build configuration is modified, no submodules are introduced, and no npm archives/registry mirrors are shipped.

The root `DESIGN.md` acceptance line conflicts with the higher-priority allowed-write-path rule. The complete required design document is delivered as `docs/DESIGN.md`; no root file was created. Publication, IPFS pinning, naming, independent checks and any live transaction testing remain with the publisher/operator.
