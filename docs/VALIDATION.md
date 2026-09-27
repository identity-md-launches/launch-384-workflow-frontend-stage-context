# Guild frontend validation

## Scope and completion

**Complete for the authorized frontend scope.** Source, npm manifest/lockfile, configuration and tests are under `web/`; the built static site and final deployment inventory are under root `dist/`; design and evidence are under `docs/`. The pre-existing deployed Solidity sources and implementation-derived ABIs were preserved. No contracts were redeployed and no real wallet transaction was sent.

The brief's root `DESIGN.md` line conflicts with its overriding allowed-path rule. The full design document is therefore at **`docs/DESIGN.md`**, an explicit path-scope limitation. No root design/config/ignore file was changed. `web/.gitignore` has an explicit 512-byte budget and excludes nested frontend dependency/cache/test-output directories and npm archives. There is no vendored registry or submodule.

The approved workflow defines no in-page swap. Membership uses GILD approval to GuildDues, then `pay(periods)`; all other Uniswap swap/quote/liquidity controls are not applicable. The supplied network's Uniswap addresses are nevertheless preserved unchanged in the runtime manifest. Published URLs, named entrypoints and IPFS CIDs are publisher work, not worker prerequisites.

## Build and deployment integrity

Commands were run with Node 24.21.0 / npm 11.19.0 on 2026-09-27:

| Command/check | Outcome |
| --- | --- |
| Frontend dependency installation with npm, cache in `/tmp/guild-npm-cache` | Passed; manifest and lockfile under `web/`; installation reported zero vulnerabilities |
| `npm run typecheck --prefix web` (also included in build) | Passed; strict TypeScript, no unused local/parameter checks |
| `npm run build --prefix web` | Passed; Vite 8.3.1, React 19.3.0; relative base `./`; manifest generated after export |
| Pinned ABI canonical Keccak validation | Both contracts matched the supplied handoff; raw arrays copied from exact source commit |
| `npm run verify --prefix web` | Passed; all six assets enumerated, exact SHA-256 hashes, exact deployment identifiers/contract set/network object, no symlinks, valid relative paths |
| `cmp` of supplied and preserved deployment/network JSON | Both copies identical |

Deployed source commit: `fdae4f2291346ec7c0970027ef8a575a0aa65693`. ABI hashes:

- LaunchToken: `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee`
- GuildDues: `0409c8784dd297fde9ac6db1a2662142bd1a7568b571948169415f6639b665e9`

The final manifest's SHA-256 is recorded in both browser evidence files to bind the checks to this export. The six declared assets total **560,353 bytes**, excluding the small manifest. The largest file is the main JS bundle, about 530 kB / 162 kB gzip; Vite reports a nonblocking 500 kB chunk advisory. Source, local runtime assets and both ABIs remain complete. This is well below the per-file limit, asset-count limit and HTTP response budget. Candidate tracked-tree totals are recorded separately in `docs/evidence/submission.json`. The original workspace Git directory is read-only; the commit is delivered in `docs/guild-frontend.bundle` with import instructions in `docs/SUBMISSION.md`. The bundle is not a runtime asset.

## Browser and interaction checks

The exact successful commands and browser binary are documented in `web/README.md`. `npm test --prefix web` was run with the worker's existing Chromium headless shell through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. The default Playwright executable revision was not installed, and an initial full Chrome launch failed because crashpad could not initialize in this worker. The supplied headless-shell executable ran successfully; no sandbox permissions or external service were needed.

`web/tests/browser.mjs` served the final static export under **`/ipfs/test-guild/`**. The test harness injected an EIP-1193 wallet and ABI-encoded RPC responses; it did not bypass application handlers or import them as a substitute for browser interactions. All 12 check groups passed in Chromium **154.0.8037.0**, recorded in [browser.json](evidence/browser.json):

1. Static subpath asset/config/ABI loading, disconnected public reads, empty roster, absent-wallet instructions, disabled sweep/next controls.
2. Wrong network disables writes; unknown chain produces switch → add → switch with the exact supplied wallet-add parameters.
3. Period changes update cost; approval spender/amount/token are exact; no ETH value; payment waits for approval; receipt refresh updates balance, allowance and active membership; keyboard approval and sweep work; pagination calls `members(5,5)` and returns to the first page.
4. Active membership renewal stacks; expiry at/before chain time restarts from now; exactly-at-expiry is lapsed; five-year advance is gated.
5. Insufficient balance, rejected connection, rejected transaction, retry and successful recovery.
6. Simulated contract revert prevents signing and shows a decoded reason; a reverted receipt is not shown as successful, and its explorer link remains available.
7. RPC failures disable writes and recover on refresh; absent bytecode, wrong RPC chain and mismatched `token()` binding fail closed.
8. Account and chain events invalidate the prior wallet state and disable inappropriate signing.
9. Wallet account changing during simulation prevents submission at the final pre-signing check.
10. Tampered ABI fails its runtime hash check before controls render.
11. Responsive, keyboard, contrast and automated accessibility checks described below.
12. No browser console/page errors during the mocked suite.

Wallet approve/pay/sweep confirmations and roster entries in test screenshots are synthetic evidence of UI behavior, not live-chain activity.

## Better Interface consolidated review

The pinned workflow and core principles of all six domains were read before implementation. The documentation method was read before writing `docs/DESIGN.md`. Coverage and evidence:

