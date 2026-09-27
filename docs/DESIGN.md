# Guild interface design

## Overview

Guild is a one-page membership ledger for people using the Sepolia GuildDues experiment. The implemented direction combines a cream paper surface, dark green ink, serif headings and a burgundy primary action. The page groups the membership form with its transaction steps, places treasury information alongside it on wide screens, and puts the permanent roster below. The aesthetic is an implementation choice; the approved brief supplied no visual brand system.

The source of truth is `web/src/styles.css`. `web/src/main.tsx` supplies semantic components and content. Reuse their tokens and patterns rather than adding a separate component library. This document is under `docs/` because root-level writes are outside this assignment's permitted paths.

## Colors

The CSS uses sRGB hex primitives, then semantic role aliases. Only implemented colors are included.

| Semantic token | Value / primitive | Use |
| --- | --- | --- |
| `--page` | `--neutral-100`, `#f5f2eb` | Page, wallet balance inset |
| `--surface` | `--neutral-50`, `#fcfaf5` | Membership panel, inputs |
| `--subtle` | `--neutral-200`, `#eae5db` | Table header and neutral hover |
| `--border` | `--neutral-300`, `#d7d0c3` | Dividers and neutral boundaries |
| `--text` | `--neutral-900`, `#292f29` | Primary text |
| `--muted` | `--neutral-600`, `#68635a` | Descriptions, captions, hints |
| `--accent` / `--accent-hover` | `#793b42` / `#642b32` | Current primary membership action, brand accent |
| `--inverse` | `--neutral-50`, `#fcfaf5` | Filled button/treasury text |
| `--treasury-bg` / `--treasury-muted` | `#303d33` / `#d2d8cd` | Treasury surface and secondary copy |
| `--success` / `--success-bg` | `#365437` / `#e6ece2` | Active membership badge |
| `--warning` / `--warning-bg` | `#76531c` / `#f5e9cc` | Wrong-network notice |
| `--error` / `--error-bg` | `#8a2c21` / `#f7e4df` | RPC/wallet/transaction errors |
| `--focus` | `#1e5ca6` | Focus on light surfaces |

Treasury focus uses `--inverse`; forced-colors mode uses the system `Highlight`. Active/lapsed and transaction statuses always have text as well as color. Light mode is the sole designed theme; a dark theme has not been added.

Measured rendered pairs are recorded in `docs/evidence/browser.json`: muted/page 5.33:1, muted/surface 5.72:1, primary action 8.00:1, active badge 7.04:1, treasury secondary text 7.85:1. These figures apply to the identified pairs, not every possible state or platform.

## Typography

No font downloads are required. The CSS font stacks are:

- Body and controls: Arial, Helvetica, sans-serif; 16px root, 1.55 line-height, weights 400 and 600.
- Display and section headings: Georgia, Times New Roman, serif; weight 400. The hero's final word uses italic. Actual system font availability may differ across devices.
- Addresses: Courier New, monospace; 12px, with wrapping and selectable full values.

Hero `h1` uses `clamp(3.7rem, 6.4vw, 5.25rem)`, line-height .98 and letter-spacing -.055em; mobile overrides are 4.1rem and 3.6rem. Section `h2` uses 2.125rem, 1.15 line-height and -.045em letter-spacing. The treasury heading uses 2.1rem. Numeric display amounts use 2.5rem/3rem serif text.

`--body`, `--small`, `--caption` are 1rem, .875rem, .75rem. Eyebrows are .6875rem, weight 600, uppercase through CSS with .13em spacing. A small decorative seal label is .48rem and is hidden from assistive technology; it carries no unique information. Inputs stay at 1rem. Captions and footnotes use at least 1.5 line-height. Long copy is limited to 45–68 characters where applicable. Headings use balanced wrapping; descriptions use pretty wrapping. Changing numbers use `font-variant-numeric: tabular-nums` globally. UTC dates remain explicit. Addresses use `<bdi>` for direction isolation and `overflow-wrap` to preserve all characters.

## Layout

`.wrap` caps the page at 1200px with 32px inline padding. Spacing tokens are 8, 16, 24, 32 and 48px; related form controls use smaller internal gaps. Main content uses an approximately 1.55:1 form/treasury grid with a 24px gap. Sections are in normal document flow; no fixed header or modal covers content.

