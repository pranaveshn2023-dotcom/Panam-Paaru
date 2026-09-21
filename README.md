# Panam Paaru (பணம் பாரு)

> **See Your Money, Control Your Spending**

Panam Paaru ("Look at Your Money") is a real-time personal finance and portfolio tracking platform engineered for high-precision visibility over liquid cashflow, recurring budgets, and multi-asset wealth. Built with a high-contrast Neo-Brutalist design language, it combines atomic double-entry banking accounts, calendar-aware budget cycles, and an intelligent Indian market valuation engine backed by a reactive Convex cloud backend.

---

## Key Highlights

- **Zero-Baseline Ledger**: Clean, verifiable account setup with zero placeholder clutter or synthetic mock balances.
- **Dedicated Server Caching Engine**: Persistent database-backed caching in Convex for Indian Equities (`stockPriceCache`) and Mutual Funds (`mfNavCache`), reducing redundant external API calls while guaranteeing fresh data.
- **IST Market-Hours Engine**: Dynamically synchronizes with the Indian Stock Market (09:15 AM to 03:30 PM IST, Mon–Fri). Features high-frequency 35-second live ticks during active market hours, while completely eliminating wasteful external API polling during weekends, public holidays, and after-hours.
- **Nightly AMC NAV Synchronization**: Specialized 1-hour cache TTL and automated Convex cron jobs scheduled during the nightly AMC NAV publishing window (09:00 PM to 12:00 AM IST) to capture official mutual fund valuations.
- **Calendar-Aware Budget Engine**: Deterministic leap-year and variable month-end rollover calculations (28, 29, 30, and 31-day months) that prevent end-of-month configuration drift.
- **Strict Cloud-First Resilience**: 100% server-authoritative state via Convex. Eliminates fragile browser storage; enforces real-time transactional persistence with a network connectivity guard (`NoInternetScreen`).
- **Universal Statement Ingestion**: Direct client-side parsing of CAMS, KFintech, Zerodha, and Groww statements (PDF, XLSX, CSV) via keyboard shortcut (`Ctrl + U` / `Cmd + U`).
- **Enterprise Privacy & Security**: 6-digit cloud-salted master PIN enforcement with virtual keypad, configurable inactivity screen lockout, and instant numeric privacy blur.

---

## Comparison: Conventional Tools vs. Panam Paaru

| Feature / Workflow | Conventional Tools | Panam Paaru |
| :--- | :--- | :--- |
| **Initial Setup** | Populated with mock data and arbitrary assumptions | Zero-balance initialization using verified user inputs |
| **Branding & Tagline** | Cluttered descriptions with redundant slogans | Clean **Panam Paaru** — *"See your money, control your spending"* |
| **Market Data Caching** | Direct client-side calls or un-cached API flooding | Server-side Convex DB caches (`stockPriceCache` & `mfNavCache`) |
| **Index Benchmarks** | Delayed 15-min third-party quotes or unverified feeds | Official BSE (`m.bseindia.com`) & NSE direct feeds with multi-tier fallback |
| **Trading Hours Logic** | Naive continuous polling 24/7 or manual refresh | Indian Market Hours engine (45s live ticks; 0 calls off-hours/holidays) |
| **Market-Close Settle** | Single arbitrary snapshot or manual daily checking | 3-stage smart settle pipeline (3:15, 3:25, 3:30 PM IST) with match skipping |
| **Mutual Fund NAVs** | Stale end-of-day checks or static entries | Nightly AMC release sync window (9 PM - 12 AM IST) with automated crons |
| **Data Persistence** | Client-side local storage prone to browser cache wipes | Transactional Convex cloud database with instant reactive subscriptions |
| **Offline Resilience** | Fragile offline sync prone to conflicting writes | Cloud-authoritative with proactive `NoInternetScreen` connectivity guard |
| **Statement Processing** | Manual line-by-line spreadsheet entry | Automated file parsing for CAMS/KFintech PDFs, XLSX, and CSV formats |
| **Budget Rollover** | Rigid 30-day approximations causing end-of-month drift | Deterministic calendar snapping for month-end and leap years |
| **Screen Privacy & PIN** | Plaintext access or simple 4-digit client pins | 6-digit master PIN with cloud-salted hashing and quick privacy blur |

---

## Core Architecture and Features

### 1. Unified Command Hubs
The user interface is segmented into four primary operational domains:
- **Overview**: High-level financial telemetry, net worth aggregates, asset allocation breakdowns, recent ledger activity, and rapid action triggers (Income, Expense, Transfer).
- **Cashflow**: Daily financial operations containing the transaction ledger, multi-account manager, recurring budget allocations, and categorical spend analysis.
- **Investments**: Multi-asset portfolio management, profit/loss attribution, allocation distribution metrics, live official index benchmarks (NIFTY 50 / SENSEX), and real-time market status badges.
- **Settings & Security**: 6-digit PIN management, auto-lock timeout configuration, display currency formatting, and real-time Convex cloud connection status.

