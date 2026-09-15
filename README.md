# Panam Paaru (பணம் பாரு)

Personal Wealth Dashboard and Cashflow Management Engine

Panam Paaru ("Look at Your Money") is a real-time personal finance and portfolio tracking platform engineered for high-precision visibility over net worth, cashflow, and investments. It consolidates banking accounts, multi-asset portfolios, and calendar-aware recurring budgets into a unified, reactive interface.

---

## System Overview

Traditional personal finance tools often suffer from stale manual data entry, complex multi-page navigation, or fragile browser storage. Panam Paaru solves these limitations through:

1. **Zero-Baseline Initialization**: Clean ledger state upon account creation without synthetic dummy records or default placeholder clutter.
2. **Real-Time Valuation**: Automated price feeds for mutual funds, equities, bullion, and digital assets.
3. **Automated Statement Ingestion**: Direct extraction and parsing of CAMS, KFintech, and brokerage statements (PDF, XLSX, CSV).
4. **Calendar-Aware Budget Cycles**: Accurate leap-year and variable month-end rollover logic (28, 29, 30, and 31-day months).
5. **Reactive Cloud Persistence**: Distributed, transactional cloud persistence powered by Convex, eliminating cache-wipe vulnerabilities.
6. **Local Privacy Controls**: Quick-toggle numeric masking and inactivity-based PIN locks for shared screen environments.

---

## Comparison: Conventional Tools vs. Panam Paaru

| Feature / Workflow | Conventional Tools | Panam Paaru |
| :--- | :--- | :--- |
| Initial Setup | Populated with mock data and arbitrary assumptions | Zero-balance initialization using verified user inputs |
| Investment Valuation | Manual quote lookups and manual price updates | Automated synchronization via official AMFI and market APIs |
| Statement Processing | Manual line-by-line spreadsheet entry | Automated file parsing for PDF, XLSX, and CSV formats |
| Budget Rollover | Rigid 30-day approximations causing end-of-month drift | Deterministic calendar snapping for month-end and leap years |
| Screen Privacy | Full balances permanently visible on screen | Instant privacy toggle masking values to fixed placeholders |
| Data Persistence | Client-side local storage susceptible to browser cache clearance | Convex transactional cloud backend with multi-device sync |

---

## Core Architecture and Features

### 1. Unified Command Hubs
The user interface is segmented into four primary operational domains:
- **Overview**: High-level financial telemetry, total balance aggregates, portfolio valuations, and rapid action triggers (Income, Expense, Transfer).
- **Cashflow**: Daily financial operations containing the transaction ledger, account manager, recurring budget allocations, and categorical spend analysis.
- **Investments**: Multi-asset portfolio management, profit/loss attribution, allocation distribution metrics, and live index benchmarks.
- **Settings & Security**: PIN management, auto-lock timeout configuration, display currency formatting, and real-time backend connection status.

### 2. Multi-Account Management
Maintains accurate account separation across all asset locations:
- **Supported Account Types**: Bank accounts, physical cash on hand, credit lines, brokerage balances, and dedicated savings wallets.
- **Atomic Fund Transfers**: Double-entry consistency ensuring simultaneous balance adjustments between source and destination accounts.
- **Zero Discrepancy Baseline**: Explicit tracking without arbitrary initial values.

### 3. Calendar-Aware Recurring Budgets
Enforces strict budget limits that adapt to real-world calendar constraints:
- **Cadence Options**: Daily, Weekly, Monthly, Quarterly, and Annual intervals.
- **Boundary Handling**: Month-end configurations (e.g., January 31) automatically normalize to February 28/29 and snap back to March 31 without configuration drift.
- **Automatic Allocation**: Systematic deduction from linked funding accounts upon cycle renewal.
- **Utilization Tracking**: Real-time progress indicators displaying remaining headroom against set thresholds.

### 4. Automated Asset Valuation Engine
Continuously updates portfolio holding values against primary market sources:
- **Mutual Funds**: Daily NAV synchronization via the Association of Mutual Funds in India (AMFI) database.
- **Indian Equities**: Live market pricing for NSE and BSE listed equities.
- **Cryptocurrencies**: Market data tracking for major tokens via CoinGecko feeds.
- **Bullion**: Valuation tracking for physical gold and Sovereign Gold Bonds (SGB) based on current spot rates.
- **Market Benchmarks**: Background index polling for NIFTY 50 and BSE SENSEX performance tracking.

### 5. Universal Statement Ingestion
Eliminates manual portfolio data entry through client-side parsing:
- **Supported Formats**: CAMS CAS PDFs, KFintech PDFs, Zerodha CSV exports, and Groww Excel workbooks (XLSX).
- **Normalization Pipeline**: Automatic identification and mapping of scheme names, folio references, transaction dates, unit counts, acquisition costs, and current valuations.
- **Global Shortcut**: Accessible via Ctrl + U (Windows/Linux) or Cmd + U (macOS) from any screen.

### 6. Security and Screen Privacy
Designed for secure usage in corporate or public spaces:
- **PIN Verification**: 4-digit master PIN enforcement with virtual keypad and physical keyboard support.
- **Inactivity Timeout**: Automated screen lockout with configurable timeouts (Immediate, 1 minute, 5 minutes, 15 minutes).
- **Single-Click Privacy Mask**: Instant obfuscation of monetary values and portfolio metrics across all views.

### 7. Reactive Cloud Synchronization
- **Backend Architecture**: Real-time document subscription and mutation model powered by Convex.
- **State Integrity**: Eliminates reliance on unpersisted client-side cache or vulnerable local storage.
- **Cross-Platform Parity**: Instant updates reflected concurrently across desktop, tablet, and mobile browsers using cloud sync.

---

## Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| Frontend Framework | React 19 | UI rendering and component lifecycle management |
| Language | TypeScript | Static typing and interface contracts |
| Build Tool | Vite | Fast module bundling and local development server |
| Backend & Database | Convex | Real-time reactive document database and server functions |
| Styling | Tailwind CSS | Utility-first styling with structured design tokens |
| Visualizations | Recharts | Portfolio allocation and cashflow trajectory charts |
| Document Parsing | PDF.js, XLSX, CSV | Client-side statement ingestion and schema mapping |
| Icons | Lucide React | Standardized system iconography |

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

## Release Notes

### Version 1.0.0
- Implemented four-hub primary layout: Overview, Cashflow, Investments, and Settings.
- Unified cashflow center combining transactions, account management, and budget allocations.
- Integrated automated AMFI NAV, equity, and crypto market price synchronization.
- Added client-side universal statement ingestion engine supporting PDF, XLSX, and CSV sources.
- Configured keyboard shortcut (Ctrl + U / Cmd + U) for statement ingestion.
- Added live market benchmark monitoring for NIFTY 50 and BSE SENSEX.
- Implemented client privacy mode and idle session timeout security.

---

## License

This project is licensed under the ISC License. See the LICENSE file for details.
