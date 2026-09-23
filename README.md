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
- **Universal Statement Ingestion**: Direct client-side parsing of CAMS, KFintech, Zerodha, and Groww statements (PDF, XLSX, CSV, and DOCX) via keyboard shortcut (`Ctrl + U` / `Cmd + U`), with 1-click batch undo via `importBatches`.
- **Enterprise Privacy & Security**: 6-digit cloud-salted master PIN enforcement with virtual keypad, configurable inactivity screen lockout, transitional securing session guard, and instant numeric privacy blur.
- **Spending Insights Hub**: Visual analytics containing 6-month income vs. expense trend lines, category distribution breakdowns, and daily burn-rate calculations.
- **XIRR & Performance Tracking**: Extended Internal Rate of Return (`xirr`) tracking per investment holding for accurate annualized return attribution.
- **Intelligent Auto-Maintenance**: On authenticated login, automatically triggers commodity re-classification and deduplicates overlapping investment holdings seamlessly.

---

## Comparison: Conventional Tools vs. Panam Paaru

| Feature / Workflow | Conventional Tools | Panam Paaru |
| :--- | :--- | :--- |
| **Initial Setup** | Populated with mock data and arbitrary assumptions | Zero-balance initialization using verified user inputs |
| **Branding & Tagline** | Cluttered descriptions with redundant slogans | Clean **Panam Paaru** — *"See your money, control your spending"* |
| **Market Data Caching** | Direct client-side calls or un-cached API flooding | Server-side Convex DB caches (`stockPriceCache` & `mfNavCache`) |
| **Index Benchmarks** | Delayed 15-min third-party quotes or unverified feeds | Official BSE (`m.bseindia.com`) & NSE direct feeds with multi-tier fallback |
| **Trading Hours Logic** | Naive continuous polling 24/7 or manual refresh | Indian Market Hours engine (35s live ticks; 0 calls off-hours/holidays) |
| **Market-Close Settle** | Single arbitrary snapshot or manual daily checking | 3-stage smart settle pipeline (3:15, 3:25, 3:30 PM IST) with match skipping |
| **Mutual Fund NAVs** | Stale end-of-day checks or static entries | Midday (12:00–12:30 PM IST) & Nightly (9 PM–12 AM IST) smart sync crons |
| **Data Persistence** | Client-side local storage prone to browser cache wipes | Transactional Convex cloud database with instant reactive subscriptions |
| **Offline Resilience** | Fragile offline sync prone to conflicting writes | Cloud-authoritative with proactive `NoInternetScreen` connectivity guard |
| **Statement Processing** | Manual line-by-line spreadsheet entry | Automated client-side file parsing for CAMS/KFintech PDFs, XLSX, CSV, and DOCX |
| **Batch Import Undo** | Irreversible batch additions; manual cleanup | 1-click atomic batch rollback via `importBatches` registry |
| **Holding Deduplication**| Manual inspection and lot-merging | Automated deduplication routine (`autoDeduplicateExistingHoldings`) on login |
| **Budget Rollover** | Rigid 30-day approximations causing end-of-month drift | Deterministic calendar snapping for month-end and leap years |
| **Screen Privacy & PIN** | Plaintext access or simple 4-digit client pins | 6-digit master PIN with cloud-salted hashing and quick privacy blur |

---

## Core Architecture and Features

### 1. Unified Command Hubs
The user interface is segmented into four primary operational domains:
- **Overview**: High-level financial telemetry, net worth aggregates, asset allocation breakdowns, recent ledger activity, and rapid action triggers (Income, Expense, Transfer).
- **Expenses & Cashflow Hub**: Comprehensive cashflow operations split across 5 specialized sub-tabs:
  - **Transactions**: Full ledger tracking with income, expense, and account transfer entries.
  - **Wallets**: Multi-account liquid asset manager with atomic double-entry transfers.
  - **Budgets**: Recurring and one-time budget allocations with auto-renewal and alert thresholds.
  - **Categories**: Dynamic category management with custom icons, colors, and expenditure statistics.
  - **Insights**: In-depth spending analytics featuring 6-month historical trends, category breakdowns, and daily averages.
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
- **Live Market-Hour Ticks**: During trading hours, the frontend polls on a dynamic heartbeat, matching the server-side cache TTL of **35 seconds**.
- **Zero Waste Off-Hours Policy**: When the market is closed, on weekends, or on trading holidays, external API fetching is completely halted. Closing prices are served directly from the persistent `stockPriceCache` table.
- **Dynamic Status Badging**: Displays live visual indicators in the UI:
  - `LIVE MARKET`: Pulsing emerald badge indicating active market hours.
  - `AMC NAV RELEASE`: Amber badge indicating the nightly mutual fund publishing window.
  - `MARKET CLOSED`: Slate badge indicating frozen closing prices.