### 2. Market Timing, Direct Exchange Feeds & Caching Engine

#### Official Direct Exchange Integration (BSE & NSE)
- **BSE SENSEX Official Feed**: Directly ingested from the Bombay Stock Exchange mobile gateway (`https://m.bseindia.com/`), extracting the authentic post-auction settled closing figure and real-time Last Traded Price (LTP). Eliminates the common 15-minute delay found on generic aggregators.
- **NSE NIFTY 50 Feed**: Ingested directly from official National Stock Exchange feeds and verified chart endpoints, guaranteeing exact alignment with national trading terminals.
- **Multi-Tier Resilient Fallback**: In the rare event an official exchange portal experiences network latency, requests seamlessly cascade to secondary chart endpoints without service interruption or UI freezes.
- **Zero Hardcoding Guarantee**: No index prices or holding values are ever hardcoded; all data is dynamically fetched and verified against live exchange calculations.

#### Automated 3-Stage Market Ending Settlement Pipeline
To ensure portfolio valuations and index benchmarks permanently reflect official post-market closing prices without requiring any manual intervention:
- **Stage 1 — Initial Capture at 3:15 PM IST** (`45 9 * * 1-5` UTC): Captures the initial market-ending quote across all active holdings and benchmark indices, storing them in `stockPriceCache`.
- **Stage 2 — Settlement Verification at 3:25 PM IST** (`55 9 * * 1-5` UTC): Compares current live exchange quotes with the stored 3:15 PM values:
  - *If values match*: Marks the day's session as `SETTLED_MATCHED` and **stops/skips the 3:30 PM cron call**, eliminating redundant cloud executions.
  - *If prices shifted* (closing auction adjustments): Refreshes the cache DB with the latest auction prices and schedules Stage 3 to finalize.
- **Stage 3 — Final Close Freeze at 3:30 PM IST** (`0 10 * * 1-5` UTC): Only executes if Stage 2 detected movement; permanently locks the final closing prices until the opening bell at 09:15 AM the next trading day.

#### Indian Stock Market (NSE/BSE) Hours Intelligence
- **Trading Window**: Evaluates current Indian Standard Time (IST, UTC+5:30) against official market hours: Monday through Friday, 09:15 AM to 03:30 PM IST.
- **Holiday Calendar**: Integrated with official NSE/BSE trading holidays (Republic Day, Mahashivratri, Holi, Diwali, etc.).
- **Live Market-Hour Ticks**: During trading hours, the frontend polls on a dynamic heartbeat, matching the server-side cache TTL of 45 seconds.
- **Zero Waste Off-Hours Policy**: When the market is closed, on weekends, or on trading holidays, external API fetching is completely halted. Closing prices are served directly from the persistent `stockPriceCache` table.
- **Dynamic Status Badging**: Displays live visual indicators in the UI:
  - `LIVE MARKET`: Pulsing emerald badge indicating active market hours.
  - `AMC NAV RELEASE`: Amber badge indicating the nightly mutual fund publishing window.
  - `MARKET CLOSED`: Slate badge indicating frozen closing prices.

#### Nightly AMC Mutual Fund Synchronization
- **AMC Release Window**: Indian Asset Management Companies (AMCs) calculate and publish final day NAVs to AMFI between 09:00 PM and 12:00 AM IST on regular trading weekdays.
- **Weekend & Holiday Policy**: On weekends (Saturday and Sunday) and official NSE/BSE holidays, AMCs do not calculate or publish new NAVs. Background crons and API calls are completely halted.
- **Dynamic AMFI TTL**:
  - **Weekday Night Window (21:00 - 24:00 IST)**: 50-minute cache TTL to verify fresh NAV releases on every 1-hour cron cycle.
  - **Daytime (09:15 - 15:30 IST)**: 6.5-hour TTL (NAV does not change intraday).
  - **Weekends & Off-Hours**: 24-hour frozen TTL.
- **Automated Convex Crons**: Built-in scheduled functions (`convex/crons.ts`) run every 1 hour between 9:00 PM and 12:00 AM IST on trading weekdays (Monday through Friday):
  - `21:00 IST` (15:30 UTC)
  - `22:00 IST` (16:30 UTC)
  - `23:00 IST` (17:30 UTC)
  - `00:00 IST` (18:30 UTC)
- **All-User Portfolio Synchronization**: Evaluates all mutual fund schemes held across **every user in the application**, updates `mfNavCache` in-place, and immediately propagates the verified authentic NAV to each user's holdings.