| Breakpoint | Implemented behavior |
| --- | --- |
| Above 64rem | Header is one row; form and treasury side by side; paired action buttons |
| At/below 64rem | Navigation wraps; panel padding becomes 24px; period selector and actions stack where space is limited |
| At/below 46rem | Single main column; decorative seal removed; transaction activity appears before treasury; roster rows become wallet-plus-status/date blocks; footer becomes two columns |
| At/below 26rem | 16px page margins, 20px panels, selector and summary values stack, one-column footer |

Logical spacing properties support direction mirroring. Buttons stay inset from the page edge. The table remains a native table with a caption and column headers; its narrow layout preserves the wallet, status and date in each member row. Long addresses wrap rather than disappear behind an ellipsis. Full addresses are available in explorer links; only the header and footer summaries shorten them.

Chromium checks covered 320×800, 390×844, 820×1180 and 1440×1100 with no horizontal overflow. The desktop and mobile screenshots were visually inspected. A 200% root text enlargement and an RTL overflow probe passed. Native browser zoom, translated content and other rendering engines remain unverified.

## Elevation & Depth

The interface is flat and has no drop shadows. Panel backgrounds establish groups; thin borders divide totals, ledger rows and sections. A dashed border makes the idle transaction activity area distinct without implying an interactive control. The treasury's dark surface separates a different task. No blur, background imagery, gradient or overlay affects text contrast.

## Shapes

Panels have 8px radii; buttons 5px; fields and insets 4px. Network/member badges are pills. Numbered steps use 24px circles. The decorative 142px seal uses concentric 1px circles and a static −10° rotation. The shared inline `Mark` SVG is a geometric guild monogram, not a downloaded or generated bitmap. It uses `currentColor` and is decorative wherever adjacent text supplies the name.

## Components

| Component or pattern | Source and behavior |
| --- | --- |
| `Mark` | `main.tsx`; inline SVG brand motif, hidden from accessibility tree |
| `AddressLink` | `main.tsx`; full selectable address, explorer link, descriptive accessible name, external-link cue |
| `.button` | `styles.css`; neutral, `.primary`, `.full`, `.small`, `.sweep`; 46px normal minimum height, 40px compact pagination; native disabled state |
| Membership form | `main.tsx`; native label/select, cost and projected expiry, balance/allowance, two distinct transaction steps; primary emphasis moves from approval to payment |
| `.badge` | Text-labeled active, lapsed, pending or disconnected status; active variant uses success colors |
| `.notice` | Wallet/RPC errors and wrong-chain state; errors use alerts, wrong-chain control provides recovery |
| `.transaction-panel` | Persistent transaction progress, revert/rejection errors and transaction explorer link; routine updates use a stable polite live region |
| Roster | Native table, UTC expiries, empty/loading/unavailable text, previous/next controls; five view-derived records per page |
| `details.get-gild` | Native disclosure; keyboard Enter/Space behavior, external acquisition explanation and verified token address |

Links and native buttons retain their semantics. The skip link becomes visible on focus. Focus rings are 3px with 4px offsets; the dark treasury has a separate light ring. Native select and disclosure controls supply keyboard behavior without custom ARIA widgets. Disabled transaction controls have nearby text explaining prerequisites. Hover treatments are guarded by `(hover: hover)`.

Motion is limited to 120ms button background/press feedback and scale .96, enabled only under `prefers-reduced-motion: no-preference`. There are no entrance animations, autoplay or animated status spinners. Loading uses text. Reflow and transactions do not depend on animation.

## Do's and Don'ts

- Start with `.wrap`, the existing typography and spacing tokens. Keep membership, treasury and roster hierarchy distinct.
- Give the next membership step the filled burgundy action. Keep the secondary step and sweep neutral or outlined.
- Keep the treasurer and selected spend visible before signing. Use the deployment manifest and ABI-derived data rather than a second network map.
- Preserve UTC dates, complete address access, native control labels and explicit error recovery.
- Do not introduce an in-page swap, off-chain membership benefits, custom wallet modal, animation dependency or dark theme without a new product requirement.
- A related future page can reuse `Mark`, `AddressLink`, `.wrap`, `.panel`, `.button`, `.badge` and `.notice`. Add an exported route or retain anchor navigation; static hosting has no server rewrite requirement today.

## Guidance attribution

Design/review guidance: Jakub Krehel's **Better Interface**, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`, [upstream](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface). Documentation method: Paul Bakaus's **Impeccable**, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, [upstream](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md). The supplied pinned guide was consulted as design data. This implementation/documentation does not redistribute the guide or relicense either upstream work.