#### Automated 3-Stage Mid-Day Mutual Fund NAV Synchronization Pipeline (12:00 PM – 12:30 PM IST)
To capture intra-day or mid-day NAV updates published by AMCs while maintaining high cloud execution efficiency:
- **Stage 1 — Initial Fetch & Match Detection at 12:00 PM IST** (`30 6 * * 1-5` UTC):
  - Fetches the latest published NAVs from official AMFI for all invested mutual fund schemes across all users.
  - Compares the fetched AMFI NAVs with existing values stored in the database (`mfNavCache`).
  - *If no change detected*: Marks the midday session as `SETTLED_NO_CHANGE` (`price: 1`), **terminating both the 12:15 PM and 12:30 PM cron runs early**, moving straight to the nightly sync window.
  - *If changes detected*: Updates `mfNavCache`, propagates the new NAVs to matching user holdings, and sets status to `UPDATED_1200_PENDING_1215` (`price: 0`) so the 12:15 PM verification cron runs.
- **Stage 2 — Verification & Early Termination at 12:15 PM IST** (`45 6 * * 1-5` UTC):
  - Checks if 12:00 PM already settled early; if so, skips immediately.
  - Calls official AMFI API and compares freshly fetched values with current database values.
  - *If fetched values match DB values*: Marks status as `SETTLED_MATCHED_1215` (`price: 1`), **terminates the final 12:30 PM cron**, and moves straight to the night job.
  - *If values still moved*: Updates the database with the latest figures, propagates to holdings, and schedules Stage 3 to finalize.
- **Stage 3 — Final Midday Sync at 12:30 PM IST** (`0 7 * * 1-5` UTC):
  - Only executes if Stage 2 detected continued price movement.
  - Runs final midday synchronization, updates database, marks status as `FINALIZED_1230`, and moves to the nightly sync window.

#### Nightly AMC Mutual Fund Synchronization
- **AMC Release Window**: Indian Asset Management Companies (AMCs) calculate and publish final day NAVs to AMFI between 09:00 PM and 12:00 AM IST on regular trading weekdays.
- **Weekend & Holiday Policy**: On weekends (Saturday and Sunday) and official NSE/BSE holidays, AMCs do not calculate or publish new NAVs. Background crons and API calls are completely halted.
- **Dynamic AMFI TTL**:
  - **Weekday Night Window (21:00 – 24:00 IST)**: 50-minute cache TTL to verify fresh NAV releases on every 1-hour cron cycle.
  - **Daytime (09:15 – 15:30 IST)**: 6.5-hour TTL (NAV does not change intraday).
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
- **Supported Account Types**: Bank accounts, physical cash on hand, credit lines, brokerage balances, dedicated savings wallets, and investment accounts.
- **Atomic Fund Transfers**: Double-entry consistency ensuring simultaneous balance adjustments between source and destination accounts.
- **Zero Discrepancy Baseline**: Explicit tracking without arbitrary initial values.

### 4. Calendar-Aware Recurring Budgets (`convex/engine/recurrence.ts`)
Enforces strict budget limits that adapt to real-world calendar constraints:
- **Cadence Options**: Daily, Weekly, Monthly, Quarterly, Yearly, and One-Time intervals.
- **Boundary Handling**: Month-end configurations (e.g., January 31) automatically normalize to February 28/29 and snap back to March 31 without configuration drift.
- **Automatic Allocation**: Systematic deduction from linked funding accounts upon cycle renewal, with configurable `autoDeductFromWallet` flags.
- **Utilization Tracking**: Real-time progress indicators displaying remaining headroom against set thresholds.
- **Configurable Low-Balance Alerts**: Set alert thresholds by target percentage or exact minimum balance amount.

