# ⚡ PANAM PAARU | பணம் பாரு
### *See Your Money. Master Your Wealth.*

[![React 19](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Convex Cloud](https://img.shields.io/badge/Convex-Cloud_DB-FF5252?style=for-the-badge&logo=convex&logoColor=white)](https://convex.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.2-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS 4](https://img.shields.io/badge/TailwindCSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-FFE600?style=for-the-badge&logo=opensourceinitiative&logoColor=black)](LICENSE)

---

## 📖 Table of Contents
1. [Overview & Vision](#-overview--vision)
2. [Native App Architecture (4 Core Hubs)](#-native-app-architecture-4-core-hubs)
3. [Deep-Dive: Core Technical Subsystems](#-deep-dive-core-technical-subsystems)
   - [Calendar-Aware Recurring Budget Engine](#1-calendar-aware-recurring-budget-engine)
   - [Atomic Multi-Wallet & Accounts System](#2-atomic-multi-wallet--accounts-system)
   - [Real-Time Wealth & Investment Valuation Engine](#3-real-time-wealth--investment-valuation-engine)
   - [Universal Financial Statement Parser Suite](#4-universal-financial-statement-parser-suite)
   - [Security & Global Privacy Mode](#5-security--global-privacy-mode)
4. [Design System: High-Contrast Neo-Brutalism](#-design-system-high-contrast-neo-brutalism)
5. [Tech Stack & Architecture](#-tech-stack--architecture)
6. [System Architecture & Modules](#-system-architecture--modules)
7. [Getting Started (Local Development)](#-getting-started-local-development)
8. [Google OAuth 2.0 & Cloud Setup](#-google-oauth-20--cloud-setup)
9. [Automated Testing](#-automated-testing)
10. [Production Deployment](#-production-deployment)
11. [Keyboard Shortcuts & Pro Tips](#-keyboard-shortcuts--pro-tips)

---

## 🌟 Overview & Vision

**Panam Paaru** (*Tamil: "பணம் பாரு" — "Look at / See your money"*) is an ultra-responsive, cloud-native personal financial operating system. Unlike traditional, sluggish finance apps with generic corporate templates, Panam Paaru pairs a **tactile Neo-Brutalist user interface** with an enterprise-grade reactive reactive backend built on **Convex Cloud DB**.

### Core Tenets
- **100% Cloud-Reactive State**: Zero local storage leakage. Transactions, wallets, budgets, investments, and settings update in real-time across tabs and devices via WebSocket-driven Convex subscriptions.
- **Strict Clean Baselines**: Zero mock or random numbers. New accounts initialize cleanly at ₹0.00 until funded by the user.
- **Native App Feel**: 4 focused hubs with zero dock clutter, thumb-friendly touch targets (min 48px), haptic-like active depressions, and full keyboard accessibility.
- **Multi-Asset Wealth Tracking**: Tracks liquid cash, bank balances, credit cards, mutual funds, Indian equities (NSE/BSE), crypto, and bullion in a single cohesive ledger.

---

## 📱 Native App Architecture (4 Core Hubs)

To ensure the interface behaves like a polished native app rather than a bloated website, Panam Paaru consolidates all functionality into **four primary navigation hubs**:

```
                              ┌─────────────────────────────────┐
                              │      PANAM PAARU APP ROOT       │
                              └────────────────┬────────────────┘
                                               │
             ┌───────────────────┬─────────────┴────────────┬───────────────────┐
             │                   │                          │                   │
             ▼                   ▼                          ▼                   ▼
    ┌─────────────────┐ ┌───────────────────┐      ┌──────────────────┐ ┌───────────────┐
    │ 1. HOME         │ │ 2. EXPENSES HUB   │      │ 3. INVESTMENTS   │ │ 4. SETTINGS   │
    │    (Overview)   │ │    (Cashflow Engine)│    │    (Wealth Engine)│ │    (Security) │
    └─────────────────┘ └─────────┬─────────┘      └──────────────────┘ └───────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┬────────────────────────┐
         ▼                        ▼                        ▼                        ▼
  [ Transactions ]       [ Accounts/Wallets ]     [ Budgets/Pockets ]      [ Spending Flow ]
  • Filter & Search      • Cash, Bank, Cards      • Calendar Cycles        • Category Donut
  • CSV Export           • Atomic Transfers       • Wallet Auto-Deduct     • 7-Day Matrix
  • Category Badges      • Zero Baseline          • Overflow Shield        • Monthly Trends
```

### 1. 🏠 Home / Overview (`overview`)
- **Net Balance & Savings Rate**: Live computation of all liquid assets minus credit balances with instant privacy masking.
- **Smart Accounts Carousel**: Horizontal peek cards for active wallets with quick transfer actions.
- **Quick Action Bar**: Tactile shortcuts for `Transfer`, `+ Income`, and `- Expense`.
- **Budgets Health Monitor**: Live progress bars highlighting active spend vs. remaining limits with visual over-budget indicators.
- **Recent Activity Ledger**: Chronological transaction stream with category icons and timestamps.

### 2. 💸 Expenses & Cashflow Hub (`expenses`)
A unified cashflow command center featuring a top neo-brutalist segmented pill control:
- 📒 **Ledger / Transactions**: Searchable, paginated transaction ledger with filters by type (`Expense`, `Income`, `Transfer`), category, date range, and 1-click CSV export.
- 👛 **Accounts & Wallets**: Manage physical cash, bank accounts, digital wallets, credit cards, and savings vaults. Execute atomic peer-to-peer wallet transfers with instant balance recalculation.
- 🔄 **Budgets & Pockets**: Create calendar-aware recurring budgets and reloadable emergency pockets linked to specific funding wallets.
- 📊 **Spending Flow / Insights**: Visual analytics engine featuring a category distribution donut, expense percentage breakdown bars, daily burn rates, and an interactive 7-day weekday activity matrix.

### 3. 📈 Wealth & Investments Hub (`investments`)
- **Live Indian Market Indices**: Real-time ticker tracking **NIFTY 50** and **BSE SENSEX** with percentage changes, market status, and automatic 45-second background sync.
- **Real-Time Portfolio Valuation**: Tracks principal invested, current market value (CP), absolute profit/loss, and percentage ROI across all holdings.
- **Automated Pricing Engine**: Live quotes for NSE/BSE stocks via Yahoo/Google Finance feeds, and daily official Net Asset Values (NAV) for all Indian Mutual Funds via AMFI.
- **Interactive Portfolio Growth Chart**: Canvas-driven visual growth trajectory with responsive tooltips and period toggles.
- **Universal Statement Importer**: 1-click or `Ctrl+U` statement upload supporting PDFs, spreadsheets, and text.

### 4. ⚙️ Settings & Security Hub (`settings`)
- **4/6-Digit PIN Security**: Hardware-accelerated tactile keypad with SHA-256 cloud verification.
- **Inactivity Auto-Lock**: Configurable lock timers (Immediate, 1 minute, 5 minutes, 15 minutes) triggering screen overlays on window blur or idle timeout.
- **Currency Preferences**: Global currency symbol switcher (`₹` INR, `$` USD, `€` EUR, `£` GBP, `¥` JPY, `د.إ` AED, etc.).
- **Cloud Synchronization Status**: Live indicator showing Convex WebSocket connection and sync state.

---

## 🔬 Deep-Dive: Core Technical Subsystems

### 1. Calendar-Aware Recurring Budget Engine

Traditional budget trackers use simple 30-day timers that drift over time. Panam Paaru implements a **deterministic, calendar-aware recurrence engine**:
- **Supported Recurrence Frequencies**: `daily`, `weekly`, `monthly`, `quarterly`, `annually`.
- **Month-End Clamping**: Properly handles variable month lengths. A monthly budget set on January 31st renews on February 28th (or 29th in a leap year), and accurately snaps back to March 31st.
- **Source Wallet Auto-Deductions**: When a recurring budget renews or is topped up, the allocated capital is automatically deducted from the designated source wallet via an internal mutation, ensuring balance integrity.
- **Reactive Spend Tracking**: Real-time aggregation of expenses tagged under the budget's categories within the exact current period boundaries `[startDate, endDate]`.

### 2. Atomic Multi-Wallet & Accounts System
Located in [`convex/wallets.ts`](file:///c:/Paanam/convex/wallets.ts).

- **Supported Wallet Types**:
  - `bank`: Savings / Current accounts (State Bank of India, HDFC, ICICI, etc.)
  - `cash`: Physical currency on hand
  - `credit_card`: Revolving credit line (deductions count against available credit)
  - `investment`: Brokerage cash balances (Zerodha, Groww, AngelOne)
  - `savings`: Emergency funds and high-yield goal pockets
- **Atomic Peer-to-Peer Transfers**:
  ```typescript
  // Atomically debit source wallet and credit destination wallet
  // preventing race conditions, balance drift, or partial failures
  await ctx.db.patch(sourceWallet._id, { balance: sourceWallet.balance - amount });
  await ctx.db.patch(targetWallet._id, { balance: targetWallet.balance + amount });
  ```
- **Strict Zero-Balance Baseline**: All new accounts, wallets, and user profiles default strictly to `0.00`. No fabricated balances or placeholder data.

### 3. Real-Time Wealth & Investment Valuation Engine
Located in [`convex/investments.ts`](file:///c:/Paanam/convex/investments.ts) & [`src/utils/marketData.ts`](file:///c:/Paanam/src/utils/marketData.ts).

- **AMFI Mutual Fund Integration**: Connects to the official Association of Mutual Funds in India (AMFI) daily database (`https://api.mfapi.in/mf/<schemeCode>`). Automatically resolves scheme codes for funds like *Parag Parikh Flexi Cap*, *HDFC Top 100*, *Quant Small Cap*, updating Current Price (CP) and valuation daily.
- **NSE/BSE Real-Time Equities**: Retrieves live market quotes for Indian equities using Yahoo Finance API (`RELIANCE.NS`, `TCS.NS`, `INFY.NS`).
- **NIFTY 50 & SENSEX Live Indices**: Fetches real-time benchmark index movements with automated 45-second background refresh cycles and market status indicators (Open/Closed).
- **Comprehensive Portfolio Metrics**:
  - Total Invested Basis
  - Current Realized & Unrealized Value
  - Absolute P&L (₹) & Percentage Return (%)
  - Asset Distribution by Class (`Stocks`, `Mutual Funds`, `Gold/SGB`, `Crypto`, `Fixed Income`)

### 4. Universal Financial Statement Parser Suite
Located in [`src/utils/statementParser.ts`](file:///c:/Paanam/src/utils/statementParser.ts).

Import investment portfolios directly from official bank/broker statements with **zero manual entry**:
- **Supported File Formats**:
  - **PDF (`.pdf`)**: CAMS Consolidated Account Statement (CAS), KFintech CAS.
  - **Excel (`.xlsx`, `.xls`)**: Groww Portfolio holdings, AMC Valuation sheets.
  - **CSV / TSV (`.csv`, `.tsv`)**: Zerodha Console holdings, broker exports, simple tabular files with or without headers.
  - **Word (`.docx`, `.doc`)**: Portfolio tables inside Word reports.
  - **Pasted Text**: Copy-paste raw tabular text directly from broker web portals.
- **Intelligent Multi-Pass Column Detection**:
  - Uses fuzzy regular expressions to detect Scheme Name, Units, Average Buy Price, Current Price / NAV, and Total Valuation.
  - Automatically identifies whether an asset is a Stock, Mutual Fund, Sovereign Gold Bond, Crypto, or EPF/PPF based on scheme name classification heuristics.

### 5. Security & Global Privacy Mode
Located in [`src/context/PinLockContext.tsx`](file:///c:/Paanam/src/context/PinLockContext.tsx) and [`src/context/PrivacyContext.tsx`](file:///c:/Paanam/src/context/PrivacyContext.tsx).

- **6-Digit PIN Security**:
  - Verified on the backend using cryptographic SHA-256 hashing with per-user salting.
  - Features a custom Neo-Brutalist on-screen keypad with haptic feedback and full physical keyboard numpad support.
  - Auto-locks upon tab switch or configurable inactivity timeouts.
- **Global Privacy Mode (Eye Toggle)**:
  - Accessible via the persistent eye icon (`👁`) in the top navigation bar.
  - Instantly masks all sensitive balances, account numbers, and portfolio values across every screen with bullet characters (`••••••`), making the app safe to open in public or office environments.

---

## 🎨 Design System: High-Contrast Neo-Brutalism

Panam Paaru employs an unapologetic, high-contrast **Neo-Brutalist** design aesthetic designed for maximum legibility, tactile feedback, and visual flair:

| Design Element | Specification | Tailwind Implementation |
| :--- | :--- | :--- |
| **Borders** | Solid 2px to 3px pure black | `border-[3px] border-[#121212]` |
| **Drop Shadows** | Hard 3px to 5px offsets, zero blur | `shadow-neo` (`box-shadow: 4px 4px 0px #121212`) |
| **Depression State** | 2px translation on press | `active:translate-x-[2px] active:translate-y-[2px]` |
| **Primary Palette** | Cyber Yellow, Electric Cyan, Neon Green, Hot Pink | `#FFE600`, `#00F0FF`, `#05DF72`, `#FF4D8D` |
| **Background Tone** | Warm, eye-comfort off-white canvas | `#FFFDF5` |
| **Typography** | Modern sans-serif headings with high-contrast mono digits | `font-black uppercase tracking-wider` |

---

## 💻 Tech Stack & Architecture

- **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript 5.7](https://www.typescriptlang.org/)
- **Bundler & Tooling**: [Vite 8](https://vitejs.dev/) with fast HMR
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) + Custom Neo-Brutalist CSS tokens (`src/index.css`)
- **Backend & Database**: [Convex Cloud DB](https://convex.dev/) (Reactive real-time document store, serverless TypeScript mutations, scheduled cron tasks)
- **Authentication**: `@convex-dev/auth` with Google OAuth 2.0 and passwordless OTP support
- **Icons**: [Lucide React](https://lucide.dev/)
- **Document & Spreadsheet Parsers**: `pdfjs-dist`, `xlsx`, `mammoth` (Word document parser)
- **Delight & Micro-interactions**: `canvas-confetti`

---

## 🏛️ System Architecture & Modules

Panam Paaru is architected into clean, decoupled subsystem modules:

- **Client Presentation Layer**:
  - **4-Hub Native Experience**: Independent, focused viewport controllers (`Home`, `Expenses Hub`, `Investments`, `Settings`).
  - **Tactile Neo-Brutalist Design Tokens**: High-contrast borders, solid unblurred drop shadows, and responsive layout controllers supporting desktop sidebar, tablet grid, and mobile bottom dock.
  - **Interactive Modals & Sheets**: Forms for rapid transaction logging, budget allocation, atomic wallet transfers, PIN authentication, and statement ingestion.

- **Client State & Security Contexts**:
  - **Security & Idle Lock Controller**: Session resumption verification, window blur monitors, and inactivity timer enforcement.
  - **Global Privacy Guard**: Real-time mask controller obfuscating sensitive monetary metrics with bullet characters across all views on demand.

- **Cloud Backend & Data Tier**:
  - **Reactive Document Store**: Real-time synchronization layer powering live cross-device subscriptions with zero polling.
  - **Deterministic Recurrence Engine**: Calendar-aware budget lifecycle calculator handling irregular month boundaries and wallet auto-deductions.
  - **Atomic Multi-Account Ledger**: Dual-entry balance mutations ensuring wallet credits and debits remain synchronized.
  - **Real-Time Financial Feeds**: Automated market price resolvers connecting Indian equity quotes and daily AMFI mutual fund Net Asset Values (NAV).

- **Universal Document Ingestion Suite**:
  - **Multi-Format Document Extractors**: Multi-pass tabular parsing engine supporting PDFs, spreadsheets, CSV/TSV exports, word documents, and raw clipboard text.
  - **Fuzzy Classification Heuristics**: Automated asset type categorizer detecting stocks, mutual funds, gold bonds, and fixed income.

- **Automated Verification Harness**:
  - **Headless Test Suite**: Independent automated validation runners verifying parser accuracy against real-world statement exports.

---

## 🚀 Getting Started (Local Development)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- [npm](https://www.npmjs.com/) (v9.0.0 or higher)
- A free [Convex Cloud](https://convex.dev/) account

### 2. Clone Repository & Install Dependencies
```bash
git clone https://github.com/pranaveshn2023-dotcom/Panam-Paaru.git
cd Panam-Paaru
npm install
```

### 3. Initialize Convex Cloud Backend
Run the Convex development server in a separate terminal:
```bash
npx convex dev
```
*Note: On your first run, this command will prompt you to log into Convex and automatically create your development project.*

### 4. Start Vite Frontend Development Server
In your primary terminal:
```bash
npm run dev
```

Open your browser to `http://localhost:5173`. You now have a fully operational local instance of Panam Paaru with live backend reactivity!

---

## 🔑 Google OAuth 2.0 & Cloud Setup

To enable seamless 1-click Google Sign-In:

### Step 1: Create OAuth Credentials in Google Cloud Console
1. Navigate to the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials > OAuth Client ID**.
3. Set Application Type to **Web application**.
4. Configure **Authorized JavaScript origins**:
   - Development: `http://localhost:5173`
   - Production: `https://your-production-domain.com`
5. Configure **Authorized redirect URIs**:
   ```
   https://<your-convex-deployment-name>.convex.site/api/auth/callback/google
   ```

### Step 2: Configure Environment Variables in Convex Dashboard
1. Open your [Convex Dashboard](https://dashboard.convex.dev/).
2. Select your deployment, navigate to **Settings > Environment Variables**, and add:
   - `AUTH_GOOGLE_ID`: Your Google OAuth Client ID
   - `AUTH_GOOGLE_SECRET`: Your Google OAuth Client Secret

---

## 🧪 Automated Testing

Panam Paaru includes a dedicated automated testing suite to verify statement parsing across diverse financial institution exports (CAMS, KFintech, Groww, Zerodha, AMC templates, raw CSVs, and pasted clipboard data):

```bash
node parser-tests/run-tests.mjs
```

### Expected Output:
```
=== cams-cas.pdf → 2 holdings — PASS ===
=== groww-portfolio.xlsx → 3 holdings — PASS ===
=== kfin-cas.pdf → 2 holdings — PASS ===
=== manual-no-header.csv → 2 holdings — PASS ===
=== simple-portfolio.csv → 4 holdings — PASS ===
=== title-row-report.csv → 2 holdings — PASS ===
=== user-amc-template.xlsx → 8 holdings — PASS ===
=== zerodha-console.csv → 3 holdings — PASS ===
=== pasted-text → 2 holdings — PASS ===

ALL TESTS PASSED
```

To run a production TypeScript and Vite compilation check:
```bash
npm run build
```

---

## 🚢 Production Deployment

### 1. Deploy Convex Backend to Production
```bash
npx convex deploy --yes
```

### 2. Deploy Frontend to Vercel
1. Link your repository in [Vercel](https://vercel.com).
2. Add your production Convex URL to the environment variables:
   - `VITE_CONVEX_URL`: `https://<your-production-deployment>.convex.cloud`
3. Deploy!

---

## ⌨️ Keyboard Shortcuts & Pro Tips

- <kbd>Ctrl</kbd> + <kbd>U</kbd> (or <kbd>⌘</kbd> + <kbd>U</kbd>): Open the **Statement File Importer** dialog directly from any screen.
- <kbd>Numpad 0-9</kbd>: Enter your security PIN directly from your physical keyboard without clicking on-screen buttons.
- <kbd>👁 Privacy Button</kbd>: Click the eye icon in the top header to instantly blur all monetary figures whenever sharing your screen.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <b>PANAM PAARU</b> — Built for financial sovereignty.
</p>
