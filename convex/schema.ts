import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  // Multi-Account & Wallets System (MyMoney Style)
  wallets: defineTable({
    userId: v.id("users"),
    name: v.string(), // e.g. "HDFC Salary Account", "Cash in Hand", "ICICI Card", "GPay Wallet"
    type: v.union(
      v.literal("bank"),
      v.literal("cash"),
      v.literal("card"),
      v.literal("wallet"),
      v.literal("savings"),
      v.literal("investment")
    ),
    balance: v.number(), // Current available liquid balance
    initialBalance: v.number(), // Starting balance
    color: v.string(),
    icon: v.string(),
    accountNumberLast4: v.optional(v.string()),
    isDefault: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Financial transactions (Income, Expenses, and Wallet-to-Wallet Transfers)
  transactions: defineTable({
    userId: v.id("users"),
    title: v.string(),
    amount: v.number(), // Always stored as positive number (in standard currency units, e.g. 500.50)
    type: v.union(v.literal("income"), v.literal("expense"), v.literal("transfer")),
    category: v.string(),
    date: v.string(), // ISO date string (YYYY-MM-DD or full ISO)
    notes: v.optional(v.string()),
    walletId: v.optional(v.id("wallets")), // Source wallet that paid or received
    transferToWalletId: v.optional(v.id("wallets")), // Destination wallet for transfers
    budgetId: v.optional(v.id("budgets")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_user_type", ["userId", "type"])
    .index("by_user_category", ["userId", "category"])
    .index("by_user_wallet", ["userId", "walletId"]),

  // Calendar-Aware & Reloadable Recurring Budgets / Wallets
  budgets: defineTable({
    userId: v.id("users"),
    name: v.string(), // Target spending limit or allocated pool
    amount: v.number(), // Target spending limit or allocated pool
    initialLoadedAmount: v.optional(v.number()), // Initial loaded capital
    currentLoadedAmount: v.optional(v.number()), // Total loaded funds after top-ups
    category: v.string(),
    recurrence: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("quarterly"),
      v.literal("yearly"),
      v.literal("one_time")
    ),
    isRecurring: v.optional(v.boolean()), // true for recurring cycles, false for one-time setup
    startDate: v.string(), // Anchor ISO date string (e.g. 2026-01-31)
    sourceWalletId: v.optional(v.id("wallets")), // Linked wallet for automatic funding
    autoDeductFromWallet: v.optional(v.boolean()), // Whether to auto-deduct every recurrence
    lastDeductedPeriodIndex: v.optional(v.number()), // Index of last period auto-deducted
    alertThreshold: v.optional(v.number()), // percentage warning threshold e.g. 80%
    lowBalanceThresholdAmount: v.optional(v.number()), // alert when balance remaining is below ₹X
    lowBalanceThresholdPercent: v.optional(v.number()), // alert when remaining balance is below X%
    alertTarget: v.optional(v.union(v.literal("wallet"), v.literal("pocket"))), // whether alert monitors wallet or linked bank account
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_category", ["userId", "category"])
    .index("by_user_wallet", ["userId", "sourceWalletId"]),

  // Investment Portfolio Assets
  investments: defineTable({
    userId: v.id("users"),
    name: v.string(), // e.g. "Parag Parikh Flexi Cap", "Nifty 50 ETF", "HDFC Fixed Deposit"
    assetType: v.union(
      v.literal("mutual_fund"),
      v.literal("stocks"),
      v.literal("fd_rd"),
      v.literal("gold"),
      v.literal("crypto"),
      v.literal("ppf_epf"),
      v.literal("real_estate"),
      v.literal("other")
    ),
    investedAmount: v.number(), // Total invested capital
    currentValue: v.number(), // Current valuation
    units: v.optional(v.number()), // Quantity / units / shares / grams
    buyPrice: v.optional(v.number()), // Purchase price per unit
    currentPrice: v.optional(v.number()), // Current market price per unit
    schemeCode: v.optional(v.number()), // Official AMFI Scheme Code (100% unique primary identifier for mutual funds)
    isin: v.optional(v.string()), // Official 12-char ISIN (e.g. "INE002A01018" - primary database mapping key for NSE/BSE stocks & mutual funds)
    ticker: v.optional(v.string()), // Live market ticker with exchange suffix (e.g. "RELIANCE.NS" or "TCS.BO")
    sipAmount: v.optional(v.number()), // Monthly SIP amount if active
    sipDay: v.optional(v.number()), // Day of month for SIP (1-28)
    subType: v.optional(v.string()), // e.g. "Equity Mutual Fund", "Hybrid Mutual Fund", "Debt Mutual Fund"
    sector: v.optional(v.string()), // e.g. "Banking & Finance", "Information Technology", "Energy"
    broker: v.optional(v.string()), // e.g. "Zerodha", "Groww", "CAMS", "KFintech"
    importBatchId: v.optional(v.string()), // Id for 1-click batch undo
    xirr: v.optional(v.string()), // e.g. "17.3%", "26.81%", "-6.15%"
    notes: v.optional(v.string()),
    manualPrice: v.optional(v.boolean()), // true if user manually set/corrected NAV/CP
    manualPriceUpdatedAt: v.optional(v.number()), // timestamp of when manual price was set (expires next day)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_asset_type", ["userId", "assetType"])
    .index("by_user_batch", ["userId", "importBatchId"])
    .index("by_scheme_code", ["schemeCode"])
    .index("by_isin", ["isin"]),

  // Statement & Portfolio Import Batches for 1-Click Rollback / Undo
  importBatches: defineTable({
    userId: v.id("users"),
    fileName: v.string(),
    broker: v.optional(v.string()),
    type: v.union(v.literal("investments"), v.literal("transactions")),
    itemCount: v.number(),
    totalValue: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_created", ["userId", "createdAt"]),

  // Custom and Default Categories
  categories: defineTable({
    userId: v.id("users"),
    name: v.string(),
    type: v.union(v.literal("income"), v.literal("expense")),
    color: v.string(),
    icon: v.string(),
    isCustom: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "type"]),

  // 6-Digit PIN Security Lock Cloud Storage (Zero local storage persistence)
  userSecurity: defineTable({
    userId: v.id("users"),
    pinEnabled: v.boolean(),
    pinLength: v.optional(v.union(v.literal(4), v.literal(6))),
    pinHash: v.string(), // SHA-256 / PBKDF2 hash of PIN with salt
    pinSalt: v.string(),
    autoLockTimeoutMs: v.number(),
    failedAttempts: v.number(),
    lastFailedAttemptAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // User Cloud Preferences (Currency, Month Start Day, etc.)
  userSettings: defineTable({
    userId: v.id("users"),
    currency: v.string(), // "INR", "USD", "EUR", "GBP"
    currencySymbol: v.string(), // "₹", "$", "€", "£"
    monthStartDay: v.number(), // 1 - 31
    budgetRollover: v.boolean(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Official AMFI India Mutual Fund NAV Cache Database
  // Real NAVs sourced strictly from AMFI / mfapi.in once daily (after 11 PM IST)
  // Shared cross-user cache to eliminate repetitive external API tapping
  mfNavCache: defineTable({
    schemeCode: v.number(), // Official AMFI Scheme Code (e.g. 120503)
    schemeName: v.string(), // Official AMFI scheme name
    nav: v.number(), // Official AMFI NAV per unit
    navDate: v.string(), // Official date of published NAV (e.g. "17-Sep-2026")
    prevNav: v.optional(v.number()), // Previous day's NAV for day change calculation
    searchKey: v.string(), // Normalized lowercase search string for precision matching
    isin: v.optional(v.string()), // Official ISIN for mutual fund scheme (e.g. "INF879O01027")
    lastFetchedAt: v.number(), // Timestamp when fetched from AMFI
  })
    .index("by_scheme_code", ["schemeCode"])
    .index("by_search_key", ["searchKey"])
    .index("by_isin", ["isin"])
    .index("by_last_fetched", ["lastFetchedAt"]),

  // Dedicated Stock & Equity Cache Database (NSE/BSE & Global)
  // Updates every 35 seconds during trading hours (09:15 - 15:30 IST Mon-Fri)
  // Freezes closing prices during non-market hours, weekends, and public holidays
  stockPriceCache: defineTable({
    isin: v.optional(v.string()), // Official 12-char ISIN (e.g. "INE002A01018" - primary database mapping key)
    symbol: v.string(), // Official or resolved ticker symbol (e.g. "RELIANCE.NS", "TCS.NS", "^NSEI")
    name: v.string(), // Holding name / asset name
    price: v.number(), // Current Price (CP) / Last Traded Price (LTP)
    prevClose: v.optional(v.number()), // Previous trading session's close price
    change: v.optional(v.number()), // Nominal day price change
    changePercent: v.optional(v.number()), // Percentage day price change
    searchKey: v.string(), // Normalized lowercase search key
    lastFetchedAt: v.number(), // Timestamp in milliseconds
  })
    .index("by_isin", ["isin"])
    .index("by_symbol", ["symbol"])
    .index("by_search_key", ["searchKey"])
    .index("by_last_fetched", ["lastFetchedAt"]),
});