### 5. Multi-Asset Valuation Engine
Continuously updates portfolio holding values across asset classes:
- **Indian Equities**: Live market pricing for NSE and BSE listed equities with intraday day change tracking.
- **Mutual Funds**: Daily NAV synchronization via the Association of Mutual Funds in India (AMFI) database.
- **Cryptocurrencies**: Dynamic market tracking supporting all coins and tokens via universal CoinGecko search, strictly tracking active user holdings.
- **Bullion & Commodities**: Spot rate tracking for physical gold, silver, Sovereign Gold Bonds (SGB), and commodity ETFs.
- **Fixed Income & Provident Funds**: Support for Fixed Deposits (FD), Recurring Deposits (RD), PPF, and EPF.
- **Real Estate**: Manual property holding valuations and equity attribution.
- **Market Benchmarks**: Background index polling for official NIFTY 50 and BSE SENSEX performance tracking.

### 6. Universal Statement Ingestion & 1-Click Rollback
Eliminates manual portfolio data entry through client-side parsing:
- **Supported Formats**: CAMS CAS PDFs, KFintech PDFs, Zerodha CSV exports, Groww Excel workbooks (XLSX), and Word files (DOCX via Mammoth).
- **Normalization Pipeline**: Automatic identification and mapping of scheme names, folio references, transaction dates, unit counts, acquisition costs, and current valuations.
- **Broker Directory Support** (`src/utils/brokerDirectory.ts`): Built-in identification of brokers, ISIN standards, and ticker formats for high-accuracy statement normalization.
- **1-Click Batch Undo**: Every import generates an entry in `importBatches` tagged with an `importBatchId`, allowing users to undo an entire statement import with a single click.
- **Global Shortcut**: Accessible via `Ctrl + U` (Windows/Linux) or `Cmd + U` (macOS) from any screen.

### 7. Spending Insights (`src/pages/InsightsPage.tsx`)
A dedicated analytical intelligence view embedded into the cashflow hub:
- **Category Spend Distribution**: Visual percentage breakdowns by expense category.
- **Trailing 6-Month Area Chart**: Comparative area charts depicting monthly income vs. expenses powered by Recharts.
- **Daily Average Expense**: Rolling daily burn-rate calculated against elapsed days in the active month.
- **Interactive Month Navigation**: Browse historical months to compare spending patterns over time.

### 8. Security and Screen Privacy
Designed for secure usage in corporate or public spaces:
- **6-Digit PIN Verification**: Master PIN enforcement backed by cloud-salted SHA-256 hashing, supporting both virtual keypad and physical keyboard input.
- **Inactivity Timeout**: Automated screen lockout with configurable timeouts (Immediate, 1 minute, 5 minutes, 15 minutes).
- **Securing Session Guard**: Smooth transitional lock screen (`SecuringSessionScreen`) displayed while PIN sessions initialize.
- **Single-Click Privacy Mask**: Instant obfuscation of monetary values and portfolio metrics across all views.

### 9. Strict Cloud-First Architecture & Connectivity Guard
- **Backend Architecture**: Real-time document subscription and mutation model powered by Convex.
- **Zero Fragmented Local State**: Fragile browser-only local caches have been eliminated in favor of clean, transactional cloud persistence. Legacy local storage keys are automatically purged.
- **Proactive Network Blocker (`NoInternetScreen`)**: Automatically detects connectivity loss and prevents desynchronized or orphaned operations, resuming smoothly the moment network connectivity is re-established.

### 10. Automated Maintenance on Session Start
Every authenticated login triggers background maintenance routines:
- **`initializeUserData`**: Seeds default categories and essential profile preferences for new users.
- **`checkAndRenewRecurringBudgets`**: Checks elapsed recurrence cycles and renews recurring budgets automatically.
- **`autoClassifyCommodities`**: Identifies misclassified holdings and sets proper asset types based on naming heuristics.
- **`autoDeduplicateExistingHoldings`**: Identifies duplicate holdings of identical schemes or tickers and consolidates them seamlessly.

---

## Neo-Brutalist Design System

