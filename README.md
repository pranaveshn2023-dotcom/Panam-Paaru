# ⚡ Panam Paaru — Neo-Brutalist Personal Wealth & Cashflow Operating System

**Panam Paaru** (பணம் பாரு — meaning *"See Your Money"* in Tamil) is a high-speed, transparent personal wealth management platform, cashflow engine, and investment tracker designed for conscious savers and active investors.

Unlike typical personal finance apps that trap your data behind confusing spreadsheet views, arbitrary placeholder defaults, or clunky corporate web forms, Panam Paaru believes in **speed, tactile clarity, and absolute data persistence**. It provides a 4-hub native app experience with high-contrast Neo-Brutalist design, zero local storage leakage, real-time cloud synchronization, and 100% data durability.

---

## 🌟 Key Features

### 1. 4-Hub Native App Architecture 📱
Eliminates dock clutter by streamlining navigation into 4 focused primary hubs:
- **Home / Overview**: Instant net balance KPI, portfolio valuation, Quick Actions (`Transfer`, `+ Income`, `- Expense`), Smart Accounts carousel, and active budgets preview.
- **Expenses & Cashflow Hub**: A unified daily cashflow command center with a tactile segmented controller switching between Transactions, Accounts & Wallets, Budgets & Pockets, and Spending Flow.
- **Investments & Wealth Hub**: Real-time market tracking, stock quotes, mutual fund NAV updates, portfolio growth chart, asset allocation, and instant statement file importing.
- **Settings & Security**: Hardware-accelerated tactile PIN lock, inactivity auto-lock, currency preference switcher, and live cloud sync status.

### 2. Calendar-Aware Recurring Budget Engine 🔄
Traditional budget trackers use simple 30-day timers that drift over time. Panam Paaru implements a deterministic, calendar-aware recurrence engine:
- **Supported Cycles**: Daily, Weekly, Monthly, Quarterly, and Annually.
- **Month-End Clamping**: Properly handles variable month lengths (e.g., January 31st renews on February 28th/29th, then snaps back to March 31st).
- **Source Wallet Auto-Deductions**: When a recurring budget renews or is topped up, capital is automatically deducted from the designated source wallet.
- **Reactive Spend Tracking**: Real-time aggregation of expenses tagged under budget categories within exact period boundaries.

### 3. Atomic Multi-Wallet & Accounts System 👛
Comprehensive multi-account management with clean zero-balance baselines:
- **Dedicated Account Types**: Bank accounts, Physical Cash on Hand, Credit Cards (with revolving credit tracking), Investment Brokerage cash, and Savings Vaults.
- **Atomic Peer-to-Peer Transfers**: Double-entry balance mutations ensuring wallet credits and debits remain synchronized with zero race conditions.
- **Strict Clean Defaults**: No dummy numbers or fabricated mock balances. Every newly created account initializes cleanly at ₹0.00 until funded by the user.

### 4. Real-Time Wealth & Investment Valuation Engine 📈
Live portfolio valuation across Indian equities, mutual funds, gold, crypto, and fixed income:
- **AMFI Mutual Fund Grounding**: Automated scheme code resolution providing official daily Net Asset Values (NAV) for Indian mutual funds.
- **Real-Time Equities**: Retrieves live market quotes for NSE and BSE stocks.
- **Live Benchmark Indices**: Real-time ticker tracking **NIFTY 50** and **BSE SENSEX** with percentage changes, market status, and automatic 45-second background refresh cycles.
- **Portfolio Analytics**: Principal invested basis, current market value, absolute profit/loss, percentage ROI, and interactive visual growth charts.

### 5. Universal Financial Statement Parser Suite 📄
Import complete investment portfolios directly from official bank and broker statements with zero manual entry:
- **Multi-Format Ingestion**: Supports PDF account statements (CAMS CAS, KFintech CAS), Excel spreadsheets (Groww, AMC valuation sheets), CSV/TSV exports (Zerodha Console), Word reports, and raw clipboard text.
- **Intelligent Multi-Pass Column Detection**: Uses fuzzy regular expressions to identify scheme names, units, average buy prices, current prices, and total valuations.
- **Automated Asset Classification**: Heuristic categorization detecting stocks, mutual funds, Sovereign Gold Bonds, crypto, and retirement accounts.
- **Quick-Launch Shortcut**: Press <kbd>Ctrl</kbd> + <kbd>U</kbd> (or <kbd>⌘</kbd> + <kbd>U</kbd>) from any screen to launch the importer instantly.

