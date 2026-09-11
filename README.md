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
3. [Key Capabilities & Subsystems](#-key-capabilities--subsystems)
   - [Calendar-Aware Recurring Budget Engine](#1-calendar-aware-recurring-budget-engine)
   - [Atomic Multi-Wallet & Accounts System](#2-atomic-multi-wallet--accounts-system)
   - [Real-Time Wealth & Investment Valuation](#3-real-time-wealth--investment-valuation)
   - [Universal Financial Statement Parser](#4-universal-financial-statement-parser)
   - [Security & Global Privacy Mode](#5-security--global-privacy-mode)
4. [Design System: High-Contrast Neo-Brutalism](#-design-system-high-contrast-neo-brutalism)
5. [Tech Stack](#-tech-stack)
6. [Getting Started](#-getting-started)
7. [Authentication Setup](#-authentication-setup)
8. [Keyboard Shortcuts & Pro Tips](#-keyboard-shortcuts--pro-tips)

---

## 🌟 Overview & Vision

**Panam Paaru** (*Tamil: "பணம் பாரு" — "Look at / See your money"*) is an ultra-responsive, cloud-native personal financial operating system. Unlike traditional finance apps with generic corporate templates, Panam Paaru pairs a **tactile Neo-Brutalist user interface** with an enterprise-grade reactive cloud database.

### Core Tenets
- **100% Cloud-Reactive State**: Transactions, wallets, budgets, investments, and settings update in real-time across tabs and devices via WebSocket subscriptions.
- **Strict Clean Baselines**: Zero mock or random numbers. New accounts initialize cleanly at ₹0.00 until funded by the user.
- **Native App Feel**: 4 focused hubs with zero dock clutter, thumb-friendly touch targets, tactile press animations, and full keyboard accessibility.
- **Multi-Asset Wealth Tracking**: Tracks liquid cash, bank balances, credit cards, mutual funds, equities, crypto, and bullion in a single cohesive ledger.

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

### 1. 🏠 Home / Overview
- **Net Balance & Savings Rate**: Live computation of all liquid assets minus credit balances with instant privacy masking.
- **Smart Accounts Carousel**: Horizontal peek cards for active wallets with quick transfer actions.
- **Quick Action Bar**: Tactile shortcuts for Transfers, Income, and Expenses.
- **Budgets Health Monitor**: Live progress bars highlighting active spend vs. remaining limits with visual over-budget indicators.
- **Recent Activity Ledger**: Chronological transaction stream with category icons and timestamps.

### 2. 💸 Expenses & Cashflow Hub
A unified cashflow command center featuring an intuitive segmented control:
- 📒 **Ledger / Transactions**: Searchable transaction ledger with filters by type (Expense, Income, Transfer), category, date range, and 1-click CSV export.
- 👛 **Accounts & Wallets**: Manage physical cash, bank accounts, digital wallets, credit cards, and savings vaults. Execute atomic peer-to-peer wallet transfers with instant balance recalculation.
- 🔄 **Budgets & Pockets**: Create calendar-aware recurring budgets and reloadable emergency pockets linked to specific funding wallets.
- 📊 **Spending Flow / Insights**: Visual analytics engine featuring a category distribution donut, expense percentage breakdown bars, daily burn rates, and an interactive 7-day weekday activity matrix.

### 3. 📈 Wealth & Investments Hub
- **Live Market Indices**: Real-time ticker tracking major indices with percentage changes, market status, and automated background sync.
- **Real-Time Portfolio Valuation**: Tracks principal invested, current market valuation, absolute profit/loss, and percentage ROI across all holdings.
- **Automated Pricing Engine**: Live quotes for equities and daily official Net Asset Values (NAV) for mutual funds.
- **Interactive Portfolio Growth Chart**: Visual growth trajectory with responsive tooltips and period toggles.
- **Universal Statement Importer**: Quick-launch statement upload supporting multiple formats and raw text.

### 4. ⚙️ Settings & Security Hub
- **PIN Security**: Tactile keypad with cryptographic verification.
- **Inactivity Auto-Lock**: Configurable lock timers triggering screen overlays on window blur or idle timeout.
- **Currency Preferences**: Global currency symbol switcher.
- **Cloud Synchronization Status**: Live indicator showing cloud connection and sync state.

---

## 🔬 Key Capabilities & Subsystems

### 1. Calendar-Aware Recurring Budget Engine
Traditional budget trackers use simple 30-day timers that drift over time. Panam Paaru implements a deterministic, calendar-aware recurrence engine:
- **Supported Recurrence Frequencies**: Daily, Weekly, Monthly, Quarterly, and Annually.
- **Month-End Clamping**: Properly handles variable month lengths (e.g. Jan 31 renews on Feb 28/29, then snaps back to Mar 31).
- **Source Wallet Auto-Deductions**: When a recurring budget renews or is topped up, capital is automatically deducted from the designated source wallet.
- **Reactive Spend Tracking**: Real-time aggregation of expenses tagged under the budget's categories within the exact current period boundaries.

### 2. Atomic Multi-Wallet & Accounts System
- **Supported Account Types**:
  - Bank Accounts (Checking / Savings)
  - Physical Cash on Hand
  - Credit Cards (Revolving credit lines)
  - Investment Wallets (Brokerage balances)
  - Savings Vaults (Emergency funds and goals)
- **Atomic Peer-to-Peer Transfers**: Double-entry balance mutations ensuring wallet credits and debits remain synchronized without race conditions.
- **Strict Zero-Balance Baseline**: All new accounts initialize cleanly at zero.

### 3. Real-Time Wealth & Investment Valuation
- **Mutual Fund Integration**: Connects to official daily databases to resolve scheme codes, updating current price and valuation daily.
- **Real-Time Equities**: Retrieves live market quotes for stocks.
- **Live Benchmark Indices**: Benchmark index movements with automated background refresh cycles.
- **Comprehensive Portfolio Metrics**: Invested basis, current market value, P&L, ROI, and asset distribution.

### 4. Universal Financial Statement Parser
Import investment portfolios directly from official statements with zero manual entry:
- **Supported File Types**: PDF account statements, Excel spreadsheets, CSV/TSV exports, Word reports, and pasted text.
- **Intelligent Multi-Pass Detection**: Fuzzy matching detects scheme names, units, average buy prices, current prices, and valuations.
- **Automated Asset Classification**: Heuristics detect stocks, mutual funds, gold, crypto, and fixed income.

### 5. Security & Global Privacy Mode
- **PIN Security**: Custom on-screen keypad with haptic feedback and physical keyboard numpad support. Auto-locks upon tab switch or inactivity.
- **Global Privacy Mode (Eye Toggle)**: Accessible via the persistent eye icon in the navigation bar. Instantly masks sensitive balances and metrics with bullet characters across every screen.

---

## 🎨 Design System: High-Contrast Neo-Brutalism

Panam Paaru employs an unapologetic, high-contrast **Neo-Brutalist** design aesthetic designed for maximum legibility, tactile feedback, and visual flair:

| Design Element | Specification | Visual Feel |
| :--- | :--- | :--- |
| **Borders** | Solid 2px to 3px pure black | Distinct, crisp separation |
| **Drop Shadows** | Hard 3px to 5px offsets, zero blur | High-tactile physical cards |
| **Depression State** | 2px translation on press | Physical button tactile feel |
| **Primary Palette** | Cyber Yellow, Electric Cyan, Neon Green, Hot Pink | Vibrant, engaging accents |
| **Background Tone** | Warm off-white canvas | Eye-comfort high contrast |
| **Typography** | Modern sans-serif headings with high-contrast mono digits | Punchy, scannable numbers |

---

## 💻 Tech Stack

- **Frontend Framework**: React 19 + TypeScript
- **Bundler & Tooling**: Vite with fast HMR
- **Styling**: Tailwind CSS + Custom Neo-Brutalist design tokens
- **Backend & Database**: Convex Cloud DB (Reactive real-time document store, serverless functions)
- **Authentication**: Google OAuth 2.0 and passwordless sign-in
- **Icons**: Lucide React

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18.0.0 or higher recommended)
- npm (v9.0.0 or higher)
- A free Convex Cloud account

### 2. Clone & Install
```bash
git clone https://github.com/pranaveshn2023-dotcom/Panam-Paaru.git
cd Panam-Paaru
npm install
```

### 3. Start Development Servers
Start the backend development environment:
```bash
npx convex dev
```

In a second terminal, start the frontend development server:
```bash
npm run dev
```

Open your browser to `http://localhost:5173`.

---

## 🔑 Authentication Setup

To configure Google Sign-In:
1. Create an OAuth 2.0 Client ID in your Google Cloud Console.
2. Add your development URL (`http://localhost:5173`) and production domain to Authorized JavaScript origins.
3. Add your Convex authentication callback URL to Authorized redirect URIs.
4. Set your Google Client ID and Secret in your Convex Dashboard environment variables.

---

## ⌨️ Keyboard Shortcuts & Pro Tips

- <kbd>Ctrl</kbd> + <kbd>U</kbd> (or <kbd>⌘</kbd> + <kbd>U</kbd>): Open the Statement File Importer dialog directly from any screen.
- <kbd>Numpad 0-9</kbd>: Enter your security PIN directly from your physical keyboard.
- <kbd>👁 Privacy Button</kbd>: Click the eye icon in the top header to instantly mask all monetary figures.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  <b>PANAM PAARU</b> — Built for financial sovereignty.
</p>