Panam Paaru features an unapologetic, high-contrast Neo-Brutalist aesthetic designed for tactile clarity and visual weight:
- **Signature Monogram**: Slanted capital 'P' integrated with Bitcoin currency prongs (₿) and an emerald wealth node sparkle.
- **Color Palette**: Electric Sunny Gold (`#FFE600`), Deep Carbon Black (`#121212`), Off-White Parchment (`#FFFDF5`), Emerald Profit Green (`#05DF72`), and Hot Pink Alert (`#FF4D8D`).
- **Typography**: Google Fonts [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) for bold uppercase brand headlines and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) for high-precision financial numerals and telemetry.
- **Tactile UI**: Hard 2px/3px borders, solid drop shadows (`shadow-neo`), and dynamic press transforms (`translate-x-[2px] translate-y-[2px]`).
- **Feedback & Celebrations**: Elegant toast alerts powered by `sonner` and milestone celebrations with `canvas-confetti`.

---

## Technology Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React | 19.2 | UI rendering and component lifecycle management |
| **Language** | TypeScript | 7.0 | Static typing and interface contracts |
| **Build Tool** | Vite | 8.2 | Fast module bundling and local development server |
| **Backend & Database** | Convex | 1.45 | Reactive document database, cloud mutations, actions, and crons |
| **Authentication** | Convex Auth (`@convex-dev/auth`) | 0.0.95 | Passwordless Google OAuth and email/password authentication |
| **Styling** | Tailwind CSS | 4.3 | Utility-first styling with structured design tokens |
| **CSS Integration** | `@tailwindcss/vite` | 4.3 | Native Vite plugin integration for Tailwind CSS v4 |
| **Visualizations** | Recharts | 3.10 | Portfolio allocation, asset breakdowns, and cashflow area charts |
| **Document Parsing** | PDF.js, XLSX, PapaParse | — | Client-side statement ingestion and schema mapping |
| **DOCX Parsing** | Mammoth | 1.12 | Word statement document parsing support |
| **Date Arithmetic** | date-fns | 4.4 | Calendar math, leap-year calculations, and date formatting |
| **Notifications** | Sonner | 2.0 | Non-intrusive, styled toast notification alerts |
| **Celebrations** | canvas-confetti | 1.9 | Confetti burst animations for financial milestones |
| **Class Utilities** | clsx, tailwind-merge | — | Conditional style composition and class conflict resolution |
| **Icons** | Lucide React | 1.38 | Standardized system iconography |

---

## Project Structure

```
Paanam/
├── convex/                        # Convex cloud backend
│   ├── schema.ts                  # Document schema (wallets, transactions, budgets, investments, caches…)
│   ├── auth.ts / auth.config.ts   # Google OAuth & email/password authentication
│   ├── users.ts                   # User profile, preferences, and data initialization
│   ├── wallets.ts                 # Multi-account management and atomic transfers
│   ├── transactions.ts            # Transaction ledger CRUD and financial stats
│   ├── budgets.ts                 # Calendar-aware recurring budget engine
│   ├── categories.ts              # Category management with spend aggregation
│   ├── investments.ts             # Portfolio CRUD, live price sync, and batch imports
│   ├── insights.ts                # Spending analytics queries (category breakdowns, trends)
│   ├── pin.ts                     # 6-digit master PIN verification & hashing
│   ├── crons.ts                   # Automated AMC NAV & market-close settlement crons
│   ├── http.ts                    # HTTP action endpoints
│   └── engine/
│       └── recurrence.ts          # Deterministic budget recurrence & calendar math
│
├── src/
│   ├── App.tsx                    # Root application shell, routing, and data orchestration
│   ├── main.tsx                   # React 19 entry point
│   ├── index.css                  # Global design tokens and Neo-Brutalist base styles
│   │
│   ├── components/
│   │   ├── auth/                  # Authentication screens (sign-in, sign-up)
│   │   ├── budgets/               # Budget creation and editing modals
│   │   ├── categories/            # Category management UI
│   │   ├── investments/           # Investment dashboard, add/edit modals, import modal
│   │   ├── layout/                # Header, Sidebar, BottomNav
│   │   ├── notifications/         # Notification modal
│   │   ├── pin/                   # PIN lock screen, setup modal, securing session screen
│   │   ├── transactions/          # Transaction form modal
│   │   ├── ui/                    # Shared UI primitives (NoInternetScreen, ToastProvider…)
│   │   └── wallets/               # Wallet creation, editing, and transfer modals
│   │
│   ├── pages/
│   │   ├── OverviewPage.tsx       # Net worth dashboard and quick actions
│   │   ├── ExpensesHubPage.tsx    # Cashflow hub with 5 sub-tabs
│   │   ├── TransactionsPage.tsx   # Full transaction ledger view
│   │   ├── WalletsPage.tsx        # Account list and balances
│   │   ├── BudgetsPage.tsx        # Budget list with progress tracking
│   │   ├── CategoriesPage.tsx     # Category manager with stats
│   │   ├── InsightsPage.tsx       # Spending analytics and trend charts
│   │   ├── InvestmentsPage.tsx    # Portfolio shell (delegates to InvestmentDashboard)
│   │   └── SettingsPage.tsx       # Security, currency, and connectivity settings
│   │
│   ├── context/
│   │   ├── ConvexClientProvider.tsx  # Convex React provider wrapper
│   │   ├── PinLockContext.tsx        # Global PIN lock state and timeout logic
│   │   └── PrivacyContext.tsx        # Global privacy blur toggle
│   │
│   ├── types/
│   │   └── index.ts               # Shared TypeScript interfaces and enums
│   │
│   └── utils/
│       ├── liveMarketService.ts   # Client-side in-memory NAV/price cache & market utilities
│       ├── investmentParser.ts    # Statement file parsing (PDF, XLSX, CSV, DOCX)
│       └── brokerDirectory.ts     # Broker name, ISIN, and ticker alias directory
│
├── index.html                     # Application shell and PWA meta
├── vite.config.ts                 # Vite + React + Tailwind CSS v4 configuration
├── tailwind.config.js             # Tailwind design token extensions
├── tsconfig.json                  # TypeScript compiler configuration
└── vercel.json                    # Vercel SPA deployment rewrite rules
```