#### High-Efficiency Selective Pricing Architecture
To keep external API calls minimal and eliminate extraneous data fetching:
- **Selective Instrument Tracking**: Live market quotes and current prices (CP) are strictly fetched **only** for instruments the user actually holds in their portfolio or searches within the "Add Investment" modal.
- **Database-Backed Caching**: Leverages persistent `stockPriceCache` and `mfNavCache` tables with indexed lookup by ISIN, symbol, and scheme code.
- **Unique Asset Deduplication & Parallel Sync**: Multiple SIPs or lots of the same scheme/ticker are deduplicated into a single lookup and fetched concurrently in parallel, reducing portfolio sync latency from ~5s down to sub-second.

#### 100% Server-Side Execution
All external fetching (BSE India / NSE India / AMFI portal endpoints), rate-limiting, and candidate scoring execute entirely inside the Convex cloud backend. The client frontend remains clean and decoupled from external scraping mechanisms.

### 3. Multi-Account Management (`convex/wallets.ts`)
Maintains accurate account separation across all asset locations:
- **Supported Account Types**: Bank accounts, physical cash on hand, credit lines, brokerage balances, and dedicated savings wallets.
- **Atomic Fund Transfers**: Double-entry consistency ensuring simultaneous balance adjustments between source and destination accounts.
- **Zero Discrepancy Baseline**: Explicit tracking without arbitrary initial values.

### 4. Calendar-Aware Recurring Budgets (`convex/engine/recurrence.ts`)
Enforces strict budget limits that adapt to real-world calendar constraints:
- **Cadence Options**: Daily, Weekly, Monthly, Quarterly, and Annual intervals.
- **Boundary Handling**: Month-end configurations (e.g., January 31) automatically normalize to February 28/29 and snap back to March 31 without configuration drift.
- **Automatic Allocation**: Systematic deduction from linked funding accounts upon cycle renewal.
- **Utilization Tracking**: Real-time progress indicators displaying remaining headroom against set thresholds.

### 5. Multi-Asset Valuation Engine
Continuously updates portfolio holding values across asset classes:
- **Indian Equities**: Live market pricing for NSE and BSE listed equities with intraday day change tracking.
- **Mutual Funds**: Daily NAV synchronization via the Association of Mutual Funds in India (AMFI) database.
- **Cryptocurrencies**: Dynamic market tracking supporting all coins and tokens via universal CoinGecko search, strictly tracking active user holdings.
- **Bullion & Commodities**: Spot rate tracking for physical gold, silver, Sovereign Gold Bonds (SGB), and commodity ETFs.
- **Market Benchmarks**: Background index polling for official NIFTY 50 and BSE SENSEX performance tracking.

### 6. Universal Statement Ingestion
Eliminates manual portfolio data entry through client-side parsing:
- **Supported Formats**: CAMS CAS PDFs, KFintech PDFs, Zerodha CSV exports, and Groww Excel workbooks (XLSX).
- **Normalization Pipeline**: Automatic identification and mapping of scheme names, folio references, transaction dates, unit counts, acquisition costs, and current valuations.
- **Global Shortcut**: Accessible via `Ctrl + U` (Windows/Linux) or `Cmd + U` (macOS) from any screen.

### 7. Security and Screen Privacy
Designed for secure usage in corporate or public spaces:
- **6-Digit PIN Verification**: Master PIN enforcement backed by cloud-salted SHA-256 hashing, supporting both virtual keypad and physical keyboard input.
- **Inactivity Timeout**: Automated screen lockout with configurable timeouts (Immediate, 1 minute, 5 minutes, 15 minutes).
- **Single-Click Privacy Mask**: Instant obfuscation of monetary values and portfolio metrics across all views.

### 8. Strict Cloud-First Architecture & Connectivity Guard
- **Backend Architecture**: Real-time document subscription and mutation model powered by Convex.
- **Zero Fragmented Local State**: Fragile browser-only local caches have been eliminated in favor of clean, transactional cloud persistence.
- **Proactive Network Blocker (`NoInternetScreen`)**: Automatically detects connectivity loss and prevents desynchronized or orphaned operations, resuming smoothly the moment network connectivity is re-established.

---

## Neo-Brutalist Design System