### 6. 100% Cloud-Reactive Persistence & Zero Data Loss 🛡️
- **Direct Cloud State**: All transactions, wallets, budgets, investments, and settings are stored directly in a reactive cloud database.
- **Zero LocalStorage Dependence**: Your financial data never lives in volatile browser storage or session cache. Data survives browser cache purges, restarts, and cross-device sync.
- **Permanent Retention**: Data remains intact until you explicitly edit or delete it.

### 7. Bank-Grade PIN Security & Global Privacy Mode 👁️
- **Tactile PIN Security**: On-screen keypad with haptic feedback and full physical keyboard numpad support.
- **Inactivity Auto-Lock**: Configurable lock timers (Immediate, 1 min, 5 min, 15 min) triggering screen overlays on window blur or idle timeout.
- **1-Click Global Privacy Mode**: Persistent eye icon (`👁`) in the top navigation bar instantly masks all sensitive monetary values and balances across every screen with bullet characters (`••••••`).

### 8. High-Contrast Neo-Brutalist Design System 🎨
An unapologetic, high-contrast visual identity designed for maximum legibility, tactile feedback, and engagement:
- Solid 2px to 3px pure black borders.
- Hard 4px box-shadow offsets with zero blur.
- Vibrant primary accents (Cyber Yellow, Electric Cyan, Neon Green, Hot Pink) over a warm off-white canvas.
- Haptic-like button depression states (`translate(2px, 2px)`).

---

## 🆕 Changelog

### v2.1 — September 2026 (4-Hub Native App Architecture, Unified Expenses Hub & Persistent Baseline Overhaul)
- 📱 **Streamlined 4-Hub Native Architecture**: Consolidated the interface from 7 cluttered docks into 4 focused primary hubs (`Home`, `Expenses`, `Invest`, `Settings`) for a true native mobile app experience.
- 💸 **Unified Expenses & Cashflow Hub**: Introduced a top segmented control seamlessly switching between Transactions Ledger, Accounts & Wallets, Budgets & Pockets, and Spending Flow without page reloads.
- 🛡️ **Guaranteed Data Durability**: Eliminated legacy balance reset checks to ensure all user-entered balances, transactions, budgets, and investments are permanently persisted in the cloud database until explicitly modified or removed.
- 🧹 **Zero-Balance Account Baseline**: Removed mock and placeholder numbers across all account creation flows; all new accounts initialize cleanly at ₹0.00.
- 📱 **Mobile Touch Target Optimization**: Upgraded bottom navigation dock with 52px thumb-friendly targets, bold typography, and haptic-like active depressions.

### v2.0 — September 2026 (Universal Statement Parser Suite & Live Market Ticker)
- 📄 **Multi-Format Statement Parser**: Launched automated ingestion for CAMS CAS, KFintech CAS, Groww Excel portfolios, Zerodha CSV exports, Word reports, and raw pasted text.
- ⌨️ **Quick-Launch Keyboard Shortcut**: Added global <kbd>Ctrl</kbd> + <kbd>U</kbd> shortcut to trigger statement file upload from any view.
- 📈 **Live Index Ticker**: Integrated real-time NIFTY 50 and SENSEX benchmark index movements with auto-refresh and market status indicators.
- 📊 **MyMoney-Grade Spending Analytics**: Added visual category donut charts, daily flow curves, and an interactive 7-day weekday spending matrix.

### v1.5 — August 2026 (Calendar-Aware Recurring Budgets & Multi-Wallet Transfers)
- 🔄 **Deterministic Budget Recurrence Engine**: Added support for daily, weekly, monthly, quarterly, and annual budget cycles with leap-year and month-end clamping.
- 👛 **Atomic Multi-Wallet System**: Introduced dedicated wallet categories (Bank, Cash, Credit Card, Investment, Savings) with double-entry transfer mutations.
- 💰 **Wallet Auto-Deductions**: Linked recurring budgets and reloadable emergency pockets directly to funding wallets.

### v1.0 — July 2026 (Initial Launch & Security Core)
- ⚡ **Tactile Neo-Brutalist UI**: Complete high-contrast design system with responsive desktop sidebar and mobile navigation dock.
- 🔒 **PIN Security Lock**: Hardware-accelerated on-screen keypad, physical numpad detection, and inactivity auto-lock.
- 👁️ **Global Privacy Mode**: Instant 1-click monetary figure masking across all cards and tables.
- ☁️ **Cloud Database Sync**: Real-time reactive data synchronization across all user devices.

---

*Built with ❤️ for financial sovereignty. See your money. Master your wealth.*