---

## Database Schema (Convex)

| Table | Purpose |
| :--- | :--- |
| `wallets` | Multi-account liquid balances (bank, cash, card, wallet, savings, investment) |
| `transactions` | Income, expense, and account transfer ledger entries |
| `budgets` | Calendar-aware recurring and one-time budget allocations |
| `investments` | Multi-asset portfolio holdings with ISIN, ticker, scheme code, and XIRR |
| `importBatches` | Statement import batch registry for 1-click undo rollback |
| `categories` | Custom and default spending/income categories with visual attributes |
| `userSecurity` | 6-digit master PIN hash, salt, auto-lock config, and failed attempts |
| `userSettings` | Display currency, currency symbol, month start day, and rollover flag |
| `mfNavCache` | Shared cross-user server-side AMFI mutual fund NAV cache |
| `stockPriceCache` | Shared cross-user server-side NSE/BSE equity and index price cache |

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
# or npm script:
npm run convex:dev

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

### Version 1.4.0 (Current)
- **Spending Insights Hub**: Added dedicated `InsightsPage` as a fifth sub-tab within the Cashflow hub, featuring 6-month area trend charts (Recharts `AreaChart`), category percentage breakdowns, daily average expense, and month-navigable income/expense summaries.
- **1-Click Batch Undo**: Introduced `importBatches` table to register every statement import. All holdings from an import can be rolled back atomically using the stored `importBatchId`.
- **XIRR Tracking**: Added `xirr` field to investment holdings for per-asset annualized return attribution.
- **Intelligent Auto-Maintenance**: On every authenticated login, auto-runs `autoClassifyCommodities` (re-tags misclassified holdings) and `autoDeduplicateExistingHoldings` (merges duplicate lots).
- **Broker Directory** (`src/utils/brokerDirectory.ts`): Centralized broker name, ISIN, and ticker alias mapping for normalized statement ingestion.
- **DOCX Statement Support**: Added Mammoth (`mammoth`) to the parsing pipeline to support Word document statement imports.
- **Toast Notifications**: Migrated to `sonner` for consistent, styled non-blocking toast feedback across all mutations.
- **Confetti Celebrations**: Integrated `canvas-confetti` for milestone action animations.
- **Updated Major Tooling**: Upgraded to TypeScript 7, Vite 8, Tailwind CSS 4 (with native `@tailwindcss/vite` plugin), Recharts 3, and Lucide React 1.38.
- **Live Market Heartbeat**: Refined active market tick update cadence to 35 seconds.

### Version 1.3.0
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