Panam Paaru features an unapologetic, high-contrast Neo-Brutalist aesthetic designed for tactile clarity and visual weight:
- **Signature Monogram**: Slanted capital 'P' integrated with Bitcoin currency prongs (₿) and an emerald wealth node sparkle.
- **Color Palette**: Electric Sunny Gold (`#FFE600`), Deep Carbon Black (`#121212`), Off-White Parchment (`#FFFDF5`), Emerald Profit Green (`#05DF72`), and Hot Pink Alert (`#FF4D8D`).
- **Typography**: Google Fonts [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) for bold uppercase brand headlines and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) for high-precision financial numerals and telemetry.
- **Tactile UI**: Hard 2px/3px borders, solid drop shadows (`shadow-neo`), and dynamic press transforms (`translate-x-[2px] translate-y-[2px]`).

---

## Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 | UI rendering and component lifecycle management |
| **Language** | TypeScript | Static typing and interface contracts |
| **Build Tool** | Vite | Fast module bundling and local development server |
| **Backend & Database** | Convex | Reactive document database, cloud mutations, actions, and crons |
| **Authentication** | Convex Auth (`@convex-dev/auth`) | Passwordless Google OAuth and email/password authentication |
| **Styling** | Tailwind CSS | Utility-first styling with structured design tokens |
| **Visualizations** | Recharts | Portfolio allocation, asset breakdowns, and cashflow charts |
| **Document Parsing** | PDF.js, XLSX, PapaParse | Client-side statement ingestion and schema mapping |
| **Icons** | Lucide React | Standardized system iconography |

---

## Getting Started

### Prerequisites
- Node.js (v18.0.0 or higher recommended)
- npm (v9.0.0 or higher)
- Convex Account and CLI

### Installation

1. Clone the repository:
```bash
git clone https://github.com/pranaveshn2023-dotcom/Panam-Paaru.git
cd Paanam
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
Create a `.env.local` file in the project root:
```env
VITE_CONVEX_URL="https://<your-project-slug>.convex.cloud"
```

### Running Locally

Execute the backend service and the frontend development server:

```bash
# Terminal 1: Convex local backend synchronization
npx convex dev

# Terminal 2: Vite development server
npm run dev
```

The application will be accessible at `http://localhost:5173`.

### Production Build

To validate TypeScript compilation and generate the production bundle:

```bash
npm run build
```

The compiled output will be generated in the `dist` directory.

---

## Architecture Changelog

### Version 1.3.0 (Current)
- **Official Exchange Index Ingestion**: Integrated direct mobile BSE portal (`m.bseindia.com`) for official SENSEX closing settlement prices and direct NSE feeds for NIFTY 50, guaranteeing 100% precision matching national exchange terminals.
- **3-Stage Market Ending Settlement Pipeline**: Added automated market-close settling crons at 3:15 PM, 3:25 PM, and 3:30 PM IST with match-detection logic that skips redundant calls when prices are already settled.
- **Selective Portfolio Tracking**: Live prices and NAVs are strictly fetched only for active user holdings and searched instruments, eliminating extraneous data queries.
- **Universal Crypto Support**: Upgraded crypto search to support all coins and tokens dynamically via CoinGecko without restricted hardcoded lists.
- **Stale Cache Auto-Purge**: Intelligent detection and replacement of pre-settlement index caches upon market close.

### Version 1.2.0
- **Branding & PWA Alignment**: Set official tagline to *"Panam Paaru - See Your Money, Control Your Spending"*; cleaned up PWA manifest and browser titles.
- **Dedicated Server Caching (`stockPriceCache` & `mfNavCache`)**: Added database-backed persistent caching in Convex to minimize external rate limits.
- **Indian Market Hours & Holiday Engine**: 45-second live tick updates during NSE/BSE market hours (09:15 to 15:30 IST); zero wasteful external API calls on weekends, holidays, and after-hours.
- **Nightly AMC NAV Crons**: Scheduled automated Convex crons at 21:00, 22:00, 23:00, and 00:00 IST to capture freshly published AMFI mutual fund NAVs with a 1-hour active window TTL.
- **Strict Cloud-First Resilience**: Removed fragile client-side offline storage; introduced `NoInternetScreen` to ensure absolute ledger consistency without conflicting offline writes.
- **6-Digit Master PIN**: Upgraded security from 4 digits to 6 digits with cloud-salted verification.

### Version 1.1.0
- Added automated AMFI NAV, equity, and crypto market price synchronization.
- Added live market benchmark monitoring for NIFTY 50 and BSE SENSEX.
- Integrated universal statement ingestion engine supporting CAMS/KFintech PDF, XLSX, and CSV sources.
- Configured keyboard shortcut (`Ctrl + U` / `Cmd + U`) for statement ingestion.

### Version 1.0.0
- Implemented four-hub primary layout: Overview, Cashflow, Investments, and Settings.
- Unified cashflow center combining transactions, account management, and budget allocations.
- Implemented client privacy mode and idle session timeout security.

---

## License

This project is licensed under the ISC License. See the LICENSE file for details.