| Domain | Coverage | Evidence / limitations |
| --- | --- | --- |
| Accessibility | **Checked** | Native buttons/select/disclosure, one main landmark and H1, table caption/headers, skip link, labeled inputs, disabled prerequisites, stable status region and alerts. Twelve keyboard focus stops checked; approval/sweep activated with Enter; select and disclosure keyboard interactions passed. Axe WCAG 2 A/AA, 2.1 AA and 2.2 AA tag scans had zero violations at four sizes. Actual screen reader and physical touch device not verified. |
| Layout | **Checked** | Visual desktop/mobile screenshot review; no horizontal overflow at 320, 390, 820 and 1440px widths. 200% root text enlargement and RTL overflow probes passed. Native browser zoom and translated layouts not verified. |
| Writing | **Checked** | Non-refundable dues, 30-day periods, five-year maximum, no back dues, fixed treasury destination/no admin, no off-chain rights, gas requirement and external GILD acquisition are explicit. Errors provide recovery. Contract and transaction links identify destinations. |
| Typography | **Checked** | Source scale/fallbacks/line heights reviewed. Rendered headings, dates, amounts, long addresses and mobile rows inspected; amounts use tabular numerals, full addresses wrap, inputs are at least 16px. Native platform font differences remain unverified. |
| Colors | **Checked** | Computed rendered foreground/background pairs measured; ratios below. Status text accompanies color; actual treasury focus ring inspected in screenshot. No gradients/alpha backgrounds complicate text pairs. Dark mode is not applicable; forced-colors source styles exist but a rendered forced-colors review was not performed. |
| UI | **Checked** | Default, active, lapsed, disconnected, loading, insufficient-funds, rejected, simulation-error, confirmed, empty, unavailable and wrong-chain states exercised. Native focus and responsive states inspected. Motion is reduced-motion-aware 120ms press/background feedback; reduced-motion computed duration was zero. Slow-motion animation-panel replay and real extension prompts not verified. |

Rendered viewport coverage: desktop 1440×1100, mobile 390×844, narrow 320×800 and tablet 820×1180. Screenshots reviewed: [desktop](evidence/desktop.png), [mobile](evidence/mobile.png), [keyboard treasury focus](evidence/focus.png), and [real public-state desktop](evidence/live-desktop.png). The mobile screenshot includes the final correction placing transaction feedback before the treasury. These checks do not establish universal accessibility compliance.

Measured contrast ratios from final rendered styles:

| Pair | Ratio |
| --- | --- |
| Muted hero copy on page | 5.33:1 |
| Muted membership copy on panel | 5.72:1 |
| Primary button text/fill | 8.00:1 |
| Active badge text/fill | 7.04:1 |
| Treasury description and fine print on dark panel | 7.85:1 |

### Findings and corrections

| Severity / domain | Source | Finding, correction and recheck |
| --- | --- | --- |
| High / writing, UI | `web/src/chain.ts:30` | During source review, a failed error-cause lookup could label unrelated RPC/revert errors as wallet rejections. Require an actual matching 4001 cause. Browser tests now distinguish rejected requests, RPC failures and decoded simulation reverts. |
| High / UI | `web/src/chain.ts:78` | Receipt success alone can describe a wallet cancellation/replacement as successful membership activity. Track replacement reason and reject cancelled/replaced calls; only fee repricing continues normal success. Code reviewed and typechecked; actual replacement timing remains untested. |
| Medium / typography | `web/src/main.tsx:26` | The initial numeric grouping expression could group fractional digits as thousands. Group the integer part only; exact on-chain amount calculations remain bigint. Final build/browser total and balance formatting passed; fractional display code reviewed. |
| Medium / layout, UI | `web/src/styles.css:201` | Initial narrow layout put transaction activity below the treasury, far from the membership action that triggered it. Move the activity panel first within the narrow right-column stack. Rebuilt; mobile screenshot and overflow/a11y checks passed. |

No unresolved primary-flow or measured contrast failures were observed. Limitations above are unperformed checks, not claimed passes.

## Live-chain read-only evidence

`npm run check:rpc --prefix web` queried each of the three supplied public RPCs. All returned chain **11155111**, nonempty LaunchToken code (**1,784 bytes**), nonempty GuildDues code (**2,741 bytes**), and the expected `GuildDues.token()` binding. See [rpc.json](evidence/rpc.json). Presence/binding checks do not independently prove the deployed bytecode is semantically identical to source.

`node web/scripts/check-browser-live.mjs` loaded the export in Chromium under `/live/guild/` using **real public RPCs**, without a wallet or mocked responses. It read block **11,791,758**, zero roster members and zero accrued GILD, and showed the on-chain treasurer. There were zero console errors or failed HTTP responses. See [browser-live.json](evidence/browser-live.json). These are time-specific observations, not promises of endpoint availability.

## Remaining limits

- No real approval, payment, sweep or swap was broadcast; no wallet keys were accessed. Balance/allowance/write/receipt behavior is browser-tested using mocks, not funded accounts.
- Real extension prompts, EIP-6963 multi-wallet behavior, replacement/receipt-timeout paths and public-to-wallet fallback under partial RPC outages were implemented but not exercised end to end.
- Chromium only; no Firefox, Safari, native 200% zoom, screen-reader session, physical device or rendered forced-colors validation. Automated scans are supplemental evidence.
- The app trusts the supplied handoff and public RPC responses. Reads use one block per snapshot and poll every 30 seconds; displayed status can lag chain changes until refresh. Pre-transaction reads/simulation recheck current state.
- The shared workspace Git metadata is read-only. A portable committed Git bundle is supplied; the publisher must import it into a writable checkout.
- Root `DESIGN.md` could not be created within the authorized paths; equivalent complete content is in `docs/DESIGN.md`.
- Publication, immutable/named-copy HTTP hash checks, IPFS pinning and site naming were not performed. This report is worker evidence, not independent network certification.
